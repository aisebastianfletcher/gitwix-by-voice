"""Vercel Serverless Function — Steve LLM Chat via Anthropic Claude (raw HTTP)."""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

# Models to try in order of preference
MODELS = [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
]


def call_anthropic(system, messages, model):
    """Call Anthropic Messages API via raw HTTP."""
    payload = json.dumps({
        "model": model,
        "max_tokens": 400,
        "system": system,
        "messages": messages,
    }).encode()

    req = Request(ANTHROPIC_URL, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("x-api-key", ANTHROPIC_API_KEY)
    req.add_header("anthropic-version", "2023-06-01")

    resp = urlopen(req, timeout=25)
    data = json.loads(resp.read())
    if data.get("content") and len(data["content"]) > 0:
        return data["content"][0].get("text", "")
    return None


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length)) if content_length else {}

            messages_raw = body.get("messages", [])
            system = body.get("system", "You are Steve, a helpful and witty AI web developer concierge.")

            # Build messages
            claude_messages = []
            for msg in messages_raw:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role in ("user", "assistant") and content:
                    claude_messages.append({"role": role, "content": content})

            if not claude_messages:
                claude_messages = [{"role": "user", "content": "Hello"}]

            if not ANTHROPIC_API_KEY:
                raise ValueError("ANTHROPIC_API_KEY not configured")

            # Try models in order
            text = None
            last_error = ""
            for model in MODELS:
                try:
                    text = call_anthropic(system, claude_messages, model)
                    if text:
                        break
                except HTTPError as e:
                    last_error = f"{model}: HTTP {e.code}"
                    continue
                except Exception as e:
                    last_error = f"{model}: {str(e)[:50]}"
                    continue

            if not text:
                text = f"Steve's brain hit a snag ({last_error}). Try again in a sec?"

            self._respond(200, {"response": text})

        except Exception as e:
            self._respond(200, {
                "response": f"Steve's having a moment. Try again?"
            })

    def do_OPTIONS(self):
        self._cors_headers()

    def _respond(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
