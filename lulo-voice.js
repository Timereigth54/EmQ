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
    // Paste RunPod endpoint URL here after deployment (see voice-server/DEPLOY.md).
    // Remember to add the same origin to connect-src in index.html's CSP meta tag.
    endpoint: null,
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

    async _drain() {
        if (this._speaking) return
        const next = this._queue.shift()
        if (next === undefined) return
        this._speaking = true
        try {
            await this._utter(next)
        } catch {
            // A failed line should never stall the queue
        }
        this._speaking = false
        if (this.enabled) this._drain()
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
                    const done = () => {
                        URL.revokeObjectURL(url)
                        if (this.currentAudio === audio) this.currentAudio = null
                        resolve()
                    }
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
        const finish = onDone || (() => {})
        if (!('speechSynthesis' in window)) { finish(); return }
        const u = new SpeechSynthesisUtterance(text)
        u.rate = 0.88; u.pitch = 1.08; u.volume = 1
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
