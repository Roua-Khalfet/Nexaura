import json
import os
from typing import Dict, List

KB_ROOT = os.path.join(os.path.dirname(__file__))
MAX_FILE_BYTES = 3000


def get_templates(domain: str, intent: str) -> List[Dict]:
    matches = []
    folder = os.path.join(KB_ROOT, "templates")
    if not os.path.isdir(folder):
        return matches
    for fname in os.listdir(folder):
        path = os.path.join(folder, fname)
        if not path.endswith(".json"):
            continue
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
            if domain in data.get("domains", []) or intent in data.get("intents", []):
                matches.append(data)
    return matches


def get_compliance(standards: List[str]) -> str:
    results = []
    folder = os.path.join(KB_ROOT, "compliance")
    if not os.path.isdir(folder):
        return ""
    for fname in os.listdir(folder):
        name = fname.replace(".md", "")
        if name in standards:
            path = os.path.join(folder, fname)
            with open(path, encoding="utf-8") as handle:
                content = handle.read()
                results.append(content[:MAX_FILE_BYTES])
    return "\n\n".join(results)


def get_pricing(provider: str, services: List[str]) -> Dict:
    path = os.path.join(KB_ROOT, "pricing", f"{provider}.json")
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    return {svc: data.get(svc, {}) for svc in services}


def get_rules(categories: List[str]) -> str:
    results = []
    folder = os.path.join(KB_ROOT, "rules")
    if not os.path.isdir(folder):
        return ""
    for fname in os.listdir(folder):
        name = fname.replace(".md", "")
        if name in categories:
            path = os.path.join(folder, fname)
            with open(path, encoding="utf-8") as handle:
                content = handle.read()
                results.append(content[:MAX_FILE_BYTES])
    return "\n\n".join(results)
