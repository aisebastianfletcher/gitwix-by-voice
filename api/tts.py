"""Vercel Serverless Function — Jenny TTS via Google Gemini 2.5 Flash TTS."""

import json
import os
import base64
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()

# Gemini TTS endpoint
GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent"

# Gemini voice — Kore is a warm, natural female voice
GEMINI_VOICE = "Kore"


def pcm_to_wav(pcm_data, sample_rate=24000, channels=1, sample_width=2):
    """Wrap raw PCM bytes in a WAV header."""
    import struct
    data_size = len(pcm_data)
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_size,
        b'WAVE',
        b'fmt ',
        16,  # chunk size
        1,   # PCM format
        channels,
        sample_rate,
        sample_rate * channels * sample_width,  # byte rate
        channels * sample_width,  # block align
        sample_width * 8,  # bits per sample
        b'data',
        data_size,
    )
    return header + pcm_data


def gemini_tts(text, api_key):
    """Call Gemini 2.5 Flash TTS and return WAV audio bytes."""
    url = f"{GEMINI_TTS_URL}?key={api_key}"

    payload = json.dumps({
        "contents": [{
            "parts": [{"text": f"Say warmly and naturally: {text}"}]
        }],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": GEMINI_VOICE
                    }
                }
            }
        }
    }).encode("utf-8")

    req = Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")

    resp = urlopen(req, timeout=20)
    data = json.loads(resp.read())

    # Extract base64 audio from response
    candidates = data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        if parts and "inlineData" in parts[0]:
            audio_b64 = parts[0]["inlineData"]["data"]
            pcm_data = base64.b64decode(audio_b64)
            # Gemini returns raw PCM (s16le, 24kHz, mono) — wrap in WAV header
            return pcm_to_wav(pcm_data, sample_rate=24000, channels=1, sample_width=2)

    return None


def elevenlabs_tts(text, api_key):
    """Fallback: Call ElevenLabs TTS."""
    voice_id = "xYa75LlayhWHCRl1yJSH"
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    payload = json.dumps({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        }
    }).encode("utf-8")

    req = Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("xi-api-key", api_key)
    req.add_header("Accept", "audio/mpeg")

    resp = urlopen(req, timeout=20)
    return resp.read()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length)) if content_length else {}
            text = body.get("text", "")

            if not text:
                self._respond_error(400, "No text provided")
                return

            audio_bytes = None
            content_type = "audio/wav"
            last_error = ""

            # Try Gemini TTS first (free, high quality)
            if GOOGLE_API_KEY:
                try:
                    audio_bytes = gemini_tts(text, GOOGLE_API_KEY)
                    content_type = "audio/wav"
                except HTTPError as e:
                    err_body = ""
                    try:
                        err_body = e.read().decode()[:150]
                    except Exception:
                        pass
                    last_error = f"Gemini: HTTP {e.code} {err_body}"
                except Exception as e:
                    last_error = f"Gemini: {str(e)[:100]}"

            # Fallback to ElevenLabs if Gemini fails
            if not audio_bytes and ELEVENLABS_API_KEY:
                try:
                    audio_bytes = elevenlabs_tts(text, ELEVENLABS_API_KEY)
                    content_type = "audio/mpeg"
                except Exception as e:
                    last_error += f" | ElevenLabs: {str(e)[:80]}"

            if audio_bytes and len(audio_bytes) > 100:
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Disposition", "inline")
                self._cors()
                self.end_headers()
                self.wfile.write(audio_bytes)
            else:
                self._respond_error(422, f"TTS failed: {last_error[:150]}")

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
