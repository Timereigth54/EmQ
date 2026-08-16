/*
 * Em_Q — Cloudflare Worker (em1-prayer.kayuso2011.workers.dev)
 *
 * Two routes, two upstreams, two keys:
 *   POST /tts  → RunPod Serverless (VoxCPM2)      env.RUNPOD_API_KEY
 *   POST /     → Anthropic Messages API           env.ANTHROPIC_API_KEY
 *
 * Both keys stay server-side; the app never sees either.
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
            try {
                // `tone` decides how Lulo says the line, `voice` and `seed`
                // are the audition overrides. These used to be dropped here:
                // the handler destructured `text` alone and rebuilt the job as
                // { input: { text } }, so anything else the app sent was
                // silently discarded and every line came out in her resting
                // voice no matter what was asked for.
                const { text, tone, voice, seed } = await request.json()
                if (!text) return new Response('No text', { status: 400 })

                // Forwarded only when present, so the voice server's own
                // defaults stay in charge of anything the caller didn't set.
                const input = { text }
                if (tone !== undefined) input.tone = tone
                if (voice !== undefined) input.voice = voice
                if (seed !== undefined) input.seed = seed

                // /runsync holds the connection open and returns the result
                // inline. /run + polling meant every line waited for the next
                // poll tick before anyone noticed it was ready — dead time
                // added to a job that had already finished, on top of a
                // generation that only takes about a second.
                //
                // It falls back to a job id when the work outlasts its window,
                // which is what a cold start does, so the polling loop below
                // is still needed — just no longer on the common path.
                const submitRes = await fetch('https://api.runpod.ai/v2/bibe8ou3zkmbrz/runsync', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.RUNPOD_API_KEY}`,
                    },
                    body: JSON.stringify({ input })
                })
                const sync = await submitRes.json()

                const asAudio = out => {
                    if (!out?.audio) return null
                    const bytes = Uint8Array.from(atob(out.audio), c => c.charCodeAt(0))
                    return new Response(bytes, {
                        headers: { 'Content-Type': 'audio/wav', 'Access-Control-Allow-Origin': '*' }
                    })
                }

                if (sync.status === 'COMPLETED') {
                    const r = asAudio(sync.output)
                    if (r) return r
                    return new Response(JSON.stringify({ error: 'No audio', detail: sync.output }), { status: 502 })
                }
                if (sync.status === 'FAILED') {
                    return new Response(JSON.stringify({ error: 'Job failed', detail: sync }), { status: 502 })
                }

                const id = sync.id
                if (!id) return new Response(JSON.stringify({ error: 'No job ID', detail: sync }), { status: 502 })

                // Only reached when the work outlasted /runsync's window, which
                // in practice means a cold start. Short ticks near the front:
                // a worker that has just finished booting is about to answer,
                // and a flat 5s tick spent most of its time waiting on a job
                // that was already done.
                for (let i = 0; i < 40; i++) {
                    await new Promise(r => setTimeout(r, i < 10 ? 1000 : 3000))
                    const pollRes = await fetch(`https://api.runpod.ai/v2/bibe8ou3zkmbrz/status/${id}`, {
                        headers: { 'Authorization': `Bearer ${env.RUNPOD_API_KEY}` }
                    })
                    const data = await pollRes.json()
                    if (data.status === 'COMPLETED') {
                        const r = asAudio(data.output)
                        if (r) return r
                        return new Response(JSON.stringify({ error: 'No audio' }), { status: 502 })
                    }
                    if (data.status === 'FAILED') return new Response(JSON.stringify({ error: 'Job failed', detail: data }), { status: 502 })
                }
                return new Response(JSON.stringify({ error: 'Timeout' }), { status: 504 })
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
