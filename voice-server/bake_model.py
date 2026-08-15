"""
Pull VoxCPM2's weights into the image at build time.

Without this the worker downloads ~5GB from HuggingFace on every cold start
before it can begin loading. Baking them in turns that into an image layer,
which RunPod caches on the host.

The retry loop is the whole point of this being a script rather than a one
line `python -c`. The repo is 4.96GB in two big files, and a dropped
connection mid-stream — a VPN reconnecting, a hotel wifi blip — leaves the
download hanging with no error at all. BuildKit keeps ticking its step timer,
the progress bar keeps showing the last count it saw, and the build sits there
overnight looking busy.

Two things make that survivable:

  HF_HUB_DOWNLOAD_TIMEOUT turns a stalled socket into a raised TimeoutError
  instead of an infinite wait, so a dead connection becomes a failure we can
  see and act on.

  snapshot_download resumes from whatever is already in the cache, so a retry
  continues the 4.58GB file rather than starting it again. Retrying is cheap;
  the loop is generous for that reason.
"""

import os
import sys
import time

from huggingface_hub import snapshot_download

REPO = "openbmb/VoxCPM2"
MAX_ATTEMPTS = 10

# A token lifts the anonymous rate limit. Optional: the repo is public, and an
# unauthenticated build still works, just slower. Passed in as a BuildKit
# secret so it never lands in an image layer — see the Dockerfile.
token = os.environ.get("HF_TOKEN") or None
print(f"HF token present: {bool(token)}", flush=True)

for attempt in range(1, MAX_ATTEMPTS + 1):
    try:
        path = snapshot_download(REPO, token=token)
        print(f"baked {REPO} into {path}", flush=True)
        break
    except Exception as e:
        print(
            f"attempt {attempt}/{MAX_ATTEMPTS} failed: "
            f"{type(e).__name__}: {e}",
            flush=True,
        )
        if attempt == MAX_ATTEMPTS:
            sys.exit(f"could not download {REPO} after {MAX_ATTEMPTS} attempts")
        # Short, flat backoff: these failures are dropped connections, not a
        # server asking us to back off, and the next attempt resumes rather
        # than restarts.
        time.sleep(5)

# Prove the weights are really in the image. Without this a partial or skipped
# download would fall back to fetching at runtime, and we would be measuring
# cold starts wondering why nothing improved.
hf_home = os.environ.get("HF_HOME", "/opt/hf")
files = 0
size = 0
for root, _, names in os.walk(hf_home):
    for n in names:
        fp = os.path.join(root, n)
        if os.path.isfile(fp) and not os.path.islink(fp):
            files += 1
            size += os.path.getsize(fp)

mb = size / 1e6
print(f"HF cache: {files} files, {mb:.0f} MB", flush=True)

# The repo is ~4.96GB; anything under 4000MB means we did not get the weights.
if mb < 4000:
    sys.exit(f"VoxCPM2 weights missing or partial — only {mb:.0f} MB in {hf_home}")
print("weights verified", flush=True)
