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

COPY main.py .
CMD ["python", "-u", "main.py"]
