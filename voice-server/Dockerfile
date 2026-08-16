# syntax=docker/dockerfile:1.7
# The syntax directive is required for `RUN --mount=type=secret` below, which
# is how the HF token reaches the build without being baked into a layer.
FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

WORKDIR /app
COPY requirements.txt .

# The cu128 index stays as an *extra* index, not a pin: torch itself is left
# alone (the image's copy already matches), but if resolving voxcpm has to
# fetch torchaudio, this is what makes it fetch the cu128 build rather than a
# PyPI default one carrying a different torch.
#
# --retries/--timeout because these are large wheels over a long pull; a
# truncated download surfaces as a confusing hash mismatch, not a network
# error.
RUN pip install --no-cache-dir \
        --retries 10 --timeout 120 \
        --extra-index-url https://download.pytorch.org/whl/cu128 \
        -r requirements.txt

# The guarantee the pins were reaching for, checked directly instead of
# pre-empted with a heavy reinstall: if resolving voxcpm swapped torch for a
# build without CUDA, fail here — loudly, at build time — rather than at 3am as
# audio that sounds wrong for no visible reason.
RUN python -c "import torch, torchaudio; \
assert torch.version.cuda, 'torch has no CUDA — pip replaced the image build'; \
print(f'torch {torch.__version__} | torchaudio {torchaudio.__version__} | cuda {torch.version.cuda}')"

# ffmpeg is what torchcodec (a voxcpm dependency) decodes through. Absent, it
# surfaces as an audio-loading failure rather than a missing-package one.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# ─── THE WEIGHTS, BAKED IN ───────────────────────────────────────────────────
# Without this the worker downloads VoxCPM2 from HuggingFace on every cold
# start — the "Fetching 9 files" in the logs — before it can even begin
# loading. Pulling them at build time turns that download into an image layer,
# which RunPod caches on the host, so a cold worker starts from local disk.
#
# HF_HOME is set explicitly rather than left to default, so the path the build
# writes to and the path the runtime reads from cannot drift apart.
ENV HF_HOME=/opt/hf

# Turn a stalled socket into a raised error instead of an infinite wait. The
# default is 10s, but the failure we actually hit was a connection going
# half-open mid-stream: BuildKit kept ticking its step timer and the build sat
# there for ten minutes having downloaded nothing. These make it fail so
# bake_model.py can retry and resume.
ENV HF_HUB_DOWNLOAD_TIMEOUT=30
ENV HF_HUB_ETAG_TIMEOUT=30

# Transfers now go through the Xet backend, which opens 16 concurrent range
# requests per file by default. That is built for a fat, stable pipe; across a
# VPN it multiplies the chance that one connection wedges and takes the whole
# download with it. Four is slower on a good line and far more likely to
# finish on a bad one.
ENV HF_XET_NUM_CONCURRENT_RANGE_GETS=4

# HF_TOKEN arrives as a BuildKit secret rather than a build arg, so it is
# readable during this step and never written into an image layer or into
# `docker history`. The build works without it — the repo is public — it is
# only the anonymous rate limit that makes it slow.
COPY bake_model.py .
RUN --mount=type=secret,id=hf_token \
    HF_TOKEN="$(cat /run/secrets/hf_token 2>/dev/null || true)" \
    python -u bake_model.py

# Her voice. Copied before main.py so a code change does not re-layer it, and
# so a missing file fails the build rather than turning into a silent fallback
# to description-only generation at runtime.
COPY lulo_reference.wav .
RUN python -c "\
import wave; w = wave.open('lulo_reference.wav'); \
d = w.getnframes()/w.getframerate(); \
print(f'reference voice: {d:.2f}s, {w.getframerate()}Hz, {w.getnchannels()}ch'); \
assert 1.0 < d < 30.0, f'reference clip is {d:.2f}s — cloning wants a few seconds'; \
assert w.getnchannels() == 1, 'reference clip must be mono'"

COPY main.py .
CMD ["python", "-u", "main.py"]
