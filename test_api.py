import os
import sys
import django
from django.test import Client
import json

# Setup Django environment
sys.path.insert(0, os.path.abspath('backend'))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

def test_chat_endpoint():
    print("Testing /api/chat/ endpoint...")
    client = Client()
    
    payload = {
        "message": "Quels sont les avantages du Startup Act en Tunisie ?",
        "mode": "kb" # mode normal
    }
    
    response = client.post(
        '/api/chat/', 
        data=json.dumps(payload),
        content_type='application/json',
        SERVER_NAME='localhost'
    )
    
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("\n--- Response ---")
        print(data.get("response", ""))
        print("\n--- Sources ---")
        for src in data.get("sources", []):
            print(f"- {src}")
        print("\n--- Metadata ---")
        print(json.dumps(data.get("metadata", {}), indent=2))
        print("\n--- Source Type ---")
        print(data.get("source_type", ""))
    else:
        print(f"Error: {response.status_code}")
        # Parse title from Django debug HTML if possible
        import re
        html = response.content.decode('utf-8')
        match = re.search(r'<title>(.*?)</title>', html)
        if match:
            print(f"Exception: {match.group(1)}")
        print(f"Details: {html[:1000]}")

if __name__ == "__main__":
    test_chat_endpoint()
