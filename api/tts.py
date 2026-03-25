"""Vercel Serverless Function — Steve TTS via ElevenLabs."""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError


ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")

# Voice IDs — Charlie is a British male voice, perfect for Steve
VOICE_MAP = {
    "charlie": "IKne3meq5aSn9XLyUdCD",
    "daniel": "onwK4e9ZLuTAKqWW03F9",
    "george": "JBFqnCBsd6RMkjVDRZzb",
}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length)) if content_length else {}

            text = body.get("text", "")
            voice_name = body.get("voice", "charlie")
            voice_id = VOICE_MAP.get(voice_name, VOICE_MAP["charlie"])

            if not text:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No text provided"}).encode())
                return

            if not ELEVENLABS_API_KEY:
                self.send_response(422)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "TTS not configured"}).encode())
                return

            # Call ElevenLabs TTS API
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            payload = json.dumps({
                "text": text,
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0.3,
                    "use_speaker_boost": True,
                }
            }).encode()

            req = Request(url, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("xi-api-key", ELEVENLABS_API_KEY)
            req.add_header("Accept", "audio/mpeg")

            response = urlopen(req, timeout=15)
            audio_bytes = response.read()

            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Disposition", "inline")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(audio_bytes)

        except URLError as e:
            self.send_response(422)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"TTS API error: {str(e)}"}).encode())

        except Exception as e:
            self.send_response(422)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "TTS generation failed"}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
