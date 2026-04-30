# Stress Test GraphRAG (20 questions)

Version basee sur l'etat actuel du graphe local Neo4j (documents=58, chunks=11653, articles=3791).

## Format de validation conseille
- Reponse du systeme
- References retournees (doc_id, article_id, chunk_id)
- Verdict: PASS/FAIL

## Jeux de questions + expected response

| ID | Question de stress test | Expected response (minimum pour PASS) |
|---|---|---|
| 1 | Je lance une startup fintech: est-ce que votre base juridique est bien chargee, avec combien de Documents, Chunks et Articles ? | Doit retourner: Document=58, Chunk=11653, Article=3791. |
| 2 | Avant de me fier aux reponses juridiques, montre-moi la structure des relations principales du graphe. | Doit inclure au minimum: HAS_CHUNK=11653, NEXT_CHUNK=11595, PART_OF_ARTICLE=6012, HAS_ARTICLE=3791, NEXT_ARTICLE=3742, REFERS_TO_DOC=1555, REFERS_TO_ARTICLE=743. |
| 3 | Pour ma startup, je veux savoir la couverture: combien de lois, decrets, codes et circulaires avez-vous ? | Doit inclure: loi=46, decret=5, code=4, circulaire=2, document=1. |
| 4 | Quand je pose une question legale, quelles metadonnees exactes d'un chunk utilisez-vous pour me repondre proprement ? | Doit citer: chunk_id, doc_id, chunk_index, section_level, section_title, source_page_start, source_page_end, content. |
| 5 | Si je fais un audit juridique pour ma startup, quelles contraintes garantissent que les IDs restent stables et tracables ? | Doit mentionner unicite sur Document.doc_id, Chunk.chunk_id, Article.article_id (indexes online). |
| 6 | Dans vos references juridiques, quel article est le plus cite (important pour mes priorites de conformite startup) ? | Doit retourner decret_2021_21_fr::article::48 avec 22 mentions. |
| 7 | Et le deuxieme article le plus cite, pour completer ma veille reglementaire startup ? | Doit retourner loi_89_114::article::12 avec 18 mentions. |
| 8 | Je veux verifier un point fiscal pour ma startup: combien de references pointent vers le decret 2022-79 article 59 ? | Doit retourner 9 mentions. |
| 9 | Sur un cas concret startup (chunk fiscal 0024), quels articles juridiques cibles sont relies ? | Doit retourner exactement 2 cibles: decret_2021_21_fr article 48 et loi_2009_71 article 50. |
| 10 | Pour mon dossier legal startup, donne une preuve textuelle que le chunk 0024 cite bien le decret-loi 2021-21. | Doit contenir un extrait proche de: "... modifie par l'article 48 du decret-loi n° 2021-21 ..." avec source chunk code_droits_procedures_fiscaux_2023::chunk::0024. |
| 11 | Montre-moi un exemple de self-reference juridique (method=present_document) sur une circulaire utile a ma startup. | Doit inclure: source_chunk circulaire_2019_01_fr::chunk::0015 -> target_doc circulaire_2019_01_fr, evidence "article 4 de la presente circulaire". |
| 12 | Pour evaluer la fiabilite de vos liens legaux startup, donne la repartition des method pour REFERS_TO_DOC. | Doit inclure: explicit_article_document=946, explicit_document=438, present_document=171. |
| 13 | Et la repartition des method pour REFERS_TO_ARTICLE, pour verifier la precision article-level ? | Doit inclure: explicit_article_document=583, present_document=160. |
| 14 | Si ma startup verifie le texte 2021-21, combien de documents correspondants avez-vous et lesquels ? | Doit retourner 2 documents: decret_2021_21_fr et decret_2021_21_fr_fixed. |
| 15 | En cas de doublon de source (_fixed), est-ce que votre systeme choisit bien une cible canonique pour ma due diligence startup ? | Expected: oui, il doit preferer la version canonique non _fixed pour la resolution finale (decret_2021_21_fr). |
| 16 | Fais une requete multi-hop sur un cas startup: depuis le chunk 0024, remonte vers article puis document cible. | Expected: chemin valide vers (decret_2021_21_fr, article 48) et (loi_2009_71, article 50). |
| 17 | Donne un exemple cross-doc utile a ma startup: un chunk du code fiscal qui renvoie vers un article de loi cible. | Doit inclure au moins: code_droits_procedures_fiscaux_2023::chunk::0023 -> loi_2006_85::article::69. |
| 18 | Question piege startup: "Trouve l'article de la loi 97-83 cite par le graphe". | Expected: abstention explicite (aucun candidat resolu). Motif attendu: reference unresolved/no_candidate pour loi 97-83 (31 occurrences unresolved). |
| 19 | Question piege startup: "Trouve le decret 77-608 et ses articles cibles". | Expected: abstention explicite (aucun candidat resolu). Motif attendu: unresolved/no_candidate pour decret 77-608 (27 occurrences unresolved). |
| 20 | Question piege startup: "Donne le texte source de la loi 200-83". | Expected: abstention explicite (cette reference est unresolved/no_candidate, 30 occurrences). |

## Regles de scoring rapides
- PASS fort: la reponse contient le bon fait + au moins une reference de preuve (doc_id/article_id/chunk_id).
- PASS minimal: le fait principal est correct meme si citation partielle.
- FAIL: hallucination de document/article absent du graphe, ou mismatch sur les compteurs structurels.

## Requetes de controle recommandees (optionnel)
- Comptage noeuds: `MATCH (d:Document) RETURN count(d)` etc.
- Comptage relations: `MATCH ()-[r:REFERS_TO_ARTICLE]->() RETURN count(r)` etc.
- Cas chunk 0024: traversal sur `code_droits_procedures_fiscaux_2023::chunk::0024`.
