import os
import base64
import requests
import traceback  # ✅ manquait
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

MODELS = [
    "black-forest-labs/FLUX.1-schnell",  # ✅ meilleur qualité, gratuit
    "stabilityai/stable-diffusion-3.5-medium",  # ✅ alternatif
    "stabilityai/stable-diffusion-2-1",  # ✅ fallback fiable
]

NEGATIVE_PROMPT = "cartoon, anime, blurry, watermark, nsfw, text, western face"

@csrf_exempt
@require_POST
def generate_avatar(request):
    try:
        data = json.loads(request.body)
        prompt = data.get("prompt", "")
        seed   = data.get("seed", 42)

        hf_token = os.environ.get("HF_TOKEN")
        print(f"[Avatar] HF_TOKEN présent: {bool(hf_token)}")  # ← debug
        print(f"[Avatar] Prompt reçu: {prompt[:80]}...")        # ← debug

        if not hf_token:
            return JsonResponse({"error": "HF_TOKEN manquant"}, status=500)

        headers = {
            "Authorization": f"Bearer {hf_token}",
            "Content-Type": "application/json",
        }

        payload = {
            "inputs": prompt,
            "parameters": {
                "seed": int(seed),  # ✅ force int
                "num_inference_steps": 30,
                "guidance_scale": 7.5,
                "width": 512,
                "height": 512,
                "negative_prompt": NEGATIVE_PROMPT,
            },
        }

        for model in MODELS:
            try:
                print(f"[Avatar] Tentative modèle: {model}")
                # ✅ Change l'URL dans la boucle
                resp = requests.post(
                    f"https://router.huggingface.co/hf-inference/models/{model}",
                    headers=headers,
                    json=payload,
                    timeout=60,
                )
                print(f"[Avatar] Status: {resp.status_code}")
                if resp.status_code == 503:
                    continue
                if not resp.ok:
                    print(f"[Avatar] Erreur HF: {resp.text[:200]}")
                    continue

                b64 = base64.b64encode(resp.content).decode("utf-8")
                print(f"[Avatar] ✅ Succès avec {model}")
                return JsonResponse({
                    "dataUrl": f"data:image/jpeg;base64,{b64}",
                    "model": model,
                })

            except Exception as e:
                print(f"[Avatar] Exception {model}: {e}")
                continue

    except Exception as e:
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Tous les modèles HF ont échoué"}, status=500)