/*
 * Em_Q — lulo-wave.js
 * Voice made visible. Two visualisers sharing one animation loop:
 *
 *   • #mic-wave           a ring of bars around the mic, while you speak
 *   • #lulo-wave          a cardiogram trace under Lulo, while she speaks
 *   • #lulo-wave-presence the same trace, while she is behind a card
 *
 * WHY THESE ARE NOT METERED
 * Both could read real amplitude, and both ways of getting it would cost
 * something this app has already paid for once:
 *
 *   The mic runs on SpeechRecognition, which exposes no audio stream. Metering
 *   it means holding a second getUserMedia capture open alongside the
 *   recogniser — on Android that competes with the recogniser's own capture,
 *   and long-utterance cut-off is a bug this app has already had to fix.
 *
 *   Her voice arrives as an <audio> element. Metering it means routing that
 *   element through an AudioContext, and a suspended context — screen off,
 *   tab hidden — then silences her. That is exactly the screen-off audio bug
 *   that was fixed in d22a31f.
 *
 * So both traces are driven by speech *state* plus a syllable envelope: bursts
 * of 90–240ms with short gaps between them, which is what gives the trace its
 * flat-then-alive cardiogram rhythm. Nothing here can affect audio.
 *
 * Loaded before app.js. Depends on nothing.
 */

