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

from voxcpm import VoxCPM
import soundfile as sf

# The build is pinned (see requirements.txt), but pip resolution on a base image
# that already ships torch can still surprise us. Print what actually resolved,
# so a bad rebuild is visible in the logs instead of being inferred from the
# sound of the output.
print(
    f"torch {torch.__version__} | cuda {torch.version.cuda} | "
    f"available={torch.cuda.is_available()}"
)

# ── Model loads once when the worker pod initialises. ────────────────────────
# RunPod keeps the process alive between jobs, so this only pays the cold-start
# cost once per worker instance.
#
# optimize=False is load-bearing, for two documented reasons that both land on
# this same switch:
#
#   1. torch.compile can't trace einops.rearrange's set.symmetric_difference,
#      so the warmup crashes. This is the VoxCPM FAQ's "torch.compile errors on
#      first run", and optimize=False is the fix its maintainers tested.
#      We previously worked around it with a global torch._dynamo.config.disable
#      — which stopped the crash, but left optimize at its default True, so the
#      library still set up (and warmed up) a compiled path with tracing torn
#      out from under it. Nobody tests that state.
#
#   2. With optimize=True the model runs under CUDA Graphs, and the FAQ is
#      explicit that those are not compatible with multi-threading. RunPod
#      spawns a thread per handler invocation, so every generate() call lands
#      on a different thread from the one this module compiled on — exactly the
#      shape the FAQ warns against.
#
# The second is why the official quickstart produced garbage here while working
# fine for everyone running it as a plain single-threaded script: the model was
# never the problem, the thread it was being called from was.
print("Loading VoxCPM2…")
model = VoxCPM.from_pretrained(
    "openbmb/VoxCPM2", load_denoiser=False, optimize=False
)
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

    # Model reports 16000 Hz but wav shape confirms true output is 48000 Hz
    output_sr = 48000

    # VoxCPM2 has its own internal "badcase" retry (up to 3x) when generated
    # audio runs way longer than the text warrants — a known hallucination/
    # repetition failure mode. But if it's STILL bad after those 3 internal
    # tries, the library just returns the bad audio with no error and no
    # flag. We saw this directly: a one-sentence prompt produced 10+ seconds
    # of garbled, looping audio. So we add our own outer check: if the
    # duration is clearly out of proportion to the text, throw the whole
    # attempt away and generate fresh (new attempt, not just VoxCPM2's
    # internal retry) up to MAX_OUTER_ATTEMPTS times. If it's still bad
    # after that, we return an error instead of shipping garbled audio —
    # the app already falls back to the Web Speech API voice on error.
    MAX_OUTER_ATTEMPTS = 3
    # Rough ceiling: ~15 characters/sec of natural speech, generous 2.5x
    # margin for slower pacing, with a 3s floor for very short lines.
    max_expected_seconds = max(3.0, (len(text) / 15.0) * 2.5)

    last_wav = None
    for attempt in range(1, MAX_OUTER_ATTEMPTS + 1):
        try:
            wav = model.generate(text=text, cfg_value=2.0, inference_timesteps=10)
        except Exception as e:
            return {"error": str(e)}

        duration = len(wav) / output_sr
        last_wav = wav

        if duration <= max_expected_seconds:
            break

        print(
            f"Outer sanity check failed on attempt {attempt}/{MAX_OUTER_ATTEMPTS}: "
            f"got {duration:.1f}s for {len(text)} chars (expected <= {max_expected_seconds:.1f}s)"
        )
    else:
        return {
            "error": (
                f"Generation repeatedly produced garbled/oversized audio "
                f"({duration:.1f}s for {len(text)} chars) after "
                f"{MAX_OUTER_ATTEMPTS} attempts"
            )
        }

    buf = io.BytesIO()
    sf.write(buf, last_wav, output_sr, format="WAV")
    audio_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return {"audio": audio_b64, "sample_rate": output_sr}


runpod.serverless.start({"handler": handler})
