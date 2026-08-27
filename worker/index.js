/*
 * Em_Q — Cloudflare Worker (em1-prayer.kayuso2011.workers.dev)
 *
 * Two routes, two upstreams, one key:
 *   POST /tts  → Workers AI (Deepgram Aura)       env.AI binding
 *                Was RunPod Serverless (VoxCPM2), frozen 2026-08-20 for
 *                cost, thawed 2026-08-27 onto Workers AI. See /tts below.
 *   POST /     → Anthropic Messages API           env.ANTHROPIC_API_KEY
 *
 * The Anthropic key stays server-side; the app never sees it. RUNPOD_API_KEY
 * is no longer read by anything here and can be deleted from the secrets.
 *
 * /tts needs the Workers AI binding. It is not a secret and not in this file —
 * add it in the dashboard (Settings → Bindings → Workers AI, variable name
 * AI), or as `[ai] binding = "AI"` in wrangler.toml. Without it env.AI is
 * undefined and every line comes back a 500, which reaches the app as the
 * robot voice rather than as an error anyone sees.
 *
 * The secret names above are exact, and Cloudflare will not warn you if one
 * is wrong. The binding was named CLAUDE_API_KEY for a while: env lookups for
 * a name that doesn't exist return undefined rather than throwing, so the
 * Worker sent an empty x-api-key header and Anthropic answered "invalid
 * x-api-key" — a message that points at the key's value and says nothing
 * about the far more likely cause, which is its name. Rename a binding here
 * and you must rename it in Cloudflare in the same breath.
 *
 * THIS FILE IS A MIRROR, NOT THE DEPLOYED CODE. Cloudflare is the source of
 * truth. It lives here because it spent this whole project invisible: the app
 * and the voice server were both in git while the thing joining them was not,
 * so a bug in it could only ever be diagnosed by black-box probing from
 * outside. Edit here, then deploy with `wrangler deploy` (or paste into the
 * dashboard editor), and keep the two in step.
 */

// ─── WHO SHE SOUNDS LIKE ────────────────────────────────────────────────────
// Aura has a fixed cast and no cloning, so choosing her voice is choosing a
// name off this list rather than describing one. Both are overridable per
// request — auditioning a different Lulo should cost a request body, not a
// deploy — but the default is what every user actually hears, so it is the
// only one that matters.
//
// aura-2-en over aura-1: twice the price per character ($0.030 vs $0.015 per
// 1k) and still small enough not to feature in this project's costs, for a
// voice that carries a sentence noticeably better. The whole point of the
// switch was that she not sound like a machine; saving 1.5 cents per thousand
// characters is the wrong thing to optimise against that.
//
// Warm, unhurried, female voices in aura-2-en worth auditioning against
// voice-server/test_v10.wav: luna, cora, ophelia, harmonia, athena, andromeda.
const TTS_MODEL = '@cf/deepgram/aura-2-en'
const TTS_SPEAKER = 'luna'

// The kill switch, and the only one. It sits here rather than in the app for
// the reason the freeze proved: a browser holding a cached copy of the client
// still has this URL, so a switch that only lives client-side is one a stale
// cache walks straight around. Set it to false and every line falls back to
// the robot voice — worse, and not silent, which is the right failure for
// something being switched off to stop a bill rather than to hide a bug.
const TTS_ENABLED = true

export default {
    async fetch(request, env) {
        const url = new URL(request.url)

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                }
            })
        }

        if (url.pathname === '/tts') {
            // ─── HER VOICE, BACK ON, 2026-08-27 ──────────────────────────
            // This used to be a RunPod call. Everything that made that
            // expensive is gone: no GPU to rent, no 45-second cold start, no
            // meter running while nobody is speaking. Workers AI bills per
            // character of text, so an idle app costs nothing and a busy one
            // costs what it actually said.
            //
            // What was given up is real, and the app says so rather than
            // hiding it: Aura has a fixed cast and no cloning, so this is not
            // the voice built from lulo_reference.wav. It is a stand-in — a
            // good one, and not hers. voice-server/ stays in the repo for the
            // day the cloned voice can be afforded again.
            if (!TTS_ENABLED) {
                return new Response(
                    JSON.stringify({ error: 'tts_disabled' }),
                    { status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
                )
            }
            try {
                // `speaker` and `model` are audition overrides; the app sends
                // neither. `tone` is still sent — the client goes on choosing
                // one per line — and is deliberately ignored here: Aura takes
                // its delivery from the text itself and has no tone parameter
                // to hand it to. Tearing that mapping out client-side would
                // only mean rebuilding it the day the cloned voice returns,
                // so it stays wired and lands nowhere.
                const { text, speaker, model } = await request.json()
                if (!text) return new Response('No text', { status: 400 })

                // A ceiling, because this route is open and billed by the
                // character. The app splits her into sentences long before
                // she gets here, so anything near this did not come from it.
                if (text.length > 1000) {
                    return new Response(JSON.stringify({ error: 'Too long' }), {
                        status: 413,
                        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                    })
                }

                // No `encoding` is passed. The binding documents MPEG as what
                // it hands back, and mp3 carries container rules of its own
                // that a wrong guess turns into a 400 on every line she
                // speaks. Taking the documented default keeps that impossible.
                const out = await env.AI.run(
                    model || TTS_MODEL,
                    { text, speaker: speaker || TTS_SPEAKER },
                    { returnRawResponse: true }
                )

                // returnRawResponse gives back a Response; without it the
                // binding resolves to the ReadableStream itself. Handling both
                // means a change in that default cannot silence her.
                const body = out instanceof Response ? out.body : out

                // Streamed straight through. The RunPod path had to base64
                // decode a whole WAV inside the Worker — the hand-rolled loop
                // that replaced Uint8Array.from() after it started killing
                // requests on CPU — and none of that exists any more. The
                // audio arrives as bytes and leaves as bytes, so the first of
                // them reach the phone while the rest are still being made.
                return new Response(body, {
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Access-Control-Allow-Origin': '*',
                    }
                })
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                })
            }
        }

        // ── Claude proxy ────────────────────────────────────────────────────
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 })
        }

        try {
            const body = await request.json()
            const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify(body),
            })

            // ── Streaming ────────────────────────────────────────────────
            // With `stream: true` the reply arrives as server-sent events and
            // is handed straight back, unread. Buffering it here would undo
            // the entire point: the app speaks each sentence as it lands, so
            // the first word has to leave Anthropic and reach the phone while
            // the rest is still being written. Calling .json() on this would
            // hold every token until the last one, which is the wait we are
            // removing.
            //
            // Only on the success path. An error still comes back as one JSON
            // body no matter what was asked for, so it falls through below and
            // reaches the app in the shape its error handling expects.
            if (body.stream && claudeRes.ok && claudeRes.body) {
                return new Response(claudeRes.body, {
                    status: claudeRes.status,
                    headers: {
                        // The content type is what keeps this unbuffered end to
                        // end: text/event-stream is exempt from the buffering
                        // and compression an ordinary body gets, which would
                        // hold the early sentences back and deliver the lot in
                        // one piece at the end — exactly the wait being removed.
                        //
                        // Deliberately not setting Content-Encoding here. The
                        // runtime handles encoding itself and a header claiming
                        // something the bytes do not match breaks the body.
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache',
                        'X-Accel-Buffering': 'no',
                        'Access-Control-Allow-Origin': '*',
                    },
                })
            }

            const data = await claudeRes.json()
            return new Response(JSON.stringify(data), {
                status: claudeRes.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            })
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            })
        }
    }
}
