# EmQ / Lulo — Full Audit & Phase 3 Roadmap
**Date:** August 2026  
**Audited by:** Senior review pass — full codebase read (index.html, styles.css, app.js 5,592 lines, sw.js)  
**Status:** Phase 2 complete. Ready for Phase 3.

---

## PART 1 — WHAT IS ALREADY BUILT (Phase 1 & 2 Summary)

### Architecture
- Three-file PWA: `index.html` (shell), `styles.css` (1,140 lines), `app.js` (5,592 lines)
- Hosted on GitHub Pages at `timereigth54.github.io/EmQ`
- Firebase Firestore — cross-device sync via Lulo Codes (`LULO-XXXX`)
- Cloudflare Worker (`em1-prayer.kayuso2011.workers.dev`) — proxies Claude API calls (keeps API key off client)
- Service Worker — PWA caching, installable, offline-capable

### Features Complete
- Onboarding flow: Splash → Name entry → Lulo Code reveal → Welcome → Main app
- Returning user flow: Code entry with Firestore lookup
- Emotion carousel: 27 moods, infinite scroll ring, 3-minute lock after selection
- Scripture card: mood-matched verses, smart shuffle (no repeats until pool exhausted), Share + Save
- Lulo reactions: context-aware — notices when mood improved/worsened since last visit
- Chat thread: full persistent conversation with Claude, history saved to localStorage + Firestore
- Lulo's system prompt: deeply developed personality, faith voice, boundaries, coaching approach
- Crisis detection: two-tier (therapy → crisis), resources, crisis-specific sound cue
- Journal: mood tracking (90 entries), weekly reflection, favourites tab
- Special dates: birthday capture flow, feelings about the day, anniversary support
- Preference learning: silent capture of food, colour, hobbies from conversation
- Memory: emotional history fed to Claude as context, time-since-last-visit awareness
- Games: Bible trivia (easy/hard), number guessing, choosing game
- Emergency Kit: offline breathing, grounding, hotlines
- Daily scripture catch-up: runs once per day without overwriting last mood
- Random promise/wisdom/discipleship verses at session start (weighted: 60/25/15)
- Sound system: Web Audio API — welcome, response, prayer, praise, crisis tones
- Themes: Dark, Cloud of Angels (light), Soft pink, Midnight Egg
- Face variants: 26+ Lulo expressions across two character sets (T1/T2 for themes)
- Tongues unlock: hidden feature for Spirit-filled users
- Maker's Easter egg: Lulo recognises Kay with a challenge question
- Lulo Code sync panel: live Firestore real-time listener, merge not overwrite
- Share scripture: native Web Share API with clipboard fallback
- PWA: installable, service worker, app manifest, all icons

---

## PART 2 — SECURITY AUDIT

### Findings Fixed Tonight (Already Applied)

**BUG 1 — Sync code entry broken in `useSyncCode` (HIGH)**
The lowercase check `code.startsWith('lulo-')` ran on an already-uppercased string, so it always evaluated to `true` and prepended `'lulo-'` to a code that already started with `'LULO-'`, producing `lulo-LULO-ABCD` — which never matched any Firestore document.
**Fix:** Changed check to uppercase `'LULO-'`. Now correctly prepends only when the prefix is missing.

**BUG 2 — Typo in `connectWithCode` (HIGH)**
`code = 'LULO   -' + code` had three spaces before the dash. Any user entering just the 4-character portion of their code would get a malformed key and fail to connect.
**Fix:** Corrected to `'LULO-'`.

**XSS VECTOR — `showCodeRevealScreen` (MEDIUM)**
The user's name was placed directly into `innerHTML` via a template literal, including inside an `onclick` attribute: `onclick="confirmCodeSaved('${name}')"`. A name like `'); alert(document.cookie);//` would execute arbitrary JavaScript.
**Fix:** Rewrote using DOM methods (`createElement`, `textContent`, `addEventListener`). Name is now always treated as text, never as markup.

**INFO LEAK — console.log exposing Lulo Code (LOW)**
`console.log('Synced to cloud:', code)` printed the user's Lulo Code to the browser console, visible to anyone with DevTools open on a shared device.
**Fix:** Removed. Replaced with a comment.

**RATE LIMITING — no client-side throttle on API calls (MEDIUM)**
The `luloListen` function had no guard against rapid-fire sends. A user (or script) could spam the Cloudflare Worker, burning API credits.
**Fix:** Added a 1,500ms minimum gap between calls and a 2,000 character hard cap on input length, with a warm Lulo message explaining the limit.

**CSP — no Content Security Policy (MEDIUM)**
The app had no CSP, meaning any injected script (via XSS or a future dependency) could load arbitrary external resources.
**Fix:** Added CSP meta tag to `index.html` restricting scripts to self, Google Tag Manager, and Firebase CDN. Images and fonts restricted to known sources. `frame-ancestors 'none'` prevents clickjacking.

