"""Vercel Serverless Function — Steve TTS via ElevenLabs."""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()

# Voice IDs
VOICE_MAP = {
    "steve": "xYa75LlayhWHCRl1yJSH",     # User-selected voice from ElevenLabs library
    "charlie": "IKne3meq5aSn9XLyUdCD",
    "daniel": "onwK4e9ZLuTAKqWW03F9",
    "george": "JBFqnCBsd6RMkjVDRZzb",
}
DEFAULT_VOICE = "steve"

# Models to try in order (some may not be available on all plans)
TTS_MODELS = [
    "eleven_multilingual_v2",
    "eleven_turbo_v2_5",
    "eleven_turbo_v2",
    "eleven_monolingual_v1",
]


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length)) if content_length else {}

            text = body.get("text", "")
            voice_name = body.get("voice", DEFAULT_VOICE)
            voice_id = VOICE_MAP.get(voice_name, VOICE_MAP[DEFAULT_VOICE])

            if not text:
                self._respond_error(400, "No text provided")
                return

            if not ELEVENLABS_API_KEY:
                self._respond_error(422, "TTS not configured")
                return

            # Try each model until one works
            audio_bytes = None
            last_error = ""

            for model_id in TTS_MODELS:
                try:
                    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                    payload = json.dumps({
                        "text": text,
                        "model_id": model_id,
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75,
                            "style": 0.0,
                            "use_speaker_boost": True,
                        }
                    }).encode("utf-8")

                    req = Request(url, data=payload, method="POST")
                    req.add_header("Content-Type", "application/json")
                    req.add_header("xi-api-key", ELEVENLABS_API_KEY)
                    req.add_header("Accept", "audio/mpeg")

                    response = urlopen(req, timeout=25)
                    audio_bytes = response.read()
                    if audio_bytes and len(audio_bytes) > 100:
                        break
                except HTTPError as e:
                    err_body = ""
                    try:
                        err_body = e.read().decode()[:150]
                    except Exception:
                        pass
                    last_error = f"{model_id}: HTTP {e.code} {err_body}"
                    continue
                except Exception as e:
                    last_error = f"{model_id}: {str(e)[:80]}"
                    continue

            if audio_bytes and len(audio_bytes) > 100:
                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Content-Disposition", "inline")
                self._cors()
                self.end_headers()
                self.wfile.write(audio_bytes)
            else:
                self._respond_error(422, f"All TTS models failed: {last_error[:120]}")

        except Exception as e:
            self._respond_error(422, f"TTS error: {str(e)[:100]}")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond_error(self, code, msg):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}).encode())
