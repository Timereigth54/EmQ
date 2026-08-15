FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

WORKDIR /app
COPY requirements.txt .

# torch/torchaudio come from the cu128 index so they match the base image's
# CUDA build. Without this, pip resolving voxcpm's torchaudio>=2.5.0 can pull a
# PyPI default wheel and drag a mismatched torch in with it — which fails as
# wrong numerics rather than as an install error.
RUN pip install --no-cache-dir \
        --extra-index-url https://download.pytorch.org/whl/cu128 \
        -r requirements.txt

# ffmpeg is what torchcodec (a voxcpm dependency) decodes through. Absent, it
# surfaces as an audio-loading failure rather than a missing-package one.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY main.py .
CMD ["python", "-u", "main.py"]
