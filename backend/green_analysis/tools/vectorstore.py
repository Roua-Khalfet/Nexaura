"""
Semantic vector store — FAISS + sentence-transformers for the knowledge base.

Embeds all JSON knowledge (emission factors, certifications, Tunisian programs)
into a FAISS index for semantic similarity search. Replaces keyword-based lookup
with meaning-based retrieval.

On first import the index is built and cached to disk.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.tools import tool
from langchain_huggingface import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "data"
INDEX_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "faiss_index"

_vectorstore: FAISS | None = None


# ---------------------------------------------------------------------------
# Chunking — turn structured JSON into searchable text documents
# ---------------------------------------------------------------------------

def _load_emission_chunks() -> list[Document]:
    """Convert emission_factors.json into text chunks."""
    data = json.loads((DATA_DIR / "emission_factors.json").read_text(encoding="utf-8"))
    docs: list[Document] = []

    # Energy fuels
    fuels = data.get("energy_fuels", {})
    for fuel_name, info in fuels.items():
        text = (
            f"Energy fuel: {fuel_name.replace('_', ' ')}. "
            f"Emission factor: {info.get('emission_factor')} {info.get('unit', '')}. "
            f"Source: {info.get('source', 'N/A')}."
        )
        docs.append(Document(page_content=text, metadata={"source": "emission_factors", "type": "fuel", "id": fuel_name}))

    # Industry sectors
    sectors = data.get("industry_sectors", {})
    for sector_name, info in sectors.items():
        text = (
            f"Industry sector: {sector_name.replace('_', ' ')}. "
            f"CO2 per unit: {info.get('co2_per_unit', 'N/A')} {info.get('unit', '')}. "
            f"Typical annual emissions: {info.get('typical_annual_emissions_kg', 'N/A')} kg CO2. "
            f"Scale: {info.get('scale_assumption', 'N/A')}. "
            f"Energy intensity: {info.get('energy_intensity', 'N/A')}. "
            f"Water usage: {info.get('water_usage', 'N/A')}. "
            f"Key waste: {', '.join(info.get('key_waste', []))}. "
            f"Key environmental risks: {', '.join(info.get('key_risks', []))}."
        )
        docs.append(Document(page_content=text, metadata={"source": "emission_factors", "type": "sector", "id": sector_name, "data": json.dumps(info)}))

    # Water benchmarks
    water = data.get("water_benchmarks", {})
    context = water.pop("_context", "")
    if context:
        docs.append(Document(page_content=f"Tunisia water context: {context}", metadata={"source": "emission_factors", "type": "water_context"}))
    for category, info in water.items():
        items = "; ".join(f"{k}: {v}" for k, v in info.items()) if isinstance(info, dict) else str(info)
        text = f"Water benchmarks for {category}: {items}."
        docs.append(Document(page_content=text, metadata={"source": "emission_factors", "type": "water", "id": category}))

    # Metadata
    meta = data.get("_metadata", {})
    if meta:
        docs.append(Document(
            page_content=(
                f"Tunisia grid emission factor: {meta.get('tunisia_grid_emission_factor_kgCO2_per_kWh', 0.55)} kgCO2/kWh. "
                f"{meta.get('tunisia_grid_note', '')} "
                f"Units: {meta.get('units_note', '')}."
            ),
            metadata={"source": "emission_factors", "type": "metadata"},
        ))

    return docs


def _load_certification_chunks() -> list[Document]:
    """Convert certifications.json into text chunks."""
    data = json.loads((DATA_DIR / "certifications.json").read_text(encoding="utf-8"))
    docs: list[Document] = []

    for cert in data.get("certifications", []):
        text = (
            f"Certification: {cert.get('name', '')} — {cert.get('full_name', '')}. "
            f"Issuing body: {cert.get('issuing_body', '')}. "
            f"Description: {cert.get('description', '')} "
            f"Applicable sectors: {', '.join(cert.get('applicable_sectors', []))}. "
            f"Key requirements: {'; '.join(cert.get('key_requirements', []))}. "
            f"Cost in Tunisia: {cert.get('estimated_cost_tnd', 'N/A')}. "
            f"Timeline: {cert.get('estimated_timeline', 'N/A')}. "
            f"Benefits: {'; '.join(cert.get('benefits', []))}. "
            f"Priority for startups: {cert.get('priority_for_startups', 'N/A')}. "
            f"CBAM relevance: {cert.get('cbam_relevance', 'N/A')}."
        )
        docs.append(Document(page_content=text, metadata={"source": "certifications", "type": "certification", "id": cert.get("id", ""), "data": json.dumps(cert)}))

    # CBAM info
    cbam = data.get("cbam_info", {})
    if cbam:
        text = (
            f"EU CBAM — Carbon Border Adjustment Mechanism. "
            f"Effective: {cbam.get('effective_date', '')}. "
            f"Description: {cbam.get('description', '')} "
            f"Affected sectors: {', '.join(cbam.get('affected_sectors', []))}. "
            f"Impact on Tunisia: {cbam.get('impact_on_tunisia', '')} "
            f"Recommended actions: {'; '.join(cbam.get('recommended_actions', []))}."
        )
        docs.append(Document(page_content=text, metadata={"source": "certifications", "type": "cbam"}))

    return docs


def _load_program_chunks() -> list[Document]:
    """Convert tunisian_programs.json into text chunks."""
    data = json.loads((DATA_DIR / "tunisian_programs.json").read_text(encoding="utf-8"))
    docs: list[Document] = []

    for prog in data.get("national_programs", []):
        text = (
            f"Tunisian program: {prog.get('name', '')}. "
            f"Managing body: {prog.get('managing_body', '')}. "
            f"Type: {prog.get('type', '')}. "
            f"Description: {prog.get('description', '')} "
            f"Eligible sectors: {', '.join(prog.get('eligible_sectors', []))}. "
            f"Eligible activities: {'; '.join(prog.get('eligible_activities', []))}. "
            f"Coverage: {prog.get('coverage', '')}. "
            f"How to apply: {prog.get('how_to_apply', '')}. "
            f"Priority for startups: {prog.get('priority_for_startups', 'N/A')}."
        )
        docs.append(Document(page_content=text, metadata={"source": "tunisian_programs", "type": "national", "id": prog.get("id", ""), "data": json.dumps(prog)}))

    for prog in data.get("international_financing", []):
        text = (
            f"International financing: {prog.get('name', '')}. "
            f"Type: {prog.get('type', '')}. "
            f"Description: {prog.get('description', '')} "
            f"Instruments: {', '.join(prog.get('typical_instruments', []))}. "
            f"Relevance for startups: {prog.get('relevance_for_startups', '')}. "
            f"How to access: {prog.get('how_to_access', '')}."
        )
        docs.append(Document(page_content=text, metadata={"source": "tunisian_programs", "type": "international", "id": prog.get("id", ""), "data": json.dumps(prog)}))

    # Summary/quick recs
    summary = data.get("summary", {}).get("quick_recommendations", {})
    for audience, recs in summary.items():
        text = f"Quick recommendations {audience.replace('_', ' ')}: {'; '.join(recs)}."
        docs.append(Document(page_content=text, metadata={"source": "tunisian_programs", "type": "summary", "id": audience}))

    return docs


# ---------------------------------------------------------------------------
# Index management
# ---------------------------------------------------------------------------

def _get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={"device": "cpu"},
    )


def build_index(force: bool = False) -> FAISS:
    """Build (or load from cache) the FAISS vector index."""
    global _vectorstore

    if _vectorstore is not None and not force:
        return _vectorstore

    embeddings = _get_embeddings()

    # Try loading from disk cache
    if INDEX_DIR.exists() and not force:
        try:
            _vectorstore = FAISS.load_local(
                str(INDEX_DIR), embeddings, allow_dangerous_deserialization=True
            )
            logger.info("Loaded FAISS index from %s (%d docs)", INDEX_DIR, _vectorstore.index.ntotal)
            return _vectorstore
        except Exception:
            logger.warning("Failed to load cached index, rebuilding", exc_info=True)

    # Build from scratch
    docs = _load_emission_chunks() + _load_certification_chunks() + _load_program_chunks()
    logger.info("Building FAISS index from %d documents", len(docs))

    _vectorstore = FAISS.from_documents(docs, embeddings)

    # Persist to disk
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    _vectorstore.save_local(str(INDEX_DIR))
    logger.info("Saved FAISS index to %s", INDEX_DIR)

    return _vectorstore


def get_vectorstore() -> FAISS:
    """Get or build the vector store (lazy singleton)."""
    global _vectorstore
    if _vectorstore is None:
        return build_index()
    return _vectorstore


# ---------------------------------------------------------------------------
# Semantic search tool (replaces keyword-based knowledge_base tools)
# ---------------------------------------------------------------------------

@tool
def semantic_knowledge_search(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """Search the knowledge base using semantic similarity.

    Searches across ALL knowledge sources (emission factors, certifications,
    Tunisian programs) using vector embeddings. Returns the most relevant
    documents ranked by semantic similarity.

    Use this instead of keyword-based lookups. Works with natural language
    queries like "clothing factory pollution" or "funding for solar panels".

    Args:
        query: Natural language search query.
        top_k: Number of results to return (default 5).

    Returns:
        List of relevant documents with content and metadata.
    """
    vs = get_vectorstore()
    results = vs.similarity_search_with_score(query, k=top_k)

    output = []
    for doc, score in results:
        entry: dict[str, Any] = {
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown"),
            "type": doc.metadata.get("type", "unknown"),
            "relevance_score": round(1 - score, 3),  # FAISS L2 → higher = more relevant
        }
        # Include structured data if available
        if "data" in doc.metadata:
            try:
                entry["structured_data"] = json.loads(doc.metadata["data"])
            except json.JSONDecodeError:
                pass
        output.append(entry)

    return output


@tool
def semantic_sector_search(sector_description: str) -> dict[str, Any]:
    """Find the best-matching industry sector from the knowledge base.

    Takes a natural language description of a business sector and returns
    the closest matching sector profile with emission factors and benchmarks.

    Args:
        sector_description: Description of the business sector,
            e.g. "olive oil production" or "clothing manufacturing".

    Returns:
        Best matching sector data with emission factors.
    """
    vs = get_vectorstore()
    results = vs.similarity_search_with_score(
        f"industry sector {sector_description}",
        k=3,
        filter={"type": "sector"},
    )

    if not results:
        # Fallback: search without filter
        results = vs.similarity_search_with_score(
            f"industry sector emissions {sector_description}", k=3
        )
        results = [(doc, score) for doc, score in results if doc.metadata.get("type") == "sector"]

    if not results:
        return {"error": f"No matching sector found for '{sector_description}'"}

    best_doc, best_score = results[0]
    output: dict[str, Any] = {
        "source": "Semantic knowledge base (FAISS)",
        "sector_id": best_doc.metadata.get("id", ""),
        "content": best_doc.page_content,
        "relevance_score": round(1 - best_score, 3),
    }
    if "data" in best_doc.metadata:
        try:
            output["data"] = json.loads(best_doc.metadata["data"])
        except json.JSONDecodeError:
            pass

    # Also return close alternatives
    if len(results) > 1:
        output["alternatives"] = [
            {"sector_id": doc.metadata.get("id", ""), "relevance_score": round(1 - s, 3)}
            for doc, s in results[1:]
        ]

    return output
