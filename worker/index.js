/*
 * Em_Q — Cloudflare Worker (em1-prayer.kayuso2011.workers.dev)
 *
 * Two routes, two upstreams, two keys:
 *   POST /tts  → RunPod Serverless (VoxCPM2)      env.RUNPOD_API_KEY
 *   POST /     → Anthropic Messages API           env.ANTHROPIC_API_KEY
 *
 * Both keys stay server-side; the app never sees either.
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

                // Submit job
                const submitRes = await fetch('https://api.runpod.ai/v2/bibe8ou3zkmbrz/run', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.RUNPOD_API_KEY}`,
                    },
                    body: JSON.stringify({ input })
                })
                const { id } = await submitRes.json()
                if (!id) return new Response(JSON.stringify({ error: 'No job ID' }), { status: 502 })

                // Poll until done (max ~90s).
                //
                // The first check happens before the first sleep. A warm worker
                // answers in well under a second, and the old loop slept 5s
                // before looking even once — so every single line she spoke
                // carried a five second floor that had nothing to do with how
                // long it took to say.
                for (let i = 0; i < 19; i++) {
                    if (i > 0) await new Promise(r => setTimeout(r, 5000))
                    const pollRes = await fetch(`https://api.runpod.ai/v2/bibe8ou3zkmbrz/status/${id}`, {
                        headers: { 'Authorization': `Bearer ${env.RUNPOD_API_KEY}` }
                    })
                    const data = await pollRes.json()
                    if (data.status === 'COMPLETED') {
                        if (!data.output?.audio) return new Response(JSON.stringify({ error: 'No audio' }), { status: 502 })
                        const audioBytes = Uint8Array.from(atob(data.output.audio), c => c.charCodeAt(0))
                        return new Response(audioBytes, {
                            headers: {
                                'Content-Type': 'audio/wav',
                                'Access-Control-Allow-Origin': '*'
                            }
                        })
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
