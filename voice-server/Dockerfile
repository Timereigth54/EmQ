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
RUN python -c "\
from huggingface_hub import snapshot_download; \
p = snapshot_download('openbmb/VoxCPM2'); \
print('baked VoxCPM2 into', p)"

# Prove the weights are really in the image. Without this the download could
# silently fail back to a runtime fetch and we would be measuring cold starts
# wondering why nothing improved.
RUN python -c "\
import os; \
n = sum(len(f) for _, _, f in os.walk('/opt/hf')); \
mb = sum(os.path.getsize(os.path.join(r,f)) for r,_,fs in os.walk('/opt/hf') for f in fs) / 1e6; \
print(f'HF cache: {n} files, {mb:.0f} MB'); \
assert mb > 100, 'VoxCPM2 weights missing from image — snapshot_download did not land'"

COPY main.py .
CMD ["python", "-u", "main.py"]