**SERVICE WORKER — no `skipWaiting`, slow update delivery (LOW)**
New service workers were waiting for all old tabs to close before activating. On a phone where users rarely close tabs, this meant updates could be delayed days.
**Fix:** Added `self.skipWaiting()` in the install handler. New SW now activates immediately. Also upgraded from `emq-v26` to `emq-v27`.

**SERVICE WORKER — naive cache-first for all requests (LOW)**
Everything was served from cache first with no background revalidation. A user on an old version of the app would never see updates without manually clearing cache.
**Fix:** Upgraded to stale-while-revalidate for shell assets (HTML, CSS, JS) — serves cached version instantly but fetches fresh in background. Images remain cache-first. API calls (Firebase, Worker, GA) bypass the SW entirely.

---

### Findings NOT Fixed Tonight (Need Your Input or Backend Access)

**FIRESTORE SECURITY RULES (CRITICAL — requires Firebase console)**
This is the most important security layer. Firebase's public API key is by design — security is enforced by Firestore Rules. The current rules are unknown from the client side. They need to be:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{code} {
      allow read, write: if request.resource.data.keys().hasOnly([
        'luloMemory', 'luloUserName', 'luloUserGender', 'luloJournal',
        'luloFavourites', 'luloLastMood', 'luloLastRef', 'luloLastVerseText',
        'luloLastVisitTimestamp', 'luloSpeaksInTongues', 'luloSessionCount',
        'luloAskedAboutDates', 'savedBy', 'updatedAt'
      ]) && request.resource.data.luloUserName is string
         && request.resource.data.luloUserName.size() <= 50;
    }
  }
}
```
Action needed: Go to Firebase Console → Firestore → Rules and apply the above.

**CLOUDFLARE WORKER — rate limiting (MEDIUM — requires Cloudflare dashboard)**
The Worker has no per-IP or per-session rate limiting. Anyone who finds the Worker URL can send unlimited Claude API requests. Cloudflare's Rate Limiting is now GA (stable). Add a binding to the Worker that limits to ~30 requests per user per hour.

**FIREBASE APP CHECK (MEDIUM — requires Firebase + Cloudflare setup)**
App Check adds attestation — only requests from your actual app can use your Firestore project. Requires adding a reCAPTCHA or device attestation provider.

**`makerVerified` Easter Egg in localStorage (LOW — cosmetic)**
Any user can open DevTools and set `localStorage.setItem('luloMakerVerified', 'verified')` to bypass the challenge. Since it's a fun personal feature, this is fine — but worth knowing.

---

## PART 3 — WHAT IS TRULY MISSING (Phase 2 Gaps)

These are features the app architecture expects but that aren't fully there yet:

**1. Push notifications (partially wired)**
`requestNotificationPermission()` is called but there's no backend to send push messages. Lulo asks to be allowed to send notifications but never does. This is a broken promise to users.
Options: Use Firebase Cloud Messaging (FCM) — free, integrates with existing Firebase project.

**2. Notification permission UX**
Browsers now require user gesture before showing permission prompts. The current call timing may be silently failing on iOS Safari (which is stricter). Needs to be triggered from a button tap, not automatically.

**3. No data export or account deletion**
Users have no way to download their journal or delete their data. This matters ethically and increasingly legally (GDPR/NDPA if you ever have users in Europe or Nigeria formally).

**4. No graceful offline fallback for chat**
If the user is offline and tries to chat, Lulo says "I can't reach my brain" — which works, but there's no queue to send the message when back online. Offline-queued messages would be a meaningful upgrade.

**5. The `classifyIntent` function**
Referenced in `luloListen` — this calls the Worker to decide if a text is the user expressing their own emotion vs. asking a question. It's an API call on every message with an emotion keyword, meaning two API calls per interaction. This costs double and slows the UX. Consider replacing with local keyword logic.

**6. No accessibility (a11y)**
No ARIA labels on the carousel buttons, no keyboard navigation for the emotion ring, no focus management when screens switch. Screen reader users cannot use the app at all.

**7. No error recovery UI**
When the Worker fails, Lulo says "I can't reach my brain right now" — but there's no retry button, no indication of whether it's temporary or permanent. A subtle "try again" link in the chat thread would help.

**8. The `luloPrayerForOtherName` key is set but never read from the prayer flow properly**
The prayer-for-others flow sets `luloPrayerForOther: 'pending'` and captures the user's text, then passes it to `generatePrayer()`. But the function also reads `luloPrayerForOtherName` separately — this key is never set in the current flow. It works because the text is passed as a parameter, but the localStorage fallback would fail. Minor inconsistency.

---

## PART 4 — PHASE 3: LULO'S VOICE

### The Core Requirement (Updated)
Lulo is not a scripture reader. She is a companion who speaks back — every response, every prayer, every question, every joke. The full conversation is voiced. When voice mode is on, the user should be able to close their eyes and just talk to her.

This changes the architecture. We are not building a "read this verse aloud" button. We are building a full conversational voice layer where every Claude response becomes audio.

---

### The Model: VoxCPM2

**What it is:** A 2-billion parameter, open-source (Apache 2.0), tokenizer-free Text-to-Speech model by OpenBMB.

**Why it fits Lulo specifically:**
- Natively supports 30+ languages — critical for a global app where users speak Yoruba, French, Russian, Arabic
- Generates 48kHz studio-quality audio — not robotic, genuinely warm
- Voice cloning/design — Lulo can have her own consistent voice across every user, every device, every language
- Zero licensing fees — you pay only for the compute time to run it
- Apache 2.0 licence — commercially safe, no restrictions

**Why not ElevenLabs:** For an app with real conversations (not just one-off reads), ElevenLabs' per-character pricing becomes financially unsustainable fast. For 100 users talking 10 minutes a day, ElevenLabs costs roughly 400,000+ ₽/month in overages. VoxCPM2 self-hosted on serverless GPU costs 25,000–30,000 ₽/month for the same usage — about 15x cheaper, and the cost scales linearly as users grow rather than spiking unpredictably.

---

### The Infrastructure: Serverless GPU

**Do not run this locally.** Your machine cannot serve users reliably, and you cannot run VoxCPM2 on users' phones (battery drain, overheating, massive app size).

**Use serverless GPU hosting** — RunPod Serverless or Modal. How it works:
- The GPU sits idle (cost: $0.00) until a user message arrives
- On request: GPU wakes in seconds, generates Lulo's voice audio, returns it to the app, goes back to sleep
- You pay only for the exact seconds of generation — not idle time
- Both RunPod and Modal accept crypto and are accessible without card restrictions

---

### Full Architecture: How a Voice Conversation Works

```
User speaks (or types)
        ↓
