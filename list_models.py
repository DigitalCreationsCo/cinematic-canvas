import urllib.request
import json
import os

key = os.environ.get("GEMINI_API_KEY")
req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}")
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        for model in data.get("models", []):
            if "image" in model["name"].lower() or "generate" in model["name"].lower():
                print(model["name"])
except Exception as e:
    print("Error:", e)
