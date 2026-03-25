"""Vercel Serverless Function — Steve LLM Chat via Anthropic Claude."""

import json
import os
from http.server import BaseHTTPRequestHandler
import anthropic


client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


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

            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=400,
                system=system,
                messages=claude_messages,
            )

            text = response.content[0].text if response.content else "Sorry, I blanked out for a second there."

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(json.dumps({"response": text}).encode())

        except Exception as e:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "response": "Ah, my brain just did a 500. Give me a moment and try again."
            }).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
