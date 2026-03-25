"""Vercel Serverless Function — Steve LLM Chat via Anthropic Claude."""

import json
import os
from http.server import BaseHTTPRequestHandler
import anthropic


api_key = os.environ.get("ANTHROPIC_API_KEY", "")
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
                raise ValueError("ANTHROPIC_API_KEY not set")

            # Try models in order of preference
            models = ["claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-3-5-sonnet-20241022"]
            text = None
            last_err = None

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
                    last_err = model_err
                    continue

            if not text:
                text = "Sorry, I blanked out for a second there."

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
