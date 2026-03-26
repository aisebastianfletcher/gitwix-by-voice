"""Vercel Serverless Function — Jenny TTS via Google Gemini 2.5 Flash TTS."""

import json
import os
import base64
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()

# Gemini TTS endpoints — try the stable model first, then preview
GEMINI_TTS_MODELS = [
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-flash-lite-preview-tts",
]
GEMINI_TTS_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Google Cloud TTS endpoint (fallback — uses WaveNet voices)
CLOUD_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"

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
    """Call Gemini 2.5 Flash TTS and return WAV audio bytes. Tries multiple models."""
    for model in GEMINI_TTS_MODELS:
        try:
            url = f"{GEMINI_TTS_BASE}/{model}:generateContent?key={api_key}"

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

            resp = urlopen(req, timeout=25)
            data = json.loads(resp.read())

            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and "inlineData" in parts[0]:
                    audio_b64 = parts[0]["inlineData"]["data"]
                    pcm_data = base64.b64decode(audio_b64)
                    return pcm_to_wav(pcm_data, sample_rate=24000, channels=1, sample_width=2)
        except Exception:
            continue

    return None


def cloud_tts(text, api_key):
    """Fallback: Google Cloud Text-to-Speech API with WaveNet voice."""
    url = f"{CLOUD_TTS_URL}?key={api_key}"

    payload = json.dumps({
        "input": {"text": text},
        "voice": {
            "languageCode": "en-GB",
            "name": "en-GB-Neural2-A",
            "ssmlGender": "FEMALE"
        },
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": 1.0,
            "pitch": 0.5,
        }
    }).encode("utf-8")

    req = Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")

    resp = urlopen(req, timeout=15)
    data = json.loads(resp.read())
    audio_b64 = data.get("audioContent", "")
    if audio_b64:
        return base64.b64decode(audio_b64), "audio/mpeg"
    return None, None


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

            # 1) Try Gemini TTS (free, high quality neural voice)
            if GOOGLE_API_KEY and not audio_bytes:
                try:
                    audio_bytes = gemini_tts(text, GOOGLE_API_KEY)
                    content_type = "audio/wav"
                except Exception as e:
                    last_error = f"Gemini TTS: {str(e)[:80]}"

            # 2) Try Google Cloud TTS (free tier, WaveNet quality)
            if GOOGLE_API_KEY and not audio_bytes:
                try:
                    result, ct = cloud_tts(text, GOOGLE_API_KEY)
                    if result:
                        audio_bytes = result
                        content_type = ct
                except Exception as e:
                    last_error += f" | Cloud TTS: {str(e)[:80]}"

            # 3) Try ElevenLabs (if quota available)
            if ELEVENLABS_API_KEY and not audio_bytes:
                try:
                    audio_bytes = elevenlabs_tts(text, ELEVENLABS_API_KEY)
                    content_type = "audio/mpeg"
                except Exception as e:
                    last_error += f" | ElevenLabs: {str(e)[:60]}"

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
