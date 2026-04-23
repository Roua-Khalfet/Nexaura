import os
import re
from typing import List, Tuple
from langchain_core.documents import Document
from langchain_community.utilities import GoogleSerperAPIWrapper

def _calculate_semantic_score(doc: Document) -> float:
    """
    Récupère le score de similarité vectorielle ou de graph.
    Qdrant renvoie un score entre 0 et 1.
    """
    raw_score = float(doc.metadata.get("score", 0.0))
    return min(max(raw_score, 0.0), 1.0)


def _check_graph_consistency(doc: Document, graph) -> float:
    """
    Vérifie si les entités ou la référence du document existent dans le graphe de vérité Neo4j.
    Retourne un score entre 0 et 1.
    """
    if not graph:
        return 0.5

    reference = str(doc.metadata.get("reference", "")).strip()
    
    # S'il y a une référence claire, on vérifie si elle est dans Neo4j
    if reference and reference != "graph" and len(reference) > 3:
        try:
            res = graph.query(
                "MATCH (n) WHERE toLower(n.reference) CONTAINS toLower($ref) RETURN count(n) as c", 
                params={"ref": reference}
            )
            count = res[0]["c"] if res else 0
            if count > 0:
                return 1.0 # Correspondance exacte de la loi !
        except Exception:
            pass
            
    # Sinon, on extrait quelques mots-clés du texte et on vérifie s'ils matchent des nœuds
    text = doc.page_content[:200].lower()
    # Mots de plus de 5 lettres (évite les mots vides)
    keywords = [word for word in re.findall(r"\b[a-z]{6,}\b", text) if word not in ["article", "chapitre", "disposition"]]
    
    if not keywords:
        return 0.5 # Neutre
        
    match_count = 0
    try:
        for kw in keywords[:3]: # On teste max 3 mots-clés pour la performance
            res = graph.query(
                "MATCH (n) WHERE toLower(coalesce(n.description, '')) CONTAINS $kw RETURN count(n) as c", 
                params={"kw": kw}
            )
            if res and res[0]["c"] > 0:
                match_count += 1
    except Exception:
        pass
        
    if not keywords[:3]:
        return 0.5
        
    return match_count / len(keywords[:3])


def _check_web_freshness(doc: Document) -> float:
    """
    Vérifie rapidement via Serper si la loi/référence mentionnée est obsolète.
    """
    reference = str(doc.metadata.get("reference", "")).strip()
    if not reference or reference == "graph":
        return 0.5 # Neutre si pas de référence officielle
        
    serper_key = os.getenv("SERPER_API_KEY", "").strip()
    if not serper_key:
        return 0.5
        
    try:
        search = GoogleSerperAPIWrapper(serper_api_key=serper_key, k=2)
        query = f"\"{reference}\" Tunisie (abrogée OR modifiée OR remplacée)"
        results = search.results(query)
        
        organic = results.get("organic", [])
        snippets = " ".join([item.get("snippet", "") for item in organic]).lower()
        
        # Si le web indique explicitement que c'est abrogé
        if "est abrogé" in snippets or "a été abrogé" in snippets or "remplacé par" in snippets:
            print(f"[FactCheck] ALERTE: {reference} semble obsolète ou abrogée sur le web.")
            return 0.0 # Très mauvais score (obsolète)
            
        return 1.0 # Approuvé, toujours d'actualité
    except Exception as e:
        print(f"[FactCheck] Erreur web freshness: {e}")
        return 0.5

def calculate_document_score(question: str, docs: List[Document], graph) -> List[Tuple[Document, str, float]]:
    """
    Notation hybride et déterministe (Triangulation).
    Remplace l'utilisation pure de l'LLM par un algorithme.
    """
    graded_docs = []
    
    for doc in docs:
        # 1. Pertinence sémantique (Vector/Graph score) - 30%
        semantic = _calculate_semantic_score(doc)
        
        # 2. Véracité GraphRAG (Neo4j) - 40%
        consistency = _check_graph_consistency(doc, graph)
        
        # 3. Fraîcheur Web - 30%
        freshness = _check_web_freshness(doc)
        
        # Score final (sur 100)
        final_score = (semantic * 30) + (consistency * 40) + (freshness * 30)
        
        print(f"[FactCheck] Doc: {doc.metadata.get('reference', 'N/A')} | Sem: {semantic:.2f} | Graph: {consistency:.2f} | Web: {freshness:.2f} => Score: {final_score:.1f}/100")
        
        # Normalisation en float de -1.0 à 1.0 pour compatibilité avec le reste de crag.py
        # 100 -> 1.0, 0 -> -1.0
        normalized = (final_score / 50.0) - 1.0
        
        # Attribution du Grade
        if final_score >= 65.0: # Equivalent à >= 0.3 en scale [-1, 1]
            grade = "CORRECT"
        elif final_score < 40.0: # Equivalent à < -0.2
            grade = "INCORRECT"
        else:
            grade = "AMBIGUOUS"
            
        graded_docs.append((doc, grade, normalized))
        
    return graded_docs
