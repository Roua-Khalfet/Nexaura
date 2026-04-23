"""
Input Parser agent — extracts structured ParsedInput from free-text business descriptions.

If the description is too vague, sets needs_clarification=True with follow-up questions.
On re-run (after user answers), merges user_responses into a richer prompt.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from green_analysis.agents.state import EnvironmentalState, ParsedInput

logger = logging.getLogger(__name__)


def _extract_input_parser_json(text: str) -> str:
    """
    Extract the JSON payload from an LLM response.

    Some providers may include reasoning blocks like <think>...</think> and/or
    markdown fences. JSON parsing expects pure JSON only.
    """
    content = text.strip()

    # Remove internal reasoning tags if present.
    content = re.sub(
        r"<think>.*?</think>",
        "",
        content,
        flags=re.DOTALL | re.IGNORECASE,
    ).strip()

    # Strip markdown code fences if present.
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    # Slice out the JSON object (best-effort for responses with extra text).
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end != -1 and end > start:
        return content[start : end + 1].strip()

    return content


def run_input_parser(
    state: EnvironmentalState,
    llm: ChatGroq,
    system_prompt: str,
) -> dict[str, Any]:
    """Parse the entrepreneur's raw input into structured data."""

    # Build the user message — include follow-up answers if this is a re-run
    user_text = state.raw_input
    if state.user_responses:
        extra = "\n\nAdditional information provided by the entrepreneur:\n"
        for question, answer in state.user_responses.items():
            extra += f"- Q: {question}\n  A: {answer}\n"
        user_text += extra

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=(
            f"Analysez cette description d'entreprise et extrayez les données structurées.\n\n"
            f"Description de l'entreprise :\n\"{user_text}\"\n\n"
            f"Retournez un objet JSON avec les champs suivants :\n"
            f"- parsed_input : correspondant au schéma ParsedInput\n"
            f"- needs_clarification : booléen\n"
            f"- follow_up_questions : liste de chaînes (uniquement si needs_clarification est vrai)\n\n"
            f"Retournez UNIQUEMENT du JSON valide, sans balises markdown."
        )),
    ]

    try:
        response = llm.invoke(messages)
        content = response.content.strip()

        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        json_payload = _extract_input_parser_json(content)
        data = json.loads(json_payload)

        parsed_data = data.get("parsed_input", data)
        parsed_input = ParsedInput.model_validate(parsed_data)

        needs_clarification = data.get("needs_clarification", False)
        follow_up_questions = data.get("follow_up_questions", [])

        return {
            "parsed_input": parsed_input,
            "needs_clarification": needs_clarification,
            "follow_up_questions": follow_up_questions,
            "current_agent": ["input_parser"],
            "_trace": {"input_parser": [
                {"step": "llm_call", "detail": "Parsing free-text business description"},
                {"step": "result", "detail": f"Extracted sector: {parsed_input.industry_sector}, location: {parsed_input.location}, scale: {parsed_input.scale}"},
                *([ {"step": "clarification", "detail": f"Need more info: {', '.join(follow_up_questions)}"} ] if needs_clarification else []),
            ]},
        }

    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Input parser failed: %s", exc)
        return {
            "current_agent": ["input_parser"],
            "errors": [f"Input parser error: {exc}"],
            "needs_clarification": False,
            "_trace": {"input_parser": [{"step": "error", "detail": str(exc)}]},
        }
