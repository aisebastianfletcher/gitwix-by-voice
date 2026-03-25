"""Vercel Serverless Function — Steve LLM Chat via Anthropic Claude."""

import json
import os
from http.server import BaseHTTPRequestHandler
import anthropic


api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
client = anthropic.Anthropic(api_key=api_key) if api_key else None


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length)) if content_length else {}

            messages = body.get("messages", [])
            system = body.get("system", "You are Steve, a helpful and witty AI web developer concierge.")

            # Build messages for Claude
            claude_messages = []
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role in ("user", "assistant"):
                    claude_messages.append({"role": role, "content": content})

            if not claude_messages:
                claude_messages = [{"role": "user", "content": "Hello"}]

            if not client:
                key_hint = api_key[:8] + "..." if api_key else "EMPTY"
                raise ValueError(f"ANTHROPIC_API_KEY issue: starts with '{key_hint}', len={len(api_key)}")

            # Try models in order of preference
            models = [
                "claude-sonnet-4-6",
                "claude-sonnet-4-5-20250929",
                "claude-3-5-sonnet-20241022",
                "claude-3-haiku-20240307",
            ]
            text = None
            errors = []

            for model in models:
                try:
                    response = client.messages.create(
                        model=model,
                        max_tokens=400,
                        system=system,
                        messages=claude_messages,
                    )
                    text = response.content[0].text if response.content else None
                    if text:
                        break
                except Exception as model_err:
                    errors.append(f"{model}: {str(model_err)[:60]}")
                    continue

            if not text:
                # Return debug info so we can see what's failing
                text = f"Debug: tried {len(models)} models. Errors: {'; '.join(errors[:2])}"

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(json.dumps({"response": text}).encode())

        except Exception as e:
            err_msg = str(e)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "response": f"Steve's having a moment — {err_msg[:80]}. Try again?"
            }).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
