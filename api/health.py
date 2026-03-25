"""Health check — confirms API keys are configured."""

import json
import os
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        elevenlabs_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()

        status = {
            "anthropic_key_set": bool(anthropic_key),
            "anthropic_key_prefix": anthropic_key[:12] + "..." if anthropic_key else "NOT SET",
            "anthropic_key_length": len(anthropic_key),
            "elevenlabs_key_set": bool(elevenlabs_key),
            "elevenlabs_key_prefix": elevenlabs_key[:8] + "..." if elevenlabs_key else "NOT SET",
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(status, indent=2).encode())