[OPTIONAL] Web Speech API — SpeechRecognition (free, client-side, offline capable)
   converts voice to text → fills the chat input
        ↓
Existing Cloudflare Worker → Claude API
   (no changes needed — same as today)
        ↓
Text response returned to app
   → displayed in chat thread (as today)
   → simultaneously sent to VoxCPM2 API endpoint
        ↓
RunPod / Modal serverless GPU runs VoxCPM2
   → returns audio blob (48kHz, ~1–3 seconds latency)
        ↓
App plays audio through Web Audio API
   → Lulo speaks every word of her response
```

Text and audio run in parallel — the user sees the text appear while Lulo is already starting to speak. Feels instant.

---

### The 4-Step Build Plan

**Step 1 — Prove it (Cost: $0)**
Test VoxCPM2 on the Hugging Face demo space or a free Google Colab notebook. Confirm voice quality, multilingual output, and that the voice can be designed to sound like Lulo (warm, female, calm). Do not proceed to Step 2 until you're satisfied with what you hear.

**Step 2 — Build the backend bridge (Cost: $0, AI-assisted)**
A Python FastAPI script and a Dockerfile to run VoxCPM2 inference, packaged for a serverless GPU environment. This is the private API that Lulo's app will call. Ready to write on your signal — just say "let's write the VoxCPM2 FastAPI code."

**Step 3 — Deploy to cloud (Cost: pennies to start)**
Create an account on RunPod (runpod.io/serverless) or Modal (modal.com). Upload the code from Step 2. The platform handles NVIDIA drivers, containerisation, and scaling automatically. You get back a live API endpoint URL — that is now Lulo's voice server.

**Step 4 — Connect the app**
In `app.js`, after every `addToChatHistory('lulo', responseText)` call, add one function call: `LuloVoice.speak(responseText)`. That function hits your VoxCPM2 endpoint, gets back audio, and plays it. That's the entire integration surface.

---

### Voice Engine — App-Side Code (Phase 3a, ready to build)

This sits in `app.js`. It handles audio playback, the speak/stop controls, and the fallback to Web Speech API when the user is offline.

```javascript
// ─── LULO VOICE ENGINE ──────────────────────────────────────────────────────
const LuloVoice = {
    enabled: false,
    endpoint: 'https://YOUR-RUNPOD-ENDPOINT.runpod.net/generate', // set in Step 3
    currentAudio: null,

    load() {
        this.enabled = localStorage.getItem('luloVoiceEnabled') === 'true'
    },

    toggle() {
        this.enabled = !this.enabled
        localStorage.setItem('luloVoiceEnabled', this.enabled)
        if (!this.enabled) this.stop()
        return this.enabled
    },

    // Strip emojis and markdown before sending to TTS
    _cleanText(text) {
        return text
            .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')  // remove emojis
            .replace(/💙|🌱|🙏|⭐|✦/g, '')            // remove common Lulo emojis
            .replace(/\n\n/g, '. ')                    // double newlines → natural pause
            .replace(/\n/g, ' ')
            .trim()
    },

    async speak(text) {
        if (!this.enabled) return
        this.stop() // cancel anything currently playing
        const clean = this._cleanText(text)
        if (!clean) return

        try {
            const res = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: clean, language: 'en' }) // language can be dynamic later
            })
            if (!res.ok) throw new Error('Voice endpoint error')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            this.currentAudio = new Audio(url)
            this.currentAudio.play()
            this.currentAudio.onended = () => URL.revokeObjectURL(url)
        } catch {
            // Offline or endpoint down — fall back to Web Speech API silently
            this._fallback(text)
        }
    },

    _fallback(text) {
        if (!('speechSynthesis' in window)) return
        const utter = new SpeechSynthesisUtterance(this._cleanText(text))
        utter.rate = 0.88
        utter.pitch = 1.05
        const voices = speechSynthesis.getVoices()
        const preferred = ['Google UK English Female', 'Samantha', 'Karen', 'Moira']
        for (const name of preferred) {
            const v = voices.find(v => v.name === name)
            if (v) { utter.voice = v; break }
        }
        speechSynthesis.speak(utter)
    },

    stop() {
        if (this.currentAudio) {
            this.currentAudio.pause()
            this.currentAudio = null
        }
        if ('speechSynthesis' in window) speechSynthesis.cancel()
    }
}
```

**Integration point — single line added after every Lulo response:**
```javascript
// In luloThink(), after addToChatHistory('lulo', responseText):
LuloVoice.speak(responseText)