const LuloWave = {
    // Theme accent as "r,g,b" — setTheme() keeps this in step.
    rgb: '0,255,120',

    _raf: null,
    _lastT: 0,
    _reduced: false,

    mic: null,      // { el, ctx, w, h, bars }
    voice: null,    // { el, ctx, w, h, bars }
    // Her bars run through the app's own sky: green through cyan into violet.
    hue: { from: 128, to: 288 },
    light: false,

    micOn: false,
    micHot: false,  // the recogniser has actually heard speech
    micLevel: 0,

    luloOn: false,
    luloLevel: 0,

    // Syllable envelope, shared by both visualisers
    _env: 0,
    _envTarget: 0,
    _envHold: 0,

    init() {
        this._reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        const mic = document.getElementById('mic-wave')
        if (mic) this.mic = this._prepare(mic, 150, 150, 40)

        const voice = document.getElementById('lulo-wave')
        if (voice) this.voice = this._prepare(voice, 268, 56, 30)

        window.addEventListener('resize', () => this.place())
        this.place()
    },

    // Park the bars wherever Lulo is standing. Measured rather than fixed in
    // CSS: her feet land in a different place on every screen height, and a
    // percentage that works on a tall phone puts the bars through her chin on
    // a short one.
    place() {
        const el = this.voice && this.voice.el
        if (!el) return
        const behind = document.body.classList.contains('room-focus')
        if (behind) {
            // Below the card — but a card's height depends on what is in it. A
            // verse leaves half the screen; a full prayer leaves a sliver, and
            // a fixed percentage puts the bars straight through the last line
            // of it. Measure the card, take the gap under it, and if there is
            // no room between the card and the mic, don't draw at all.
            const card = document.getElementById('scripture-card')
            const r = card && card.getBoundingClientRect()
            // Clears the mic button and its swipe hint, not just the screen edge
            const MIC_RESERVE = 172
            const gapTop = r ? r.bottom : window.innerHeight * 0.66
            const gapBottom = window.innerHeight - MIC_RESERVE
            const gap = gapBottom - gapTop
            // A prayer can leave a sliver where a verse leaves half a screen.
            // Rather than drop her voice on the longest thing she ever says,
            // the row flattens into whatever height is left — and only gives up
            // when there is genuinely nowhere to stand.
            if (gap < 20) { el.style.display = 'none'; return }
            el.style.display = ''
            el.style.transform =
                `translate(-50%, -50%) scaleY(${Math.min(1, (gap - 4) / this.voice.h).toFixed(2)})`
            el.style.top = Math.round(gapTop + gap / 2) + 'px'
            return
        }
        el.style.display = ''
        el.style.transform = 'translate(-50%, -50%)'
        const face = document.getElementById('lulo-face')
        const r = face && face.getBoundingClientRect()
        // Her artwork carries transparent padding at the bottom, so her feet
        // sit above the box — the bars come up to meet them.
        el.style.top = r && r.height
            ? Math.round(r.bottom - r.height * 0.11) + 'px'
            : Math.round(window.innerHeight * 0.55) + 'px'
    },

    // Canvases are fixed-size in CSS; the backing store is scaled to the
    // display so the 2px trace doesn't come out soft on a phone.
    _prepare(el, w, h, bars) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
        el.style.width = w + 'px'
        el.style.height = h + 'px'
        const ctx = el.getContext('2d')
        ctx.scale(dpr, dpr)
        const o = { el, ctx, w, h }
        if (bars) o.bars = new Float32Array(bars)
        return o
    },

    setColour(rgb) {
        this.rgb = rgb
    },

    // ─── PUBLIC ─────────────────────────────────────────────────────────────

    micStart()          { this.micOn = true;  this.micHot = false; this._show(this.mic, true);  this._run() },
    micSpeaking(on)     { this.micHot = !!on },
    micStop()           { this.micOn = false; this.micHot = false; this._show(this.mic, false); this._run() },

    speakStart()        { this.luloOn = true;  this.place(); this._show(this.voice, true);  this._run() },
    speakStop()         { this.luloOn = false; this._show(this.voice, false); this._run() },

    // She has moved. The bars follow her, mid-sentence if need be.
    syncTraces() { this.place() },

    // ─── LOOP ───────────────────────────────────────────────────────────────

    _show(o, on) {
        if (o && o.el) o.el.classList.toggle('wave-on', on)
    },

    _run() {
        if (this._raf !== null) return
        this._lastT = 0
        this._raf = requestAnimationFrame(t => this._tick(t))
    },

    _tick(t) {
        const dt = this._lastT ? Math.min(64, t - this._lastT) : 16
        this._lastT = t

        // Levels ease in and out so the ring and the bars grow into the room
        // rather than switching on. Reduced motion gets one still frame, so it
        // has to arrive at full size in that frame rather than easing toward a
        // second one that never comes.
        const ease = this._reduced ? 1 : Math.min(1, dt / 170)
        this.micLevel  += ((this.micOn  ? 1 : 0) - this.micLevel)  * ease
        this.luloLevel += ((this.luloOn ? 1 : 0) - this.luloLevel) * ease

        this._advanceEnv(dt, t)

        if (this.mic) this._drawRing(this.mic, t)
        if (this.voice) this._drawBars(this.voice, t)

        // Nothing to draw and nothing fading — stop burning frames.
        if (!this.micOn && !this.luloOn && this.micLevel < 0.01 && this.luloLevel < 0.01) {
            this.micLevel = 0
            this.luloLevel = 0
            if (this.mic) this.mic.ctx.clearRect(0, 0, this.mic.w, this.mic.h)
            if (this.voice) this.voice.ctx.clearRect(0, 0, this.voice.w, this.voice.h)
            this._raf = null
            return
        }
        // A still room gets one frame, not sixty.
        if (this._reduced) { this._raf = null; return }
        this._raf = requestAnimationFrame(t2 => this._tick(t2))
    },

    // Speech is bursts and gaps, not a steady tone. Holding a random target for
    // a syllable's worth of time and easing toward it is what makes the trace
    // read as a voice instead of as a sine wave.
    _advanceEnv(dt, t) {
        if (t >= this._envHold) {
            const voiced = Math.random() > 0.26
            this._envTarget = voiced ? 0.55 + Math.random() * 0.45
                                     : 0.05 + Math.random() * 0.12
            this._envHold = t + (voiced ? 90 + Math.random() * 150
                                        : 70 + Math.random() * 130)
        }
        this._env += (this._envTarget - this._env) * Math.min(1, dt / 55)
    },

    // ─── THE MIC RING ───────────────────────────────────────────────────────

    _drawRing(m, t) {
        const g = m.ctx
        g.clearRect(0, 0, m.w, m.h)
        if (this.micLevel < 0.01) return

        const cx = m.w / 2
        const cy = m.h / 2
        const inner = 45
        const n = m.bars.length
        // Before the recogniser hears anything the ring idles: present, waiting,
        // not pretending to hear a voice that isn't there yet.
        const energy = this.micHot ? this._env : 0.14

        // Deliberately restrained. This has one job — telling you the mic is
        // hearing you — and a tall, bright, fast ring reads as a party trick
        // sitting on top of the one control you have to trust.
        g.lineCap = 'round'
        g.lineWidth = 1.8
        g.shadowColor = `rgba(${this.rgb},0.4)`
        g.shadowBlur = 4

        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2
            // Two waves running opposite ways around the ring, so the pattern
            // never lands back on itself the way a single one does.
            const w1 = Math.sin(a * 3 + t / 300)
            const w2 = Math.sin(a * 5 - t / 470)
            const target = 0.18 + (0.4 + 0.32 * w1 + 0.2 * w2) * energy
            m.bars[i] += (target - m.bars[i]) * 0.18

            const len = (2 + Math.max(0, m.bars[i]) * 8.5) * this.micLevel
            const ca = Math.cos(a)
            const sa = Math.sin(a)
            g.strokeStyle = `rgba(${this.rgb},${(0.22 + m.bars[i] * 0.34) * this.micLevel})`
            g.beginPath()
            g.moveTo(cx + ca * inner, cy + sa * inner)
            g.lineTo(cx + ca * (inner + len), cy + sa * (inner + len))
            g.stroke()
        }
        g.shadowBlur = 0
    },

    // ─── HER VOICE ──────────────────────────────────────────────────────────

    // Bars, mirrored about a centre line, lit across the spectrum. The colour
    // runs green → cyan → violet along the row and drifts slowly, so the wave
    // is hers rather than another green UI accent: this is the one element in
    // the room that exists purely to say she is talking.
    _drawBars(o, t) {
        const g = o.ctx
        g.clearRect(0, 0, o.w, o.h)
        if (this.luloLevel < 0.01) return

        const n = o.bars.length
        const mid = o.h / 2
        const maxH = (o.h / 2 - 3) * this.luloLevel
        const slot = o.w / n
        const bw = Math.max(3, slot * 0.46)
        // Breathes across a narrow band rather than accumulating — a hue that
        // keeps climbing walks the whole row through red and orange, which
        // belongs to some other app.
        const drift = 16 * Math.sin(t / 3800)

        g.lineCap = 'round'
        g.lineWidth = bw

        for (let i = 0; i < n; i++) {
            const p = (i + 0.5) / n
            // Two slow waves at unrelated speeds — one alone marches the bars
            // in a visible ripple, which reads as a loading animation.
            const w = 0.5 + 0.5 * Math.sin(i * 0.72 + t / 205)
                              * Math.sin(i * 0.29 - t / 355)
            const target = 0.08 + (0.18 + 0.82 * w) * this._env
            o.bars[i] += (target - o.bars[i]) * 0.24

            // The row fades into the room at both ends rather than stopping
            const taper = Math.pow(Math.sin(Math.PI * p), 0.55)
            const h = Math.max(1.5, o.bars[i] * maxH * taper)

            const hue = this.hue.from + (this.hue.to - this.hue.from) * p + drift
            const a = (0.55 + 0.45 * o.bars[i]) * taper * this.luloLevel
            const colour = this.light
                ? `hsla(${hue % 360}, 62%, 42%, ${a})`
                : `hsla(${hue % 360}, 92%, 62%, ${a})`

            g.strokeStyle = colour
            g.shadowColor = colour
            g.shadowBlur = this.light ? 0 : 8

            const x = slot * (i + 0.5)
            g.beginPath()
            g.moveTo(x, mid - h)
            g.lineTo(x, mid + h)
            g.stroke()
        }
        g.shadowBlur = 0
    },
}
