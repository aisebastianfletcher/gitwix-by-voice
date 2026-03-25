#!/usr/bin/env python3
"""Gitwix Backend — LLM Chat + TTS for Steve AI Concierge."""

import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gitwix")

# LLM client
from anthropic import Anthropic
llm_client = Anthropic()

# TTS
from generate_audio import generate_audio


@asynccontextmanager
async def lifespan(app):
    logger.info("Gitwix server starting...")
    yield
    logger.info("Gitwix server shutting down.")


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Chat Endpoint ──────────────────────────────────────────

class ChatRequest(BaseModel):
    messages: list[dict]
    system: str = ""


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        # Build messages for Claude
        claude_messages = []
        for msg in req.messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant"):
                claude_messages.append({"role": role, "content": content})

        if not claude_messages:
            claude_messages = [{"role": "user", "content": "Hello"}]

        response = llm_client.messages.create(
            model="claude_sonnet_4_6",
            max_tokens=400,
            system=req.system or "You are Steve, a helpful and witty AI web developer concierge.",
            messages=claude_messages,
        )

        text = response.content[0].text if response.content else "Sorry, I blanked out for a second there."
        return JSONResponse({"response": text})

    except Exception as e:
        logger.error(f"Chat error: {e}")
        return JSONResponse(
            {"response": "Ah, my brain just did a 500. Give me a moment and try again."},
            status_code=200,  # Return 200 so the frontend shows the message
        )


# ── TTS Endpoint ──────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    voice: str = "charlie"


@app.post("/api/tts")
async def tts(req: TTSRequest):
    try:
        audio_bytes = await generate_audio(
            req.text,
            voice=req.voice,
            model="elevenlabs_tts_v3",
        )
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline"},
        )
    except Exception as e:
        logger.error(f"TTS error: {e}")
        return JSONResponse({"error": "TTS generation failed"}, status_code=422)


# ── Contact Form / Enquiry Endpoint ──────────────────────

class EnquiryRequest(BaseModel):
    name: str
    email: str
    company: str = ""
    project: str = ""


# In-memory store for enquiries (persists for the session)
enquiries: list[dict] = []


@app.post("/api/enquiry")
async def submit_enquiry(req: EnquiryRequest):
    enquiry = {
        "name": req.name,
        "email": req.email,
        "company": req.company,
        "project": req.project,
    }
    enquiries.append(enquiry)
    logger.info(f"New enquiry from {req.name} ({req.email})")
    return JSONResponse({"status": "ok", "message": "Enquiry received"})


@app.get("/api/enquiries")
async def list_enquiries():
    return JSONResponse({"enquiries": enquiries})


# ── Lead Capture (from Steve voice conversation) ──────────

class LeadRequest(BaseModel):
    email: str
    conversation: list[dict] = []

leads: list[dict] = []

@app.post("/api/lead")
async def capture_lead(req: LeadRequest):
    lead = {"email": req.email, "conversation": req.conversation}
    leads.append(lead)
    logger.info(f"New lead captured: {req.email}")
    return JSONResponse({"status": "ok", "message": "Lead captured"})

@app.get("/api/leads")
async def list_leads():
    return JSONResponse({"leads": leads})


# ── Health Check ─────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "agent": "steve"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
