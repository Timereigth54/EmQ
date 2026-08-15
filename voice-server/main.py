"""
Em_Q — Lulo Voice Server
RunPod Serverless handler for VoxCPM2 TTS.

Job input:  { "text": "string to speak" }
Job output: { "audio": "<base64 WAV>", "sample_rate": 48000 }
"""

import io
import base64
import inspect
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
SAMPLE_RATE = model.tts_model.sample_rate
print(f"VoxCPM2 ready — sample rate: {SAMPLE_RATE} Hz")

# We used to hardcode 48000 here, because the model reported 16000 while the
# audio was plainly 48kHz. That reading was another symptom of the compiled
# path: with optimize=False it reports 48000 correctly, so we can go back to
# asking it rather than overriding it.
if SAMPLE_RATE != 48000:
    print(f"WARNING: expected 48000 Hz from VoxCPM2, got {SAMPLE_RATE}")

# ─── WHO LULO SOUNDS LIKE ────────────────────────────────────────────────────
# With no reference audio and no seed, VoxCPM2 invents a speaker from scratch
# on every call — a different stranger each time. Two things pin her down:
#
#   The parenthetical prefix is VoxCPM2's Voice Design feature: a natural
#   language description of the voice, consumed as an instruction rather than
#   spoken. It is what gets us a specific voice without needing a reference
#   recording of one.
#
#   The seed fixes the sampling, so the same description lands on the same
#   voice every time instead of drifting between utterances.
#
# Both are overridable per request, so her voice can be auditioned by changing
# the request body — no rebuild, no redeploy, no GPU time spent on a rebuild
# just to hear a different adjective.
LULO_VOICE = (
    "(A warm, gentle young woman's voice, calm and unhurried, "
    "soft and kind, with a soothing and caring tone)"
)
LULO_SEED = 20260815

# generate() forwards **kwargs to _generate(), so seed isn't visible on the
# public signature. Check the private one rather than assume the installed
# version takes it — a TypeError here would take out every request.
try:
    SUPPORTS_SEED = "seed" in inspect.signature(model._generate).parameters
except (AttributeError, ValueError):
    SUPPORTS_SEED = False
print(f"Voice Design on, seed supported: {SUPPORTS_SEED}")


def handler(job):
    """
    RunPod calls this for every queued job.
    Returns a dict that becomes job['output'] on the caller's side.
    """
    job_input = job.get("input", {})
    text = job_input.get("text", "").strip()

    if not text:
        return {"error": "No text provided"}

    # Empty string is a meaningful override: it means "no voice description",
    # so `or` would be wrong here.
    voice = job_input.get("voice")
    if voice is None:
        voice = LULO_VOICE
    voice = voice.strip()

    seed = job_input.get("seed", LULO_SEED)

    # What the model is asked to say; the description rides along as an
    # instruction and is not spoken.
    prompt = f"{voice} {text}".strip() if voice else text

    output_sr = SAMPLE_RATE

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
    #
    # Measured against `text`, not `prompt`: the voice description is an
    # instruction and never becomes audio, so counting it would inflate the
    # ceiling by its own length and quietly blind the check on short lines —
    # which are exactly the ones that run away.
    max_expected_seconds = max(3.0, (len(text) / 15.0) * 2.5)

    last_wav = None
    for attempt in range(1, MAX_OUTER_ATTEMPTS + 1):
        gen_kwargs = {"cfg_value": 2.0, "inference_timesteps": 10}
        if SUPPORTS_SEED and seed is not None:
            # A fixed seed makes generation deterministic, which would make the
            # retry below pointless — the same seed on the same text returns
            # the same bad audio three times over. So the canonical seed is
            # used for the first attempt, and only a retry moves off it. By
            # then the canonical voice has already produced garbage, and a
            # slightly different Lulo beats no Lulo.
            gen_kwargs["seed"] = seed + (attempt - 1)

        try:
            wav = model.generate(text=prompt, **gen_kwargs)
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