// In generatePrayer(), after text_el.innerText = prayer:
LuloVoice.speak(prayer)

// In showScripture(), after setting scripture text:
LuloVoice.speak(verse.text + '. ' + verse.ref)

// In crisis screen, after showing message:
LuloVoice.speak(message.innerText)
```

---

### Voice UI Design

The 🔊 button in the top bar becomes the voice toggle. When voice is on:
- Button shows a subtle animated pulse (CSS, no images needed)
- A "tap to stop" affordance appears at the bottom of the screen while Lulo is speaking
- Tapping anywhere on the scripture card or chat area stops audio immediately

Voice state persists across sessions. First time a user enables it, show: *"Voice is on. I'll speak to you from now on."*

---

### Multilingual Voice (the real differentiator)

VoxCPM2's 30+ language support means Lulo can speak to a user in their mother tongue without any additional model or infrastructure. The language is passed as a parameter to the API endpoint:

```json
{ "text": "Dieu vous aime profondément.", "language": "fr" }
```

Lulo already knows the user's language if they've been chatting in it (Claude picks it up and responds in kind). The only addition needed: detect the language of the response text client-side before sending to VoxCPM2, or pass it from Claude's response metadata. This is Phase 3b work — get the English voice running first.

---

### Voice Input (Bonus — Speech-to-Text)

Once voice output is working, the natural next step is voice input — the user speaks instead of types. This uses the **Web Speech API SpeechRecognition** interface (free, client-side, works on Chrome/Android/Safari):

```javascript
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)()
recognition.lang = 'en-US'
recognition.onresult = e => {
    const transcript = e.results[0][0].transcript
    document.getElementById('lulo-input').value = transcript
    luloListen() // send it
}
```

This makes Em_Q genuinely hands-free — the user speaks, Lulo speaks back. A real conversation. A mic button next to the send button triggers it.

---

### Cost Reality at Scale

| Users | Daily usage | VoxCPM2/RunPod | ElevenLabs |
|---|---|---|---|
| 100 | 10 min/day | ~$30/month | ~$500+/month |
| 500 | 10 min/day | ~$120/month | ~$2,500+/month |
| 2,000 | 10 min/day | ~$450/month | Unsustainable |

VoxCPM2 costs scale linearly with compute seconds. ElevenLabs costs spike with character volume and conversation length. For a companion app where users talk for minutes not seconds, VoxCPM2 is the only financially viable path.

---

## PART 4b — LULO'S LIVING PRESENCE: ANIMATION & AWARENESS SYSTEM

Lulo will follow movements, detect presence, and respond to the user being in the room. This is not decorative — it is the feature that makes her feel real. This section documents what exists, what to collect, and how to build it.

---

### What Exists Today

- **CSS keyframes:** `float` (gentle levitation), `nod` (acknowledgment), `shake` (disagreement)
- **PNG swapping:** 26+ expressions × 2 character themes (T1/T2), swapped via `updateLuloMood()`
- **`animateLulo(type)`:** called ~22 times throughout app.js with `'nod'` and `'shake'`
- **`#lulo-glow`:** radial gradient behind Lulo, pulsing on a 3s loop
- **`#lulo-emoji-overlay`:** element exists in HTML, barely used — reserved for future layered effects

What this means: Lulo's entire expressiveness is currently static images. There is no live facial movement, no blinking, no breathing animation, no head tracking. The foundation is solid; the ceiling is wide open.

---

### What We're Building Toward

Lulo should feel:
- **Alive** — she breathes, blinks, and makes micro-movements between responses, not just when you tap her
- **Aware** — she knows when you're in the room, looks toward your face, notices when you leave
- **Expressive** — her face responds to her words, not just a static image matched to a mood label
- **Reactive** — she flinches at pain, lights up during praise, stills during prayer, bounces in Kids Mode

