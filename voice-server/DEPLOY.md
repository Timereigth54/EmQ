# Deploying Lulo's Voice Server

> **Not the live path since 2026-08-27.** Lulo speaks through Workers AI
> (Deepgram Aura) inside the existing Cloudflare Worker — no GPU, no cold start,
> ~$0.03 per thousand characters, nothing at all while she is quiet. See the
> `/tts` route in `worker/index.js`.
>
> This folder stays because Aura cannot clone a voice. Everything here — the
> reference recording, the identity prompt, the tone table, the pinned build —
> is the only path back to the voice Lulo was actually written for, and the app
> still sends a `tone` with every line so that switching back is a deploy rather
> than a rewrite. Nothing below has been re-verified since the freeze; treat the
> RunPod steps as last known good, not as current.

This folder is **not** served by the PWA. It lives in the repo so the backend and
the frontend that calls it stay in one place.

## Before you build

`main.py` targets the HuggingFace Transformers `AutoModel` pattern. VoxCPM2 is new
(2024/2025) and its exact repo ID and inference signature need confirming — search
HuggingFace for "openbmb MiniCPM TTS" or "VoxCPM2" and check the model card for:

- the exact model ID (set it via the `MODEL_ID` env var, or edit the default)
- the `generate()` signature — it may take different kwargs, or use a custom class
- the output sample rate (24000 and 48000 are both common)

The structure in `main.py` is correct for the standard Transformers pattern. Adjust
if the model ships its own inference class.

## RunPod (Recommended)

1. Go to runpod.io → Serverless → New Endpoint
2. Select "Custom Docker Image"
3. Build and push the Docker image:
   ```
   docker build -t your-dockerhub/lulo-voice:latest .
   docker push your-dockerhub/lulo-voice:latest
   ```
4. Paste the image URL into RunPod, set GPU: RTX 4090 or A100
5. Set min workers: 0 (serverless — you pay only when used)
6. Click Deploy. RunPod gives you an endpoint URL.
7. Test it:
   ```
   curl -X POST https://YOUR-ID.runpod.net/generate -H "Content-Type: application/json" -d "{\"text\":\"Hello, I am Lulo.\",\"language\":\"en\"}" --output test.wav
   ```

## Wiring it into the app

Two edits, both required — the app fails closed to Web Speech if either is missed.

1. `lulo-voice.js` — set the endpoint:
   ```js
   endpoint: 'https://YOUR-ID.runpod.net/generate'
   ```

2. `index.html` — add the same origin to `connect-src` in the CSP meta tag:
   ```
   connect-src 'self' ... https://YOUR-ID.runpod.net;
   ```
   Without this the browser blocks the request before it leaves the page.

Then bump the `CACHE` constant in `sw.js` so returning users pick up the change.

## CORS

`main.py` allows `https://timereigth54.github.io` by default. Override with the
`ALLOWED_ORIGINS` env var (comma-separated) if you serve the PWA from elsewhere.

## Cost estimate

~$0.0003 per second of GPU time. A 10-word response takes ~1–2 seconds to generate.
100 users × 10 conversations/day = ~$30–50/month.
