"""
Em_Q — Lulo Voice Server
RunPod Serverless handler for VoxCPM2 TTS.

Job input:  { "text": "string to speak" }
Job output: { "audio": "<base64 WAV>", "sample_rate": 48000 }
"""

import io
import base64
import runpod
import torch

# Disable TorchDynamo before VoxCPM2 loads.
# PyTorch 2.8 compiles feat_encoder with torch.compile, but einops.rearrange's
# use of set.symmetric_difference can't be traced — workers crash on warmup.
# Setting this here (before voxcpm import) prevents dynamo from ever tracing.
torch._dynamo.config.disable = True

from voxcpm import VoxCPM
import soundfile as sf

# ── Model loads once when the worker pod initialises. ────────────────────────
# RunPod keeps the process alive between jobs, so this only pays the cold-start
# cost once per worker instance.
print("Loading VoxCPM2…")
model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
print(f"VoxCPM2 ready — sample rate: {model.tts_model.sample_rate} Hz")


def handler(job):
    """
    RunPod calls this for every queued job.
    Returns a dict that becomes job['output'] on the caller's side.
    """
    job_input = job.get("input", {})
    text = job_input.get("text", "").strip()

    if not text:
        return {"error": "No text provided"}

    try:
        wav = model.generate(text=text, cfg_value=2.0, inference_timesteps=10)
        buf = io.BytesIO()
        # Model reports 16000 Hz but wav shape confirms true output is 48000 Hz
        output_sr = 48000
        sf.write(buf, wav, output_sr, format="WAV")
        audio_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return {"audio": audio_b64, "sample_rate": output_sr}
    except Exception as e:
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
