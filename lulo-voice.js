/*
 * Em_Q — lulo-voice.js
 * Lulo's speech engine. Extracted as its own module in Phase 3.
 *
 * Two paths:
 *   1. VoxCPM2 backend (LuloVoice.endpoint) — Lulo's real voice. See voice-server/DEPLOY.md.
 *   2. Web Speech API fallback — used when no endpoint is set or the request fails.
 *
 * Loaded BEFORE app.js. Nothing here depends on app.js.
 */

// ─── LULO VOICE ENGINE ───────────────────────────────────────────────────────
const LuloVoice = {
    enabled: false,
    // TTS route on the existing Cloudflare Worker.
    // The Worker proxies to RunPod and keeps the RunPod API key server-side.
    // Set to null to fall back to Web Speech API.
    endpoint: 'https://em1-prayer.kayuso2011.workers.dev/tts',
    currentAudio: null,

    // Lulo often says two things at once — a reaction bubble and then the verse.
    // Queue them so she finishes one before starting the next instead of
    // cutting herself off mid-sentence.
    _queue: [],
    _speaking: false,

    // ─── PERMISSION TO MAKE A SOUND ──────────────────────────────────────
    // iOS grants playback to an element the user has already started, not to
    // the page, and the grant does not survive a long wait. Lulo's audio
    // arrives after a network round trip that can be a cold start long, so by
    // the time there is anything to play, the tap that authorised it has
    // expired and play() is refused.
    //
    // The answer is one element, started once during a real gesture with a
    // silent clip, and reused for every line after. It stays authorised.
    _audioEl: null,
    _unlocked: false,

    _el() {
        if (!this._audioEl) {
            this._audioEl = new Audio()
            this._audioEl.preload = 'auto'
        }
        return this._audioEl
    },

    // 44 bytes of WAV header and no samples — silent, instant, and enough to
    // count as playback.
    _SILENCE: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YQAAAAA=',

    unlock() {
        if (this._unlocked) return
        // Never mid-sentence. This assigns src on the very element that is
        // playing, so unlocking while she talks cuts her off — and the error
        // that follows hands the rest of the line to the robot voice. A
        // refused unlock un-sets the flag so the next tap retries, which is
        // what let a later tap land in the middle of her speaking.
        if (this._speaking || (this.currentAudio && !this.currentAudio.paused)) return

        this._unlocked = true
        const el = this._el()
        el.src = this._SILENCE
        el.play().catch(() => {
            // Refused even here: this gesture wasn't one the browser accepts.
            // Let the next one try again.
            this._unlocked = false
        })
    },

    load() {
        this.enabled = localStorage.getItem('luloVoiceEnabled') === 'true'
        updateVoiceToggleUI()
        // Any first touch will do — the point is only that it is a gesture.
        const arm = () => this.unlock()
        document.addEventListener('touchstart', arm, { capture: true, passive: true })
        document.addEventListener('click', arm, { capture: true })
    },

    toggle() {
        this.enabled = !this.enabled
        localStorage.setItem('luloVoiceEnabled', String(this.enabled))
        if (!this.enabled) this.stop()
        updateVoiceToggleUI()
        if (this.enabled) {
            // A real tap, and she is about to need the permission iOS only
            // grants during one.
            this.unlock()
            // Wake the GPU now rather than when you first speak to her. The
            // greeting itself must not do this job: routed through the queue
            // it would arrive a cold start late *and* hold up whatever you
            // said in the meantime, so you would wait out a stale hello
            // before hearing the answer you actually wanted.
            this.warmUp()
            this._greet()
        }
        return this.enabled
    },

    // ─── WAKING THE GPU EARLY ────────────────────────────────────────────
    // Turning her voice on is a promise that she is about to speak, so it is
    // the right moment to start a worker booting. A cold start is around 45
    // seconds and the wait is unavoidable — but it can be spent while you are
    // still choosing what to say instead of after you have said it.
    //
    // Deliberately not queued and the audio is thrown away. The point is the
    // boot, not the sound; queueing it would put a stale greeting in front of
    // your first real sentence.
    _warmedAt: 0,

    warmUp() {
        if (!this.endpoint) return
        // Workers idle out after a few minutes, so re-warming is worth it, but
        // not on every toggle in a row.
        if (Date.now() - this._warmedAt < 120000) return
        this._warmedAt = Date.now()
        fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Hello.', language: 'en', tone: 'neutral' })
        }).catch(() => { this._warmedAt = 0 })   // let the next toggle retry
    },

    // Her greeting comes from a file shipped with the app: instant, the same
    // every time, works with no signal, and costs no GPU. Generating it on
    // demand would make the first thing she ever says the slowest thing she
    // ever says.
    //
    // Falls back to the system voice only if the file is missing, which is
    // still better than a minute of silence.
    _GREETING: 'audio/lulo-greeting.wav',

    _greet() {
        const name = localStorage.getItem('luloUserName') || 'friend'
        const el = this._el()
        let settled = false
        const toRobot = () => {
            if (settled) return
            settled = true
            this._fallback(`Voice is on, ${name}. I'll speak to you from now on.`)
        }
        el.onerror = toRobot
        el.onended = null
        el.src = this._GREETING
        el.play().then(() => { settled = true }).catch(toRobot)
    },

    // ─── HOW A MOOD IS SPOKEN ────────────────────────────────────────────
    // 27 moods, four tones. Not every feeling needs its own voice, and giving
    // each one its own would work against her: the character brief says she
    // "doesn't perform emotions to match the intensity of someone else's" and
    // is "tender without being fragile". So these group by what she should
    // sound like, not by what the user picked.
    //
    //   happy   — she is glad with you
    //   sad     — she sits with it, quiet, without rushing to fix it
    //   comfort — steady and close, for the moods that are frightened or
    //             overloaded rather than sorrowful. Anger is here too: meeting
    //             it with brightness would be tone-deaf and meeting it with
    //             sorrow would be pity.
    //   neutral — her resting voice, the one that sounded like her
    //
    // A mood that isn't listed falls to neutral, which is the safe direction
    // to be wrong in.
    _moodTones: {
        happy: 'happy', joyful: 'happy', excited: 'happy', loved: 'happy',
        encouraged: 'happy', grateful: 'happy', hopeful: 'happy',
        expecting: 'happy',

        sad: 'sad', heartbroken: 'sad', depressed: 'sad', lonely: 'sad',
        rejected: 'sad', unappreciated: 'sad', invisible: 'sad', empty: 'sad',

        afraid: 'comfort', anxious: 'comfort', overwhelmed: 'comfort',
        unsettled: 'comfort', confused: 'comfort', sick: 'comfort',
        tired: 'comfort', angry: 'comfort',

        peaceful: 'neutral', bored: 'neutral', unmotivated: 'neutral',
    },

    toneForMood(mood) {
        return this._moodTones[mood] || 'neutral'
    },

    _clean(text) {
        return text
            .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
            .replace(/[💙🌱🙏⭐✦🤖💚]/g, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*/g, '')
            .replace(/\n\n/g, '. ')
            .replace(/\n/g, ' ')
            .trim()
    },

    // `tone` names one of the voice server's tones (neutral, happy, sad,
    // prayer, joke, sarcastic, comfort). It rides with the line rather than
    // being set on the engine, because the queue can hold a reaction and the
    // verse behind it, and those are not always said the same way.
    // ─── SAYING IT IN PIECES ─────────────────────────────────────────────
    // A whole answer used to go to the server as one job, so nothing was heard
    // until the last word of it had been generated. On a long one that meant a
    // wait measured in tens of seconds, and often a timeout that dropped the
    // whole thing to the robot voice.
    //
    // Split on sentence ends and she can start on the first while the rest are
    // still being made. Time-to-first-word stops depending on how much she has
    // to say, which is the difference between a pause and a conversation.
    //
    // Sentences are kept whole. The model reads punctuation for phrasing and
    // breath, so a chunk cut mid-clause comes back sounding cut mid-clause.
    _chunk(text, max = 180) {
        const parts = text.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g) || [text]
        const out = []
        for (const raw of parts) {
            const s = raw.trim()
            if (!s) continue
            const last = out[out.length - 1]
            // Join short neighbours: one-clause chunks make her sound clipped,
            // and each one is a separate round trip.
            if (last && last.length + 1 + s.length <= max) out[out.length - 1] = last + ' ' + s
            else out.push(s)
        }
        return out.length ? out : [text]
    },

    speak(text, tone) {
        if (!this.enabled) return
        if (!text) return
        const clean = this._clean(text)
        if (!clean) return
        // Cap the queue so a burst of messages can't leave her talking for
        // minutes. Counted in chunks now, so the ceiling is higher — a single
        // long answer is legitimately several of them.
        for (const piece of this._chunk(clean)) {
            if (this._queue.length >= 12) this._queue.shift()
            this._queue.push({ text: piece, tone: tone || 'neutral' })
        }
        // Start the first fetch now rather than when the queue is next drained.
        this._prefetch()
        this._drain()
    },

    // Begin the network request for a line without waiting for its turn.
    // Defaults to the next one up: one line ahead only, because two would have
    // her generating a paragraph she may never reach if the user interrupts,
    // on a GPU billed by the second.
    _prefetch(item = this._queue[0]) {
        if (!item || item.audio) return
        item.audio = fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: item.text, language: 'en', tone: item.tone })
        }).then(res => {
            if (!res.ok) throw new Error('TTS ' + res.status)
            return res.blob()
        }).then(blob => URL.createObjectURL(blob))
        // A rejection here is handled where it is awaited; this keeps it from
        // surfacing as an unhandled rejection in the meantime.
        item.audio.catch(() => {})
    },

    // Set this from app.js to be notified when the queue drains after speaking.
    // Used to auto-restart the mic for continuous conversation.
    onDrainComplete: null,

    // Fired when a line actually starts and stops *sounding* — not when it is
    // queued or requested. The visualiser under Lulo hangs off these, so they
    // have to track the audio rather than the intent: a TTS fetch can take a
    // second, and a line drawn talking before any sound arrives reads as a
    // glitch. Never let a listener's exception break speech.
    onSpeechStart: null,
    onSpeechEnd: null,

    _fire(which) {
        const fn = which === 'start' ? this.onSpeechStart : this.onSpeechEnd
        if (typeof fn !== 'function') return
        try { fn() } catch { /* a visualiser must never silence her */ }
    },

    // Screen Wake Lock — keeps the screen on while Lulo is talking so audio
    // isn't killed by the OS when the display goes off.
    _wakeLock: null,

    async _acquireWakeLock() {
        if (this._wakeLock || !('wakeLock' in navigator)) return
        try {
            this._wakeLock = await navigator.wakeLock.request('screen')
            // The browser releases it automatically when the tab loses visibility;
            // null it out so we know to re-acquire if needed.
            this._wakeLock.addEventListener('release', () => { this._wakeLock = null })
        } catch {
            // Not supported or permission denied — fall through silently
        }
    },

    _releaseWakeLock() {
        if (this._wakeLock) {
            this._wakeLock.release().catch(() => {})
            this._wakeLock = null
        }
    },

    async _drain(fromRecursion = false) {
        if (this._speaking) return
        const next = this._queue.shift()
        if (next === undefined) {
            // Queue empty — release wake lock and notify caller
            this._releaseWakeLock()
            if (fromRecursion && typeof this.onDrainComplete === 'function') {
                this.onDrainComplete()
            }
            return
        }
        this._speaking = true
        // Keep screen on for the duration of speech
        if (!this._wakeLock) await this._acquireWakeLock()
        // The next line starts generating while this one plays, so the gap
        // between her sentences is whatever is left of a round trip after her
        // own speech has covered it — usually nothing.
        this._prefetch()
        try {
            await this._utter(next)
        } catch {
            // A failed line should never stall the queue
        }
        this._speaking = false
        if (this.enabled) this._drain(true)
    },

    // Resolves when this line has finished playing
    _utter(item) {
        const { text: clean, tone } = item
        return new Promise(async resolve => {
            if (this.endpoint) {
                try {
                    // Usually already in flight, started while the previous
                    // line was still playing. Awaiting it here costs whatever
                    // is left of the round trip, which on a middle sentence is
                    // normally nothing at all.
                    this._prefetch(item)
                    const url = await item.audio
                    // The one element, not a new one per line. iOS grants
                    // permission to an *element* that was played during a
                    // gesture, not to the page, so a fresh Audio() every time
                    // is a fresh element that was never granted anything.
                    const audio = this._el()
                    this.currentAudio = audio
                    let sounding = false
                    let settled = false
                    const done = () => {
                        if (settled) return
                        settled = true
                        URL.revokeObjectURL(url)
                        if (this.currentAudio === audio) this.currentAudio = null
                        if (sounding) { sounding = false; this._fire('end') }
                        resolve()
                    }
                    // Refuse and error are the same story told two ways, and
                    // both have to be audible. A CSP that does not allow blob:
                    // in media-src surfaces here as MEDIA_ERR_SRC_NOT_SUPPORTED
                    // on perfectly good audio; wiring it to done() reported the
                    // line as spoken and left the room silent.
                    const giveUp = why => {
                        if (settled) return
                        settled = true
                        URL.revokeObjectURL(url)
                        if (this.currentAudio === audio) this.currentAudio = null
                        if (sounding) { sounding = false; this._fire('end') }
                        console.warn('[LuloVoice] falling back to Web Speech:', why)
                        this._fallback(clean, resolve, tone)
                    }
                    audio.onplaying = () => { sounding = true; this._fire('start') }
                    audio.onended = done
                    audio.onerror = () => giveUp('media error code ' + (audio.error?.code ?? '?'))
                    audio.src = url
                    // A rejected play() used to call done() — resolving the
                    // line as though she had said it. That is why she could go
                    // completely silent with healthy logs: the audio arrived,
                    // playback was refused, and nothing anywhere said so. It
                    // is the single most likely refusal too, because the fetch
                    // can take a cold start's worth of seconds and by then the
                    // tap that authorised it is long expired.
                    //
                    // Refusal now falls through to the Web Speech voice. A
                    // different voice saying the line beats silence.
                    audio.play().then(() => { /* playing; onended resolves */ })
                        .catch(err => giveUp('playback refused: ' + (err?.name || err)))
                    return
                } catch {
                    // fall through to Web Speech API
                }
            }
            this._fallback(clean, resolve, tone)
        })
    },

    // The Web Speech voice can't be described in words, so the tone survives
    // here only as a nudge to rate and pitch. It is a much cruder instrument
    // than the real voice — the point is just that the fallback doesn't read a
    // grief at the same clip as a joke.
    _toneProsody: {
        neutral:   { rate: 0.88, pitch: 1.08 },
        happy:     { rate: 0.96, pitch: 1.16 },
        sad:       { rate: 0.80, pitch: 1.00 },
        prayer:    { rate: 0.78, pitch: 1.02 },
        joke:      { rate: 0.94, pitch: 1.14 },
        sarcastic: { rate: 0.90, pitch: 1.12 },
        comfort:   { rate: 0.82, pitch: 1.04 },
    },

    _fallback(text, onDone, tone) {
        const done = onDone || (() => {})
        if (!('speechSynthesis' in window)) { done(); return }
        const u = new SpeechSynthesisUtterance(text)
        const p = this._toneProsody[tone] || this._toneProsody.neutral
        u.rate = p.rate; u.pitch = p.pitch; u.volume = 1
        let sounding = false
        const finish = () => {
            if (sounding) { sounding = false; this._fire('end') }
            done()
        }
        u.onstart = () => { sounding = true; this._fire('start') }
        u.onend = finish
        u.onerror = finish
        const go = () => {
            const voices = speechSynthesis.getVoices()
            const want = ['Google UK English Female', 'Samantha', 'Karen', 'Moira', 'Victoria']
            for (const n of want) {
                const v = voices.find(v => v.name === n)
                if (v) { u.voice = v; break }
            }
            speechSynthesis.speak(u)
        }
        speechSynthesis.getVoices().length > 0 ? go() : (speechSynthesis.onvoiceschanged = go)
    },

    stop() {
        // Lines queued behind this one may already have audio fetched or in
        // flight. Dropping the queue without releasing them leaks a blob per
        // interrupted sentence, and interruption is normal — she is cut off
        // every time you pick a new mood or start talking over her.
        for (const item of this._queue) {
            if (item && item.audio) item.audio.then(URL.revokeObjectURL).catch(() => {})
        }
        this._queue.length = 0
        this._speaking = false
        if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio = null }
        if ('speechSynthesis' in window) speechSynthesis.cancel()
        this._releaseWakeLock()
        // Cutting her off mid-sentence has to put the trace down too — pause()
        // and cancel() fire neither onended nor onend.
        this._fire('end')
    }
}

function updateVoiceToggleUI() {
    const btn = document.getElementById('sound-btn')
    if (!btn) return
    // The button holds an inline SVG — the muted/speaking states are pure CSS,
    // so never write textContent here or the icon gets destroyed.
    btn.classList.toggle('voice-active', LuloVoice.enabled)
    btn.title = LuloVoice.enabled ? 'Voice ON, tap to mute' : 'Voice OFF, tap to enable'
}
