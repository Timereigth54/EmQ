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

    load() {
        this.enabled = localStorage.getItem('luloVoiceEnabled') === 'true'
        updateVoiceToggleUI()
    },

    toggle() {
        this.enabled = !this.enabled
        localStorage.setItem('luloVoiceEnabled', String(this.enabled))
        if (!this.enabled) this.stop()
        updateVoiceToggleUI()
        if (this.enabled) {
            const name = localStorage.getItem('luloUserName') || 'friend'
            this._fallback(`Voice is on, ${name}. I'll speak to you from now on.`)
        }
        return this.enabled
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

    speak(text) {
        if (!this.enabled) return
        if (!text) return
        const clean = this._clean(text)
        if (!clean) return
        // Cap the queue so a burst of messages can't leave her talking for minutes
        if (this._queue.length >= 4) this._queue.shift()
        this._queue.push(clean)
        this._drain()
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
        try {
            await this._utter(next)
        } catch {
            // A failed line should never stall the queue
        }
        this._speaking = false
        if (this.enabled) this._drain(true)
    },

    // Resolves when this line has finished playing
    _utter(clean) {
        return new Promise(async resolve => {
            if (this.endpoint) {
                try {
                    const res = await fetch(this.endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: clean, language: 'en' })
                    })
                    if (!res.ok) throw new Error('TTS error')
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const audio = new Audio(url)
                    this.currentAudio = audio
                    let sounding = false
                    const done = () => {
                        URL.revokeObjectURL(url)
                        if (this.currentAudio === audio) this.currentAudio = null
                        if (sounding) { sounding = false; this._fire('end') }
                        resolve()
                    }
                    audio.onplaying = () => { sounding = true; this._fire('start') }
                    audio.onended = done
                    audio.onerror = done
                    audio.play().catch(done)
                    return
                } catch {
                    // fall through to Web Speech API
                }
            }
            this._fallback(clean, resolve)
        })
    },

    _fallback(text, onDone) {
        const done = onDone || (() => {})
        if (!('speechSynthesis' in window)) { done(); return }
        const u = new SpeechSynthesisUtterance(text)
        u.rate = 0.88; u.pitch = 1.08; u.volume = 1
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
    btn.title = LuloVoice.enabled ? 'Voice ON — tap to mute' : 'Voice OFF — tap to enable'
}
