"""
Em_Q — Lulo Voice Server
RunPod Serverless handler for VoxCPM2 TTS.

Job input:  { "text": "string to speak" }
Job output: { "audio": "<base64 WAV>", "sample_rate": 48000 }
"""

import io
import os
import base64
import inspect
import numpy as np
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
#
# The description is split in two because the two halves do different jobs.
# LULO_IDENTITY is who she is — age, gender, timbre. It never changes, or she
# stops being the same person. The tone is how she is saying this particular
# line, and it has to move: she is cheerful when you are, quiet when you are,
# hushed when she prays and wry when she is teasing, and one fixed "calm and
# soothing" flattens all of that into the same reading of a joke and a grief.
LULO_IDENTITY = "A warm, gentle young woman's voice"

# "neutral" concatenates to exactly the description that produced test_v10 —
# the one that sounded like her. Keep it byte-identical: generation is seeded
# and deterministic, so reordering even a comma here returns a different voice.
LULO_TONES = {
    "neutral":   "calm and unhurried, soft and kind, with a soothing and caring tone",
    "happy":     "bright and smiling, light and lifted, glad for you",
    "sad":       "quiet and tender, slower, full of gentle sympathy",
    "prayer":    "hushed and reverent, slow and steady, speaking softly",
    "joke":      "warm and amused, playful, with a smile in the voice",
    "sarcastic": "wry and teasing, with a playful lilt, fond and never unkind",
    "comfort":   "low and close, steady and reassuring, unhurried",
}
LULO_SEED = 20260815

# ─── HER ACTUAL VOICE ────────────────────────────────────────────────────────
# A description plus a seed was never going to hold her. The seed fixes the
# sampling, but the speaker is drawn conditioned on the text too, so a
# different sentence is a different draw — which is why she changed person
# between one sentence of an answer and the next once replies were split into
# chunks. Describing a voice and hoping for the same one twice is not the same
# as having a voice.
#
# A reference recording is. Cloning takes her identity from the audio rather
# than resampling it per request, so every chunk, every answer and every tone
# is the same person. This clip is the take that was chosen as sounding like
# her — 3.4s of clean 48kHz mono, which is what the model wants.
LULO_REFERENCE_WAV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lulo_reference.wav")
# What is actually said in that clip. Cloning needs the transcript to line the
# audio up against; a wrong one degrades the copy.
LULO_REFERENCE_TEXT = "Hello, I am Lulo. God is with you."

HAS_REFERENCE = os.path.isfile(LULO_REFERENCE_WAV)
print(f"Reference voice: {'loaded' if HAS_REFERENCE else 'MISSING — falling back to description only'}")


