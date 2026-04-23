import logging
from typing import TypedDict, List, Dict, Any
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import SystemMessage, HumanMessage

# Import existing functions
from complianceguard.crag import crag_answer
from complianceguard.ask_question import answer_question, _web_search, _build_llm, _sanitize_answer_text

logger = logging.getLogger(__name__)

# 1. State Definition
class ComplianceState(TypedDict):
    question: str
    has_pdf: bool
    
    crag_answer: str
    crag_sources: List[str]
    crag_metadata: Dict[str, Any]
    
    graphrag_answer: str
    graphrag_sources: List[str]
    
    web_context: str
    web_sources: List[str]
    
    final_answer: str
    final_sources: List[str]

# 2. Nodes (Tools)
def node_crag(state: ComplianceState):
    """Exécute le pipeline CRAG si un PDF est présent."""
    if not state.get("has_pdf"):
        return {
            "crag_answer": "", 
            "crag_sources": [],
            "crag_metadata": {"action": "skipped"}
        }
    
    try:
        logger.info("[LangGraph] Running CRAG tool...")
        ans, sources, metadata = crag_answer(state["question"], enable_web_fallback=False, mode="notebook")
        return {
            "crag_answer": ans, 
            "crag_sources": sources,
            "crag_metadata": metadata
        }
    except Exception as e:
        logger.error(f"[LangGraph] CRAG error: {e}")
        return {
            "crag_answer": "", 
            "crag_sources": [],
            "crag_metadata": {"error": str(e)}
        }

def node_graphrag(state: ComplianceState):
    """Exécute le pipeline GraphRAG (Neo4j + Qdrant global)."""
    try:
        logger.info("[LangGraph] Running GraphRAG tool...")
        ans, sources = answer_question(state["question"], enable_web_fallback=False, mode="kb")
        return {
            "graphrag_answer": ans, 
            "graphrag_sources": sources
        }
    except Exception as e:
        logger.error(f"[LangGraph] GraphRAG error: {e}")
        return {
            "graphrag_answer": "", 
            "graphrag_sources": []
        }

def node_web(state: ComplianceState):
    """Exécute la recherche web (Serper)."""
    try:
        logger.info("[LangGraph] Running Web Scraping tool...")
        context, sources = _web_search(state["question"])
        return {
            "web_context": context, 
            "web_sources": sources
        }
    except Exception as e:
        logger.error(f"[LangGraph] Web Scraping error: {e}")
        return {
            "web_context": "", 
            "web_sources": []
        }

def node_synthesize(state: ComplianceState):
    """Combine les résultats et génère la réponse finale."""
    logger.info("[LangGraph] Synthesizing answers...")
    llm = _build_llm()
    
    parts = []
    sources = []
    
    # CRAG
    if state.get("crag_answer") and "Désolé, je ne trouve pas" not in state["crag_answer"]:
        parts.append(f"--- ANALYSE DES DOCUMENTS UPLOADÉS ---\n{state['crag_answer']}")
        sources.extend(state.get("crag_sources", []))
        
    # GraphRAG
    if state.get("graphrag_answer"):
        parts.append(f"--- ANALYSE DE LA BASE DE CONNAISSANCES INTERNE ---\n{state['graphrag_answer']}")
        sources.extend(state.get("graphrag_sources", []))
        
    # Web
    if state.get("web_context"):
        parts.append(f"--- INFORMATIONS WEB ---\n{state['web_context']}")
        sources.extend(state.get("web_sources", []))
        
    context = "\n\n".join(parts)
    
    if not context.strip():
        return {
            "final_answer": "Désolé, je n'ai pas pu trouver d'informations pertinentes pour répondre à votre question.",
            "final_sources": []
        }
    
    system_prompt = (
        "Tu es ComplianceGuard, un juriste et consultant expert en droit tunisien (notamment le Startup Act). "
        "Tu reçois des éléments de contexte extraits de différentes sources (Documents utilisateurs, Base de graphe interne, Web). "
        "Ton objectif est de fournir une synthèse juridique irréprochable, professionnelle et exploitable.\n\n"
        "RÈGLES STRICTES :\n"
        "1. Ne révèle jamais tes mécanismes internes (ne dis pas 'Selon les documents uploadés' ni 'La base interne indique...'). "
        "Affirme les faits comme un expert sûr de lui.\n"
        "2. Formate toujours ta réponse en markdown propre, divisée exactement en 3 sections :\n"
        "   - **Réponse directe** : Une synthèse claire et sans jargon inutile qui répond immédiatement à la question.\n"
        "   - **Conditions principales** : Les prérequis, critères d'éligibilité ou exceptions légales applicables (sous forme de puces).\n"
        "   - **Étapes pratiques** : La marche à suivre concrète, numérotée, pour appliquer ce droit ou cette procédure.\n"
        "3. Cite précisément les textes de loi fournis dans le contexte (numéro, date, article) sans inventer de références."
    )
    
    human_prompt = f"Question: {state['question']}\n\nContexte combiné:\n{context}\n\nRéponse:"
    
    try:
        response = llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ])
        final_ans = _sanitize_answer_text(response.content)
    except Exception as e:
        logger.error(f"[LangGraph] Synthesis error: {e}")
        final_ans = "Erreur lors de la génération de la synthèse finale."
    
    # Deduplicate sources while preserving order
    unique_sources = []
    for s in sources:
        if s not in unique_sources:
            unique_sources.append(s)
            
    return {
        "final_answer": final_ans, 
        "final_sources": unique_sources
    }

# 3. Graph Definition
def build_compliance_agent():
    workflow = StateGraph(ComplianceState)
    
    workflow.add_node("node_crag", node_crag)
    workflow.add_node("node_graphrag", node_graphrag)
    workflow.add_node("node_web", node_web)
    workflow.add_node("node_synthesize", node_synthesize)
    
    # Parallel execution from START
    workflow.add_edge(START, "node_crag")
    workflow.add_edge(START, "node_graphrag")
    workflow.add_edge(START, "node_web")
    
    # All nodes converge to synthesize
    workflow.add_edge("node_crag", "node_synthesize")
    workflow.add_edge("node_graphrag", "node_synthesize")
    workflow.add_edge("node_web", "node_synthesize")
    
    workflow.add_edge("node_synthesize", END)
    
    return workflow.compile()

# Global agent instance
compliance_agent = build_compliance_agent()
