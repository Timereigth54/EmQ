"""
Lulo Voice Server — VoxCPM2 TTS inference
HuggingFace repo: openbmb/VoxCPM2
Uses the `voxcpm` pip package (NOT AutoModel/transformers).
Sample rate is pulled from model.tts_model.sample_rate (48kHz) — never hardcoded.
Deploy on RunPod Serverless — RTX 4090 (~8GB VRAM) is sufficient.
Returns: audio/wav binary
"""
import io
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from voxcpm import VoxCPM
import soundfile as sf

model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    print("Loading VoxCPM2...")
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
    print(f"VoxCPM2 ready — sample rate: {model.tts_model.sample_rate}Hz")
    yield
    model = None

app = FastAPI(lifespan=lifespan)

# The PWA is served from GitHub Pages — browser sends cross-origin requests.
# Without this the fetch in LuloVoice.speak() silently fails CORS and falls
# back to Web Speech API. Narrow this to your own origin before going live.
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://timereigth54.github.io",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)

class TTSRequest(BaseModel):
    text: str
    language: str = "en"

@app.post("/generate")
async def generate_speech(req: TTSRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not ready")
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    if len(req.text) > 2000:
        raise HTTPException(status_code=400, detail="Text too long")

    try:
        wav = model.generate(
            text=req.text,
            cfg_value=2.0,
            inference_timesteps=10,
        )
        buf = io.BytesIO()
        # Pull sample rate from model — 48kHz. Do NOT hardcode.
        sf.write(buf, wav, model.tts_model.sample_rate, format="WAV")
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}