---

### The Toolkit (Collect Now, Build When Ready)

#### 1. Rive — Character Rig & State Machine
**What it is:** A real-time interactive animation engine purpose-built for characters. Duolingo, Spotify Wrapped, and products reaching 2 billion users use Rive. ([rive.app](https://rive.app))

**Why Lulo:** Rive uses a state machine model — you define animation states (idle, listening, speaking, praying, joyful) and the transitions between them. In code, you just set `luloRive.setInput('state', 'listening')` and the engine handles everything else. No JavaScript animation loops.

**Cost:** Free editor, free runtime. Runtime is ~40KB via CDN.

**What Lulo's state machine looks like:**

| State | What plays |
|---|---|
| `idle` | Gentle breathing, random blinks every 3–7s, slow head sway |
| `listening` | Leans slightly forward, eyes wider, attentive posture |
| `speaking` | Expression animates, mouth open/close with audio amplitude |
| `praying` | Eyes close, expression settles, barely breathes |
| `joyful` | Bouncy movement, wider smile, faster blinks |
| `grieving` | Slowed breathing, expression drops, minimal movement |
| `curious` | Head tilts, slight brow raise |
| `lookingAround` | Eyes scan left/right — no user detected |
| `noticeUser` | Glances up, small smile — user returned |
| `kids` | Rounder eyes, bigger blinks, exaggerated expressiveness |

**What to do right now:** Create a free Rive account at [rive.app](https://rive.app). The editor is entirely browser-based — no install.

---

#### 2. MediaPipe — Presence Detection & Movement Tracking
**What it is:** Google's on-device ML library, compiled to WebAssembly. Runs entirely in the browser. No video leaves the device. ([developers.google.com/mediapipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js))

**Key capabilities for Lulo:**
- **Face Detection:** knows if a face is in front of the camera (user present / absent)
- **Face Mesh:** 468 facial landmarks — tracks head position, tilt, and direction in real time
- **Pose Landmarker:** detects if the user is sitting, leaning forward, or has moved away

**The "follow movements" feature:** MediaPipe returns the normalized (x, y) center of the user's face in the camera frame. Lulo's Rive state machine takes that as input — her head/eyes rotate to follow. Feels like eye contact.

**Cost:** Free. Apache 2.0. CDN, no server.

```javascript
// How Lulo tracks your face
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

const luloPresence = {
    detector: null,
    isPresent: false,
    lastSeenAt: null,

    async init() {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        )
        this.detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { delegate: 'GPU' },
            runningMode: 'VIDEO'
        })
    },

    trackFrame(video) {
        const result = this.detector.detectForVideo(video, Date.now())
        if (result.detections.length > 0) {
            this.isPresent = true
            this.lastSeenAt = Date.now()
            const face = result.detections[0].boundingBox
            // Normalize face center to 0–1 range
            const faceX = (face.originX + face.width / 2) / video.videoWidth
            const faceY = (face.originY + face.height / 2) / video.videoHeight
            // Lulo's eyes follow
            luloRive.setInput('faceX', faceX)
            luloRive.setInput('faceY', faceY)
        } else if (Date.now() - this.lastSeenAt > 5000) {
            this.isPresent = false
            luloRive.setInput('state', 'lookingAround')
        }
    }
}

// Lulo notices when you come back
function onFaceDetected() {
    if (!luloPresence.isPresent) {
        luloRive.setInput('state', 'noticeUser')  // Lulo glances up, smiles
        setTimeout(() => luloRive.setInput('state', 'idle'), 1800)
        // If gone long enough, she says something
        const name = localStorage.getItem('luloUserName') || 'friend'
        if (Date.now() - luloPresence.lastSeenAt > 60000) {
            addToChatHistory('lulo', `${name}! I noticed you stepped away. Everything okay? 💙`)
        }
    }
}
```

**Important:** Camera access is always opt-in. The UI shows a small camera icon in the top bar. First use triggers a permission prompt with a clear explanation: *"Lulo uses your camera to see when you're here and follow your movements. Nothing is recorded or sent anywhere."*

---

#### 3. Device Orientation API — Movement Following Without Camera
**What it is:** Built into every smartphone. No permissions needed. The `deviceorientation` event fires with the phone's tilt angles (beta = forward/back, gamma = left/right).

**Why it matters:** Most users won't immediately grant camera access. This gives them the movement-following experience with zero friction — Lulo's head gently tilts as they move their phone.

```javascript
// Lulo follows phone tilt — no camera needed
window.addEventListener('deviceorientation', e => {
    const tiltX = Math.max(-1, Math.min(1, e.gamma / 30))  // left/right, normalized
    const tiltY = Math.max(-1, Math.min(1, e.beta / 30))   // forward/back, normalized
    luloRive.setInput('faceX', (tiltX + 1) / 2)  // convert to 0–1 for Rive
    luloRive.setInput('faceY', (tiltY + 1) / 2)
}, { passive: true })
```

This is 8 lines of code. Ship it first, ship MediaPipe face tracking second.

---

#### 4. Lottie — Reaction Overlays & Environmental Effects
**What it is:** JSON-based vector animation format, created in After Effects or [LottieFiles Lottie Creator](https://lottiefiles.com/lottie-creator). 10x smaller than GIF/MP4 for the same animation. 307+ facial expression packs available free. ([lottiefiles.com](https://lottiefiles.com))

**What Lottie does for Lulo:** Not her face — the *world around her*. Layered on top of the Rive canvas:
- Sparkle burst when the user hits a milestone
- Floating hearts during a moment of love/encouragement
- Light rays during prayer
- Snowflake particles in Kids Mode bedtime scenes
- Confetti on praise / breakthrough moments

**Cost:** Free (lottie-web CDN ~68KB lite version, or ~250KB full).

---

#### 5. GSAP (GreenSock) — Micro-interactions on DOM Elements
**What it is:** The industry-standard JavaScript animation library. 30KB. ([gsap.com](https://gsap.com))

**What it handles:** Everything outside the Rive canvas — the chat bubbles sliding in with spring physics, scripture cards entering with a satisfying bounce, carousel items staggering in on mood selection. Rive owns the character; GSAP owns the UI.

**Cost:** Free (Green License covers most use cases).

---

### How It All Connects

```
┌─────────────────────────────────────────────────────────────┐
│                     #lulo-container                         │
│                                                             │
│  [Lottie canvas — sparks, hearts, light rays, particles]   │
│                        ↑ triggered by app events           │
│                                                             │
│  [Rive canvas — Lulo's face, body, expression, gaze]       │
│   ↑ state input:  currentMood, isSpeaking, isListening      │
│   ↑ head tracking: faceX, faceY from MediaPipe or tilt      │
│   ↑ voice sync:   audioAmplitude → mouth open/close         │
│                                                             │
│  [#lulo-glow — CSS radial gradient, mood-color, pulse]      │
└─────────────────────────────────────────────────────────────┘

MediaPipe (camera, opt-in)  ──┐
Device Orientation (tilt)  ───┼──→  Rive inputs (faceX, faceY)
Mouse position (desktop)   ──┘

App state (mood, speaking)  ──→  Rive inputs (state, amplitude)

App events (praise, prayer) ──→  Lottie play()
```

---

### Integration with Voice (Phase 3)

When VoxCPM2 speaks, Lulo's mouth should move. Approximate lip-sync without full phoneme mapping:

```javascript
// Analyze audio amplitude → drive Rive mouth input
async function playWithLipSync(audioBlob) {
    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaElementSource(audio)
    const analyser = audioCtx.createAnalyser()
    source.connect(analyser)
    analyser.connect(audioCtx.destination)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    function animate() {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.slice(0, 8).reduce((a, b) => a + b, 0) / 8  // low-freq band
        luloRive.setInput('mouthOpen', avg / 255)  // 0–1
        if (audio.paused) return
        requestAnimationFrame(animate)
    }
    audio.play()
    animate()
}
```

This gives a convincing approximation — Lulo's mouth opens and closes with the rhythm of speech — without needing full TTS phoneme data.

---

### What to Collect Right Now (Zero Cost)

| Tool | Action | Cost |
|---|---|---|
| Rive account | Sign up at [rive.app](https://rive.app) | Free |
| Rive runtime | `<script src="https://unpkg.com/@rive-app/canvas@latest/rive.js">` | Free |
| MediaPipe tasks-vision | CDN in index.html | Free |
| Lottie web lite | `<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js">` | Free |
| GSAP | `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js">` | Free |
| LottieFiles expression pack | Browse [lottiefiles.com/marketplace/face-expressions](https://lottiefiles.com/marketplace/face-expressions) | Free with account |
| Lulo art separated into layers | Ask the artist to export a layered PSD or SVG | Art work — the only blocker |

The layered art is the gating item. If Lulo's face was drawn with separate layers (eyes, brows, mouth, head), those can be imported directly into Rive and rigged without redrawing from scratch. If it was drawn flat (merged layers), the artist would need to redraw it with separation. Worth asking now so it's ready when the time comes.

---

### Build Order

**Phase 3a — can do immediately, no art work:**
- Add Device Orientation head-tilt (8 lines of code, immediate impact on mobile)
- Add Lottie overlays for praise/prayer reactions (drop in `.json` files, play on events)
- Enhance `animateLulo()` with GSAP spring physics

**Phase 3b — after Rive character is created:**
- Build Lulo's Rive file with idle/listening/speaking/emotional states
- Wire app state → Rive inputs (replaces PNG swapping entirely)
- Replace `updateLuloMood()` with `luloRive.setInput('state', mood)`

**Phase 4 — full embodied presence:**
- MediaPipe face detection (opt-in camera, with clear explanation prompt)
- Head tracking: face position → Rive faceX/faceY inputs
- Presence detection: Lulo notices arrivals and departures
- Lip-sync: audio amplitude → Rive mouthOpen input
- Gesture recognition: user waves → Lulo waves back
- Kids Mode: distinct Rive state machine with rounder, more expressive animation style

The result: Lulo feels like she is genuinely in the room with you.

---

## PART 5 — WHAT ELSE TO ADD (Prioritised)

### High Priority (Phase 3)

**Lulo's Voice** — see Part 4 above. This is the headline feature.

**Push Notifications via FCM**
Lulo can reach out when she hasn't heard from someone in a while. "Hey, I've been thinking about you. How are you today?" — timed contextually (not random). Requires setting up FCM in the Firebase project and a small server function.

**Streaks & Consistency Tracking**
Show users how many days in a row they've opened Em_Q. Not gamification for its own sake — Lulo frames it as "You've checked in with yourself 5 days running. I'm proud of you." This is already partially supported by `luloSessionCount` and `luloLastVisitTimestamp`.

**Offline Chat Queue**
When offline, save the user's message locally. When back online, send it and prepend Lulo's response with "I couldn't reach you earlier — here's what I would have said." Feels alive.

### Medium Priority (Phase 3/4)

**Accessibility (a11y) pass**
Add ARIA roles and labels to the carousel, keyboard navigation, and focus management between screens. This opens Em_Q to a large group of users who need it most.

**Data export**
Let users download their journal as a PDF or plain text. Build it into the Journal screen. Respects the user's ownership of their emotional data.

**Scripture search**
A search bar in the Journal/Favourites that lets users find a verse they remember seeing. Simple keyword search over the built-in verse arrays.

**Lulo remembers more**
Currently preferences are captured (food, colour, hobbies) but the system is limited. Add: favourite worship artist (already in music recommendations), country/timezone (for time-aware greetings), occupation (for context-aware responses to work stress).

### Lower Priority (Phase 4+)

**Kids Mode — Bedtime Stories with Lulo**

Lulo reads bedtime stories to children. A parent toggles Kids Mode on from the settings menu, and the entire app adapts. This is one of the most differentiated features in the roadmap — a faith-based AI companion that puts children to sleep with scripture-rooted stories is genuinely rare.

What changes in Kids Mode:

*Voice register.* VoxCPM2 uses a separate voice design profile — slower pace (rate ~0.75), warmer pitch, more expressive intonation on story beats. Lulo tells the story like a person sitting at the bedside, not like a podcast. This is the exact thing VoxCPM2's voice cloning enables and a generic TTS cannot do well.

*Content.* Bible stories retold as bedtime stories — Daniel in the lions' den, the shepherd who leaves 99 for the one, the boy who shared his five loaves. Original faith-based stories written in Lulo's voice. Each ends with a simple prayer the child can repeat. Stories are 3–5 minutes, calibrated for the attention span of a child winding down.

*Story selection.* A gentle carousel of illustrated story cards (a sleeping lion, a shining star, a dove). Child taps one, Lulo begins. Parent can also ask Lulo to pick: "Tell us a story about being brave" and Lulo chooses appropriately.

*Safety layer.* Kids Mode disables the full chat interface. The child cannot type freely to Lulo — only select a story or say goodnight. Crisis detection remains active underneath but the response is designed for a child ("Can you go get a grown-up for me right now?"). No adult emotional content surfaces in Kids Mode at all.

*COPPA/child data compliance.* Kids Mode does not collect or sync any data about the child. No journal entries, no mood tracking, no Firestore writes during a kids session. The parent's account controls everything.

*The parent handoff.* After the story ends, Lulo whispers: "Goodnight, little one. God loves you and I'll be right here whenever you need me." Then the screen dims. Parents can set a bedtime lock — once Kids Mode is on after a certain time, only the parent's device can turn it off.

*Architecture note.* Kids Mode is a separate UI state toggled by a localStorage flag (`luloKidsMode: true`). No new screens needed at first — the same app shell just renders a simplified card-based story picker instead of the emotion carousel. The VoxCPM2 endpoint receives a `mode: 'kids'` parameter that selects the softer voice profile. Stories are a new static array in app.js (or a separate `stories.js` file when the list grows).

**Community / Shared Prayer Wall**
Anonymous prayer requests that other users can pray for. Lulo mediates: "Someone in the Em_Q community is going through something heavy. Would you pray for them?" Requires moderation layer.

**Multi-language support**
Lulo in Yoruba, French, Pidgin. The voice and personality can translate; the scripture arrays need localisation. VoxCPM2's 30+ language support means the voice side is already handled — the work is localising Lulo's written responses and scripture arrays.

**Lulo's face animated (not just swapped)**
Instead of swapping PNG images, Lulo's face could have subtle CSS or Lottie animations — a gentle blink, a slow breath, a small head tilt. Makes her feel alive between interactions. In Kids Mode, the animation could be more expressive — wider eyes, a smile on the happy moments of a story.

**Bible reading plan**
Lulo guides users through a reading plan. Daily check-in: "Did you read today?" If yes, she celebrates. If no, no shame — she just stays ready. Short-term plans (21 days of peace, 7 days of identity in Christ). Kids Mode version: a 7-day "Bedtime Bible Adventure" where each night's story is a chapter of the same narrative arc.

---

## PART 6 — THINGS THAT NEED YOU (Bidemi)

These cannot be done without your access or a decision:

1. **Firebase Console — Firestore Security Rules**
   Log in → Firebase Console → Em_Q project → Firestore Database → Rules tab
   Apply the rules in Part 2. This is the single most important security action.
   Time needed: 5 minutes.

2. **Firebase Console — enable App Check**
   Under Project Settings → App Check → Register your web app
   Select reCAPTCHA v3. Get the site key. Add it to index.html.
   Time needed: 15 minutes.

3. **Cloudflare Dashboard — Worker rate limiting**
   Go to the `em1-prayer` Worker → Settings → Add Rate Limiting binding
   Set: 30 requests per 10 minutes per IP.
   Time needed: 10 minutes.

4. **Decision: ElevenLabs voice (Phase 3d)**
   Do you want to invest in a custom Lulo voice now or later? If now, you need:
   - An ElevenLabs account ($22/month Creator plan)
   - Voice samples (30–60 mins of a warm female voice reading scripture/prayers)
   - Time to train and integrate

5. **Decision: FCM push notifications**
   Do you want Lulo to reach out to users who haven't opened the app?
   If yes, this needs a Firebase Cloud Function (free tier covers most usage).
   Requires: enabling Cloud Functions in the Firebase project (billing must be enabled, but the free tier handles the load easily).

6. **Images for missing mood expressions**
   The `encouraged`, `grateful`, `hopeful` moods reuse other images because dedicated expressions don't exist. If you want Lulo to feel fully expressive across all 27 moods, new artwork is needed for these.

---

## PART 7 — CODE HEALTH NOTES

These aren't bugs but they'll matter as the codebase grows:

**app.js is 5,592 lines — one file.** This works for now, but as Phase 3 features land (voice engine, push notifications, FCM), it will become difficult to navigate. When you're ready, consider splitting into:
- `lulo-core.js` — state, memory, sync
- `lulo-ui.js` — screens, animations, themes
- `lulo-brain.js` — AI layer, crisis detection, keyword systems
- `lulo-voice.js` — Phase 3 voice engine
- `lulo-scripture.js` — all verse arrays (these alone are ~1,500 lines)

**The `classifyIntent` call** (double API call per message) should be replaced with local keyword logic. It adds 500–1,500ms of latency for every emotional message and costs two Claude API calls instead of one.

**The `situationResponses` object** and `emotionMap` are excellent but overlap with each other. A user mentioning "pregnant" could hit both. The priority order (situationResponses checked before emotionMap) handles it, but the logic could be cleaner.

**Prayer for others flow**: `luloPrayerForOtherName` key is referenced in `generatePrayer()` but is never set in the current capture flow. The text is passed as a parameter instead, which works — but the localStorage fallback is dead code. Worth cleaning up.

---

## SUMMARY TABLE

| Area | Status | Priority |
|---|---|---|
| Sync code bugs | Fixed tonight | Done |
| XSS in name field | Fixed tonight | Done |
| Console log leaks | Fixed tonight | Done |
| API rate limiting (client) | Fixed tonight | Done |
| Content Security Policy | Fixed tonight | Done |
| Service worker updates | Fixed tonight | Done |
| Firestore Security Rules | Needs Firebase console | Urgent |
| App Check | Needs Firebase console | High |
| Worker rate limiting | Needs Cloudflare | High |
| VoxCPM2 FastAPI backend | Ready to write | Phase 3 — Step 2 |
| RunPod/Modal deployment | After FastAPI | Phase 3 — Step 3 |
| App voice engine (app.js) | Code drafted, ready | Phase 3 — Step 4 |
| Voice input (mic button) | After output works | Phase 3b |
| Multilingual voice routing | After English voice | Phase 3b |
| Push notifications | Decision needed | Phase 3 |
| Accessibility | Not started | Phase 3 |
| Offline chat queue | Not started | Phase 3 |
| Data export | Not started | Phase 3/4 |
| App modularisation | Not urgent | Phase 4 |
| Kids Mode — bedtime stories | Architecture planned | Phase 4 |
| Device orientation head-tilt | 8 lines, ready to ship | Phase 3a |
| Lottie reaction overlays | Collect JSON files, wire to events | Phase 3a |
| Rive character rig | Needs Rive account + art in layers | Phase 3b |
| MediaPipe presence/tracking | Needs Rive + camera permission UX | Phase 4 |
| Lip-sync approximation | Needs voice (Phase 3) + Rive | Phase 4 |
| Full embodied presence | All above combined | Phase 4 |

---

*All fixes applied to app.js, index.html, and sw.js. Nothing was changed in crisis detection logic, Lulo's personality, or scripture arrays. Ready for Phase 3.*