def trim_silence(wav, sr, floor_db=-45.0, keep_ms=60):
    """Cut leading and trailing near-silence.

    A short line comes back with seconds of padding around it — 37 characters
    of speech arriving as 7.4s of audio. That padding is not harmless. Replies
    are spoken a sentence at a time, so every chunk's tail of silence lands
    between two of her sentences and reads as her hesitating, and the same
    padding is what pushed ordinary short lines past the duration check and
    turned them into the robot voice.

    Cutting it also makes the check mean what it says: how long she spoke,
    rather than how long the file is.

    `keep_ms` leaves a breath at each end so consecutive chunks do not collide.
    """
    if wav is None or len(wav) == 0:
        return wav

    win = max(1, int(sr * 0.02))                      # 20ms frames
    frames = len(wav) // win
    if frames < 2:
        return wav

    usable = wav[: frames * win].reshape(frames, win)
    rms = np.sqrt(np.mean(usable.astype(np.float64) ** 2, axis=1))
    peak = float(rms.max())
    if peak <= 0:
        return wav

    # Threshold relative to this clip's own peak — absolute levels vary between
    # generations, so a fixed cutoff would clip quiet speech on some and miss
    # the padding on others.
    thresh = peak * (10.0 ** (floor_db / 20.0))
    loud = np.where(rms > thresh)[0]
    if len(loud) == 0:
        return wav

    keep = int(sr * keep_ms / 1000.0)
    start = max(0, loud[0] * win - keep)
    end = min(len(wav), (loud[-1] + 1) * win + keep)
    return wav[start:end]

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

    # `tone` names one of LULO_TONES, or is free text for auditioning a wording
    # that isn't in the table yet. An unknown name is a caller mistake worth
    # hearing about, but not worth failing a request over — she falls back to
    # neutral and says so in the log.
    tone = (job_input.get("tone") or "neutral").strip()
    if tone in LULO_TONES:
        tone_text = LULO_TONES[tone]
    elif " " in tone:
        tone_text = tone
    else:
        print(f"Unknown tone {tone!r}, falling back to neutral")
        tone_text = LULO_TONES["neutral"]

    # `voice` overrides the whole description, identity included — the escape
    # hatch for auditioning a different Lulo entirely. Empty string is a
    # meaningful value here (it means "no description at all"), so `or` would
    # be wrong.
    voice = job_input.get("voice")
    if voice is None:
        # ─── WHY THERE IS NO DESCRIPTION WHEN SHE IS CLONED ──────────────
        # Voice Design and reference cloning cannot both be on. The
        # parenthetical is only read as an instruction when the model is
        # inventing a speaker; once prompt_wav_path pins the speaker to a
        # recording, the model is cloning, and the parenthetical stops being
        # an instruction and becomes ordinary text to read out.
        #
        # Which is exactly what it did. Every line came out with the wording
        # of its own tone spoken in front of it — "with a soothing and caring
        # tone", "low and close" — and the reference transcript with it.
        # Confirmed against the deployed worker: "I hear you.", 11 characters
        # and about a second of speech, generated 5.9 seconds of audio,
        # failed the sanity check below three times and returned an error,
        # which the app plays as the robot voice.
        #
        # Keeping half of Voice Design was the mistake. The clip already
        # carries who she is; asking for a description on top asks the model
        # to say the description.
        #
        # The cost is real and deliberate: tone came from these words, so
        # until each tone has a reference clip of its own she has one
        # delivery. One Lulo who always sounds like herself beats seven who
        # announce their own stage directions.
        voice = "" if HAS_REFERENCE else f"({LULO_IDENTITY}, {tone_text})"
    voice = voice.strip()

    if HAS_REFERENCE and tone != "neutral" and not job_input.get("voice"):
        # Say so rather than accepting it silently, or the next person to
        # wonder why `sad` and `happy` sound identical has nothing to go on.
        print(f"tone {tone!r} accepted but not applied: cloning takes delivery from the reference clip")

    seed = job_input.get("seed", LULO_SEED)

    # What the model is asked to say. With a reference clip this is her line
    # and nothing else — see above; anything prepended here gets spoken.
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
    # Measured pace with the reference voice is about 12 characters a second.
    # The ceiling is that, halved for headroom, plus a flat allowance — because
    # the overshoot on a bad generation is a roughly constant tail of noise or
    # silence rather than something proportional to the text. The old purely
    # multiplicative rule gave a 37 character line 6.2s and no slack at all,
    # so ordinary short sentences failed three times and returned an error,
    # which the app played as the robot voice.
    #
    # Measured against `text`, not `prompt`: the voice description is an
    # instruction and never becomes audio, so counting it would inflate the
    # ceiling by its own length.
    #
    # Checked after trimming, so a long silent tail is cut rather than counted.
    max_expected_seconds = 2.5 + (len(text) / 6.0)

    last_wav = None
    for attempt in range(1, MAX_OUTER_ATTEMPTS + 1):
        # This build of voxcpm has no seed parameter (the startup line reports
        # "seed supported: False"), which meant every call sampled a brand new
        # speaker and Lulo was a different person in every sentence. Seeding
        # torch's global generator does the same job from outside the library:
        # the sampling inside generate() draws from it either way.
        #
        # Kept inside the loop so a retry reseeds, exactly as the seed kwarg
        # would — otherwise a deterministic bad generation repeats forever.
        if not SUPPORTS_SEED and seed is not None:
            torch.manual_seed(seed + (attempt - 1))
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed + (attempt - 1))

        gen_kwargs = {"cfg_value": 2.0, "inference_timesteps": 10}
        # Her identity comes from the recording, not from a fresh draw per
        # sentence. This is what stops her changing person mid-answer.
        if HAS_REFERENCE:
            gen_kwargs["prompt_wav_path"] = LULO_REFERENCE_WAV
            gen_kwargs["prompt_text"] = LULO_REFERENCE_TEXT
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

        raw_seconds = len(wav) / output_sr
        wav = trim_silence(wav, output_sr)
        duration = len(wav) / output_sr
        last_wav = wav

        if duration <= max_expected_seconds:
            if raw_seconds - duration > 0.25:
                print(f"Trimmed {raw_seconds - duration:.2f}s of padding ({raw_seconds:.1f}s -> {duration:.1f}s)")
            break

        print(
            f"Outer sanity check failed on attempt {attempt}/{MAX_OUTER_ATTEMPTS}: "
            f"got {duration:.1f}s of speech for {len(text)} chars "
            f"(raw {raw_seconds:.1f}s, expected <= {max_expected_seconds:.1f}s)"
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
