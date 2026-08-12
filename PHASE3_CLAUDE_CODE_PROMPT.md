# Em_Q Phase 3 — Claude Code Build Prompt

## WHO YOU ARE WORKING WITH

This is **Em_Q** (Lulo), a faith-based emotional support PWA hosted at `timereigth54.github.io/EmQ`.
Lulo is an AI companion with a deeply developed faith-rooted personality — this voice is a product asset.
Do not change Lulo's system prompt, crisis detection logic, scripture arrays, or her personality under
any circumstances. If a change risks touching any of those, stop and flag it before proceeding.

---

## THE CODEBASE

Four files:
- `index.html` — app shell (screens, layout)
- `styles.css` — ~1140 lines of styles
- `app.js` — ~5600 lines of logic
- `sw.js` — service worker

Read all files fully before touching anything. This is a large, interconnected codebase — understand
before editing.

---

## WHAT YOU ARE BUILDING (Phase 3 Deliverables)

1. **UI redesign** — galaxy background, new top bar, scripture card overlay, full-page text mode
2. **Notification center** — in-app tray; daily scripture routes here instead of main card
3. **Voice output** — VoxCPM2 backend + Web Speech API fallback; Lulo speaks every response
4. **Voice input** — mic button as primary input; text mode is full-page secondary
5. **Onboarding** — skip splash screen; first-timer guide on login screen
6. **app.js modularisation** — extract two safe modules; plan the rest
7. **Essential fixes** — streak logic, classifyIntent local replacement, error retry, char counter

---

## PART 1: UI REDESIGN

### 1A — Background

Replace the `body` background with a deep-space galaxy aesthetic. Update the `dark` theme only —
other themes (`light`, `soft`, `midnight`) keep their existing backgrounds. The `setTheme()` function
already handles class-based theming; apply the galaxy styles to `body` default (dark theme):

```css
body {
    background-color: #050510;
    background-image:
        radial-gradient(ellipse 80% 60% at 70% 55%, rgba(160, 60, 180, 0.35) 0%, transparent 65%),
        radial-gradient(ellipse 60% 40% at 25% 70%, rgba(120, 40, 160, 0.2) 0%, transparent 60%),
        radial-gradient(ellipse 40% 30% at 65% 50%, rgba(200, 80, 120, 0.15) 0%, transparent 50%),
        radial-gradient(circle 300px at 50% 35%, rgba(0, 220, 120, 0.12) 0%, transparent 70%),
        radial-gradient(ellipse 100% 80% at 50% 0%, rgba(10, 5, 40, 0.9) 0%, transparent 100%);
}
```

Reduce `body::before` and `body::after` opacity to 0.4. Add 8 more `✦` sparkle divs in `index.html`
scattered with varied `top`, `left`, `font-size` (0.3–0.7rem), and `animation-delay` values.

---

### 1B — Top Bar Redesign

**New layout (left → right):**
- **Left**: Sound/voice toggle — pill shape, `id="sound-btn"`, `onclick="toggleSound()"`, contains 🔊
- **Center**: `EM_Q` — `font-size: 1rem`, `font-weight: 700`, `color: white`, `letter-spacing: 3px`
- **Right**: Two pills side by side:
  - **Notification badge** — `id="notif-btn"`, `onclick="toggleNotifTray()"`. Shows 🛡 icon + unread
    notification count. Count comes from `getUnreadNotifCount()` (see Part 4). Updates dynamically.
  - **Menu button** — `id="more-btn"`, `onclick="toggleMoreMenu()"`, contains `≡`

Remove the standalone `🆘` top-bar icon. Add "🆘 Emergency Kit" to the more menu if not already there.

Use a unified `.top-pill` class:

```css
.top-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(20, 20, 45, 0.75);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 50px;
    backdrop-filter: blur(12px);
    cursor: pointer;
    color: white;
    font-size: 0.82rem;
    font-weight: 600;
    transition: all 0.25s ease;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
}
.top-pill:hover, .top-pill:active {
    background: rgba(30, 30, 60, 0.9);
    border-color: rgba(255,255,255,0.2);
}

/* Voice active state */
#sound-btn.voice-active {
    background: rgba(0, 255, 100, 0.15) !important;
    border-color: rgba(0, 255, 100, 0.5) !important;
    animation: voice-pulse 2s ease-in-out infinite;
}
@keyframes voice-pulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(0,255,100,0.1), 0 0 12px rgba(0,255,100,0.2); }
    50%       { box-shadow: 0 0 0 5px rgba(0,255,100,0.15), 0 0 20px rgba(0,255,100,0.3); }
}

/* Notification badge has unread items */
#notif-btn.has-unread {
    border-color: rgba(0, 212, 255, 0.5);
    box-shadow: 0 0 10px rgba(0,212,255,0.2);
}
#notif-count {
    font-size: 0.7rem;
    font-weight: 700;
    color: rgba(0,212,255,0.9);
    min-width: 14px;
}
```

---

### 1C — Lulo: Bigger, Stronger Glow, Tilt

- `#lulo-face`: `200px × 200px` → `240px × 240px`
- Img inside `#lulo-face`: match `240px × 240px`
- `#lulo-glow`: `180px × 180px` → `220px × 220px`; gradient opacity `0.2` → `0.35`; add outer ring:
  ```css
  background: radial-gradient(circle, rgba(0,255,100,0.35) 0%, rgba(0,180,255,0.08) 60%, transparent 80%);
  ```
- Add ambient halo below Lulo:
  ```css
  #lulo-face::after {
      content: '';
      position: absolute;
      bottom: -18px;
      left: 50%;
      transform: translateX(-50%);
      width: 160px;
      height: 28px;
      background: radial-gradient(ellipse, rgba(0,255,100,0.2) 0%, transparent 70%);
      border-radius: 50%;
      filter: blur(10px);
      z-index: -1;
      pointer-events: none;
  }
  ```
- Keep `float` animation and `animateLulo()` unchanged.

**Device orientation tilt** — add inside `initApp()`:
```javascript
if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', e => {
        if (e.gamma == null) return
        const x = Math.max(-15, Math.min(15, e.gamma))
        const y = Math.max(-10, Math.min(10, (e.beta || 0) - 30))
        const lf = document.getElementById('lulo-face')
        if (lf) lf.style.transform =
            `translateY(var(--float-offset,0px)) rotateX(${y * 0.4}deg) rotateY(${x * 0.4}deg)`
    }, { passive: true })
}
```

---

### 1D — Scripture Card Overlay (Lulo Fades Out)

When a scripture is shown — whether from mood selection, daily catch-up, or "show me another" — Lulo's
presence area should fade and blur out, and the scripture card should expand to fill her space with a
premium glassy look.

**CSS — add these classes:**

```css
/* Lulo hidden state — when scripture or text mode is active */
#lulo-container.lulo-recede {
    opacity: 0;
    filter: blur(6px);
    transform: scale(0.88);
    pointer-events: none;
    transition: opacity 0.4s ease, filter 0.4s ease, transform 0.4s ease;
}
#lulo-container {
    transition: opacity 0.4s ease, filter 0.4s ease, transform 0.4s ease;
}

/* Scripture card — premium glassy full presence */
#scripture-card.scripture-expanded {
    background: rgba(255, 255, 255, 0.07);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 28px;
    box-shadow:
        0 8px 40px rgba(0,0,0,0.4),
        inset 0 1px 0 rgba(255,255,255,0.12);
    padding: 28px 24px;
    margin-top: 0;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Premium scripture text */
#scripture-card.scripture-expanded #scripture-text {
    font-size: 1.15rem;
    font-weight: 600;
    color: rgba(255,255,255,0.92);
    line-height: 1.75;
    letter-spacing: -0.2px;
    font-family: 'Inter', sans-serif;
    margin-bottom: 14px;
}
#scripture-card.scripture-expanded #scripture-ref {
    font-size: 0.8rem;
    font-weight: 500;
    color: rgba(0, 212, 255, 0.8);
    letter-spacing: 1.5px;
    text-transform: uppercase;
}
/* Carousel also recedes */
#carousel-container.carousel-recede {
    opacity: 0.3;
    pointer-events: none;
    transition: opacity 0.35s ease;
}
```

**JS — call these when showing/hiding scripture:**

Find the function that renders a scripture (likely `showScripture()` or similar). Before it shows the
card content, call:
```javascript
function enterScriptureMode() {
    document.getElementById('lulo-container')?.classList.add('lulo-recede')
    document.getElementById('carousel-container')?.classList.add('carousel-recede')
    document.getElementById('scripture-card')?.classList.add('scripture-expanded')
}

function exitScriptureMode() {
    document.getElementById('lulo-container')?.classList.remove('lulo-recede')
    document.getElementById('carousel-container')?.classList.remove('carousel-recede')
    document.getElementById('scripture-card')?.classList.remove('scripture-expanded')
}
```

Call `enterScriptureMode()` when scripture content is set and visible.
Call `exitScriptureMode()` when returning to Lulo (e.g. a "Back to Lulo" gesture, or when a mood is
re-selected). If a "close" or back button exists on the scripture card, wire it to `exitScriptureMode()`.

---

### 1E — Emotion Carousel: Card Deck Layout

Replace the ring carousel with a flat horizontal card deck.

**Remove from HTML**: `#ring-outer`, `#ring-inner`, `#ring-shine`, `#ring-active-slot`,
`#ring-fade-left`, `#ring-fade-right`.

**Keep**: `#carousel-container`, `#carousel-label`, `#carousel-wrapper`, and `#mood-buttons`
(rename or repurpose as the card container div).

**CSS:**

```css
#carousel-wrapper {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    overflow-x: auto;
    padding: 12px 24px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    width: 100%;
}
#carousel-wrapper::-webkit-scrollbar { display: none; }

.mood-card {
    flex-shrink: 0;
    width: 86px;
    height: 98px;
    background: rgba(22, 22, 48, 0.8);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 22px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    cursor: pointer;
    backdrop-filter: blur(12px);
    transition: all 0.22s ease;
    scroll-snap-align: center;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.mood-card:active, .mood-card.active {
    background: rgba(0,180,255,0.12);
    border-color: rgba(0,180,255,0.35);
    transform: scale(1.06);
}
.mood-card .card-emoji { font-size: 1.9rem; line-height: 1; }
.mood-card .card-label {
    font-size: 0.62rem;
    color: rgba(255,255,255,0.6);
    font-weight: 500;
    text-align: center;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.2px;
}

/* LULO center card */
.mood-card.lulo-center-card {
    width: 98px;
    height: 106px;
    background: rgba(0, 200, 100, 0.1);
    border: 2px solid rgba(0, 255, 120, 0.55);
    box-shadow: 0 0 22px rgba(0,255,100,0.18), 0 0 44px rgba(0,200,80,0.08);
}
.mood-card.lulo-center-card .card-label {
    color: rgba(0,255,120,0.9);
    font-weight: 700;
    font-size: 0.68rem;
    letter-spacing: 1.2px;
    text-transform: uppercase;
}
```

**JS — rewrite the carousel build function:**

Find `buildCarousel()` (or wherever `#mood-buttons` is populated). Replace the inner logic with:

```javascript
function buildCarousel() {
    const container = document.getElementById('mood-buttons') // or carousel wrapper
    container.innerHTML = ''

    // Insert LULO center card in the middle of the emotions array
    const insertAt = Math.floor(emotions.length / 2)

    emotions.forEach((mood, i) => {
        if (i === insertAt) {
            // Insert the special LULO card
            const luloCard = document.createElement('div')
            luloCard.className = 'mood-card lulo-center-card'
            luloCard.innerHTML = `<div class="card-emoji">🤖</div><div class="card-label">LULO</div>`
            luloCard.addEventListener('click', () => openVoiceOrTextInput())
            container.appendChild(luloCard)
        }

        const card = document.createElement('div')
        card.className = 'mood-card'
        card.dataset.mood = mood.label
        card.innerHTML = `<div class="card-emoji">${mood.emoji}</div><div class="card-label">${mood.label}</div>`
        card.addEventListener('click', () => {
            if (isCarouselLocked()) return
            selectMood(mood) // preserve existing mood selection logic
            card.classList.add('active')
        })
        container.appendChild(card)
    })

    // Scroll LULO card into center on load
    setTimeout(() => {
        const luloCard = container.querySelector('.lulo-center-card')
        if (luloCard) luloCard.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' })
    }, 50)
}
```

Preserve `isCarouselLocked()`, `selectMood()`, and the 3-minute lock logic exactly.

---

### 1F — Voice Input Bar / Text Mode as Full Page

**Remove** current `#bottom-bar` `#input-row` and textarea.

**New `#bottom-bar` HTML** (replace in `index.html`):

```html
<div id="bottom-bar">
    <!-- VOICE MODE (default) -->
    <div id="voice-input-area">
        <button id="mic-btn" onclick="toggleVoiceInput()" aria-label="Speak to Lulo">
            <span id="mic-icon">🎤</span>
        </button>
        <div id="swipe-to-text-hint">
            <span class="hint-arrow">←</span>
            <span class="hint-label">Swipe to text</span>
            <span class="hint-arrow">→</span>
        </div>
    </div>
</div>

<!-- TEXT MODE OVERLAY (hidden by default — shown as full page when activated) -->
<div id="text-mode-overlay" style="display:none;" aria-hidden="true">
    <div id="text-mode-header">
        <button id="text-mode-close" onclick="switchToVoiceMode()" aria-label="Back to voice">✕ Back</button>
        <span id="text-mode-title">Talk to Lulo</span>
        <span id="char-counter"></span>
    </div>
    <!-- Chat thread lives here when text mode is open -->
    <div id="text-mode-chat"></div>
    <div id="text-input-row">
        <textarea id="lulo-input"
            placeholder="Tell Lulo how you're feeling..."
            autocomplete="off"
            rows="1"
            maxlength="2000"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();luloListen()}"
            oninput="autoGrowInput(this);updateCharCounter(this)"></textarea>
        <button id="send-btn" onclick="luloListen()">→</button>
    </div>
</div>
```

**CSS:**

```css
#bottom-bar {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 20px 34px;
    background: linear-gradient(to top, rgba(5,5,16,0.97) 55%, transparent);
    z-index: 100;
}
#voice-input-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
}
#mic-btn {
    width: 78px;
    height: 78px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(80,80,105,0.92), rgba(25,25,48,0.96));
    border: 2px solid rgba(255,255,255,0.14);
    box-shadow: 0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.22s ease;
    -webkit-tap-highlight-color: transparent;
}
#mic-btn:active { transform: scale(0.95); }
#mic-btn.listening {
    border-color: rgba(0,255,100,0.7);
    box-shadow: 0 0 0 8px rgba(0,255,100,0.12), 0 0 0 16px rgba(0,255,100,0.06), 0 4px 24px rgba(0,0,0,0.5);
    animation: mic-pulse 1.1s ease-in-out infinite;
}
@keyframes mic-pulse {
    0%,100% { box-shadow: 0 0 0 8px rgba(0,255,100,0.12), 0 0 0 16px rgba(0,255,100,0.06); }
    50%      { box-shadow: 0 0 0 12px rgba(0,255,100,0.18), 0 0 0 22px rgba(0,255,100,0.04); }
}
#mic-icon { font-size: 1.85rem; filter: drop-shadow(0 0 5px rgba(200,180,100,0.35)); }

#swipe-to-text-hint { display: flex; align-items: center; gap: 10px; }
.hint-label { font-size: 0.73rem; color: rgba(255,255,255,0.32); letter-spacing: 0.4px; font-family: 'Inter', sans-serif; }
.hint-arrow { font-size: 0.82rem; color: rgba(0,212,255,0.38); }

/* TEXT MODE OVERLAY — full screen */
#text-mode-overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 5, 18, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 500;
    display: flex;
    flex-direction: column;
    max-width: 420px;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    animation: slideUpFade 0.3s ease;
}
@keyframes slideUpFade {
    from { opacity: 0; transform: translateX(-50%) translateY(24px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
#text-mode-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
}
#text-mode-close {
    background: none; border: none; color: rgba(255,255,255,0.4);
    font-size: 0.8rem; cursor: pointer; padding: 6px 10px; font-family: 'Inter', sans-serif;
    border-radius: 20px; transition: all 0.2s ease;
}
#text-mode-close:hover { color: white; background: rgba(255,255,255,0.08); }
#text-mode-title { font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.6); letter-spacing: 1px; }
#char-counter { font-size: 0.68rem; color: rgba(255,255,255,0.25); font-family: 'Inter', sans-serif; min-width: 40px; text-align: right; }
#char-counter.near-limit { color: rgba(255, 160, 60, 0.8); }

#text-mode-chat {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
#text-input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 16px 32px;
    border-top: 1px solid rgba(255,255,255,0.07);
    background: rgba(10,10,28,0.8);
}
#lulo-input {
    flex: 1;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 20px;
    color: white;
    padding: 10px 16px;
    font-size: 0.9rem;
    font-family: 'Inter', sans-serif;
    outline: none;
    resize: none;
    max-height: 120px;
    overflow-y: auto;
    line-height: 1.5;
}
#send-btn {
    width: 42px; height: 42px; border-radius: 50%;
    background: rgba(0,212,255,0.12); border: 1px solid rgba(0,212,255,0.35);
    color: rgba(0,212,255,0.9); font-size: 1.1rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: all 0.2s ease;
}
#send-btn:hover { background: rgba(0,212,255,0.22); }
```

**JS — text mode logic:**

```javascript
function openVoiceOrTextInput() {
    switchToTextMode()
}

function switchToTextMode() {
    const overlay = document.getElementById('text-mode-overlay')
    overlay.style.display = 'flex'
    overlay.setAttribute('aria-hidden', 'false')

    // Mirror the existing chat thread into text-mode-chat
    const existingThread = document.getElementById('chat-thread')
    const textChat = document.getElementById('text-mode-chat')
    if (existingThread && textChat) {
        textChat.innerHTML = existingThread.innerHTML
        textChat.scrollTop = textChat.scrollHeight
    }

    setTimeout(() => document.getElementById('lulo-input')?.focus(), 150)
}

function switchToVoiceMode() {
    const overlay = document.getElementById('text-mode-overlay')
    overlay.style.display = 'none'
    overlay.setAttribute('aria-hidden', 'true')
    if (currentRecognition) { try { currentRecognition.stop() } catch {} currentRecognition = null }
    isVoiceInputActive = false
    document.getElementById('mic-btn')?.classList.remove('listening')
}

function updateCharCounter(textarea) {
    const counter = document.getElementById('char-counter')
    if (!counter) return
    const remaining = 2000 - textarea.value.length
    if (remaining <= 200) {
        counter.textContent = `${remaining} left`
        counter.classList.add('near-limit')
    } else {
        counter.textContent = ''
        counter.classList.remove('near-limit')
    }
}
```

**Swipe gesture** — add to `#bottom-bar` after DOM ready:
```javascript
;(function setupSwipe() {
    const bar = document.getElementById('bottom-bar')
    if (!bar) return
    let startX = 0
    bar.addEventListener('touchstart', e => { startX = e.touches[0].clientX }, { passive: true })
    bar.addEventListener('touchend', e => {
        const dx = Math.abs(e.changedTouches[0].clientX - startX)
        if (dx > 40) switchToTextMode()
    }, { passive: true })
})()
```

**IMPORTANT**: Any `addToChatHistory()` calls that update the visible chat thread must also update
`#text-mode-chat` if text mode is currently open. After the function that appends a bubble to the
thread, add:
```javascript
// Keep text-mode-chat in sync
const textChat = document.getElementById('text-mode-chat')
if (textChat && document.getElementById('text-mode-overlay').style.display !== 'none') {
    textChat.innerHTML = document.getElementById('chat-thread').innerHTML
    textChat.scrollTop = textChat.scrollHeight
}
```

---

## PART 2: ONBOARDING CHANGES

### 2A — Skip the Splash Screen

The splash screen (`#splash-screen`) currently shows first and requires a button tap ("Meet Lulo →")
to proceed. Remove this step. On app load, go directly to `#name-screen` for new users,
or `#welcome-screen` / `#main-app` for returning users (this logic already exists).

In `index.html`: add `style="display:none;"` to `#splash-screen` so it never shows.

In `app.js`: Find where the app initialises on `DOMContentLoaded`. Currently it likely shows
`#splash-screen` first. Change it so the first thing that runs is the returning-user check:
- If `localStorage.getItem('luloUserName')` exists → proceed to welcome/main app as today
- If not → show `#name-screen` directly (skip splash entirely)

Remove or comment out any `setTimeout` that was used to auto-transition out of splash.

### 2B — First-Timer Guide on Login Screen

On `#name-screen`, below the logo and above the name input, add a collapsible "What is Em_Q?" section.
It should be collapsed by default (shows only a small "ⓘ New here?" link). Tapping expands it.

Add this HTML block inside `#name-screen`, between the Lulo image and the `#name-entry-section`:

```html
<div id="first-timer-info">
    <button id="first-timer-toggle" onclick="toggleFirstTimerInfo()" aria-expanded="false">
        ⓘ New here? What is Em_Q?
    </button>
    <div id="first-timer-body" aria-hidden="true">
        <p class="ftinfo-text">
            Em_Q is your pocket companion — an AI friend named <strong>Lulo</strong> who listens,
            prays with you, shares scripture matched to how you feel, and remembers your story.
        </p>
        <div class="ftinfo-steps">
            <div class="ftinfo-step"><span class="ftinfo-num">1</span><span>Pick how you're feeling from the mood cards</span></div>
            <div class="ftinfo-step"><span class="ftinfo-num">2</span><span>Lulo responds with a verse and a word for you</span></div>
            <div class="ftinfo-step"><span class="ftinfo-num">3</span><span>Tap the mic or swipe to text to talk to her</span></div>
            <div class="ftinfo-step"><span class="ftinfo-num">4</span><span>She remembers you — every session builds your story</span></div>
        </div>
        <p class="ftinfo-sub">Your Lulo Code syncs your data across any device.</p>
    </div>
</div>
```

CSS:
```css
#first-timer-info {
    width: 100%;
    max-width: 320px;
    margin-bottom: 20px;
}
#first-timer-toggle {
    background: none;
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.4);
    font-size: 0.75rem;
    font-family: 'Inter', sans-serif;
    padding: 7px 16px;
    border-radius: 20px;
    cursor: pointer;
    width: 100%;
    text-align: center;
    transition: all 0.2s ease;
    letter-spacing: 0.3px;
}
#first-timer-toggle:hover { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.25); }
#first-timer-body {
    display: none;
    padding: 16px;
    margin-top: 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    animation: fadeIn 0.25s ease;
}
.ftinfo-text {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.55);
    line-height: 1.7;
    margin-bottom: 14px;
    font-family: 'Inter', sans-serif;
}
.ftinfo-text strong { color: rgba(0,255,120,0.8); font-weight: 600; }
.ftinfo-steps { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.ftinfo-step {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 0.78rem;
    color: rgba(255,255,255,0.5);
    font-family: 'Inter', sans-serif;
    line-height: 1.5;
}
.ftinfo-num {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(0,212,255,0.12);
    border: 1px solid rgba(0,212,255,0.25);
    color: rgba(0,212,255,0.8);
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
}
.ftinfo-sub {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.25);
    text-align: center;
    font-family: 'Inter', sans-serif;
}
```

JS:
```javascript
function toggleFirstTimerInfo() {
    const body = document.getElementById('first-timer-body')
    const btn = document.getElementById('first-timer-toggle')
    const isOpen = body.style.display === 'block'
    body.style.display = isOpen ? 'none' : 'block'
    body.setAttribute('aria-hidden', isOpen ? 'true' : 'false')
    btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true')
}
```

---

## PART 3: VOICE LAYER

### 3A — VoxCPM2 Backend (write the code; Bidemi deploys)

Create a new folder `voice-server/` in the repo root (not served by the PWA, just stored here).

**`voice-server/main.py`:**
```python
"""
Lulo Voice Server — VoxCPM2 TTS inference
HuggingFace repo: openbmb/VoxCPM2
Uses the `voxcpm` pip package (NOT AutoModel/transformers).
Sample rate is pulled from model.tts_model.sample_rate (48kHz) — do NOT hardcode.
Deploy on RunPod Serverless (RTX 4090, ~8GB VRAM required).
Returns: audio/wav binary
"""
import io
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from voxcpm import VoxCPM
import soundfile as sf

model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    print("Loading VoxCPM2...")
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
    print(f"VoxCPM2 ready — sample rate: {model.tts_model.sample_rate}Hz")
    yield
    model = None

app = FastAPI(lifespan=lifespan)

class TTSRequest(BaseModel):
    text: str
    language: str = "en"

@app.post("/generate")
async def generate_speech(req: TTSRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not ready")
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    if len(req.text) > 2000:
        raise HTTPException(status_code=400, detail="Text too long")

    try:
        wav = model.generate(
            text=req.text,
            cfg_value=2.0,
            inference_timesteps=10,
        )
        buf = io.BytesIO()
        # Pull sample rate from model — it's 48kHz, never hardcode
        sf.write(buf, wav, model.tts_model.sample_rate, format="WAV")
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}
```

**`voice-server/requirements.txt`:**
```
fastapi==0.111.0
uvicorn==0.30.0
torch>=2.5.0
voxcpm
soundfile>=0.12.1
pydantic>=2.0.0
```
Requirements: Python ≥ 3.10, PyTorch ≥ 2.5, CUDA ≥ 12.0, ~8GB VRAM (RTX 4090 is sufficient).

**`voice-server/Dockerfile`:**
```dockerfile
FROM runpod/pytorch:2.5.0-py3.11-cuda12.1.1-devel-ubuntu22.04

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download VoxCPM2 weights during image build so cold-start is fast
RUN python -c "from voxcpm import VoxCPM; VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False)" || true

COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
EXPOSE 8000
```

**`voice-server/DEPLOY.md`:**
```markdown
# Deploying Lulo's Voice Server

## Requirements
- Docker installed locally
- DockerHub account (free)
- RunPod account (runpod.io — accepts crypto, no card required)
- GPU: RTX 4090 (~8GB VRAM). No need for A100.

## Steps

1. Go to runpod.io → Serverless → New Endpoint → Custom Docker Image

2. Build and push the Docker image:
   ```bash
   docker build -t YOUR_DOCKERHUB_USER/lulo-voice-server:latest voice-server/
   docker push YOUR_DOCKERHUB_USER/lulo-voice-server:latest
   ```

3. In RunPod: paste image URL, select GPU type RTX 4090, set min workers to 0
   (serverless — GPU sleeps when idle, you pay only for active generation time)

4. Click Deploy. RunPod gives you an endpoint URL like:
   https://abc123xyz.runpod.net

5. Test before wiring into the app — confirm audio is correct pitch/speed:
   ```bash
   curl -X POST https://YOUR-ID.runpod.net/generate \
     -H "Content-Type: application/json" \
     -d '{"text": "Testing one two three"}' \
     --output test.wav
   ```
   Play test.wav. If audio sounds sped-up or pitch-shifted, the sample rate is wrong
   in main.py — but it should be fine since we pull it from model.tts_model.sample_rate.

6. Once confirmed, paste the URL into lulo-voice.js:
   ```javascript
   endpoint: 'https://YOUR-ID.runpod.net/generate'
   ```

## Cost estimate
~$0.0003 per second of GPU time. A 10-word response generates in ~1–2 seconds.
100 users × 10 conversations/day ≈ $30–50/month.
ElevenLabs equivalent for same usage: $500+/month.
```

### 3B — LuloVoice Engine (app.js)

Add this module near the top of `app.js` (after constants, before `initApp`):

```javascript
// ─── LULO VOICE ENGINE ───────────────────────────────────────────────────────
const LuloVoice = {
    enabled: false,
    // Paste RunPod endpoint URL here after deployment (see voice-server/DEPLOY.md)
    endpoint: null,
    currentAudio: null,

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

    async speak(text) {
        if (!this.enabled) return
        this.stop()
        const clean = this._clean(text)
        if (!clean) return

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
                this.currentAudio = new Audio(url)
                this.currentAudio.play()
                this.currentAudio.onended = () => URL.revokeObjectURL(url)
                return
            } catch {
                // fall through to Web Speech API
            }
        }
        this._fallback(clean)
    },

    _fallback(text) {
        if (!('speechSynthesis' in window)) return
        speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.rate = 0.88; u.pitch = 1.08; u.volume = 1
        const go = () => {
            const voices = speechSynthesis.getVoices()
            const want = ['Google UK English Female','Samantha','Karen','Moira','Victoria']
            for (const n of want) {
                const v = voices.find(v => v.name === n)
                if (v) { u.voice = v; break }
            }
            speechSynthesis.speak(u)
        }
        speechSynthesis.getVoices().length > 0 ? go() : (speechSynthesis.onvoiceschanged = go)
    },

    stop() {
        if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio = null }
        if ('speechSynthesis' in window) speechSynthesis.cancel()
    }
}

function updateVoiceToggleUI() {
    const btn = document.getElementById('sound-btn')
    if (!btn) return
    btn.classList.toggle('voice-active', LuloVoice.enabled)
    btn.title = LuloVoice.enabled ? 'Voice ON — tap to mute' : 'Voice OFF — tap to enable'
}
```

**Wire `toggleSound()` to `LuloVoice`:**
```javascript
function toggleSound() { LuloVoice.toggle() }
```

**Wire `LuloVoice.speak()` after every Lulo response:**

Search for every `addToChatHistory('lulo',` call that follows API responses, and add immediately after:
```javascript
LuloVoice.speak(responseText) // or whatever the variable is named
```

Also add after `generatePrayer()` sets the prayer text, after `showScripture()` sets verse text,
and after the crisis message is rendered.

**Call `LuloVoice.load()` inside `initApp()`** at the very top of that function.

### 3C — Voice Input (Mic Button)

Add global vars near top of `app.js`:
```javascript
let currentRecognition = null
let isVoiceInputActive = false
```

Add functions:
```javascript
function toggleVoiceInput() {
    if (isVoiceInputActive) { stopVoiceInput(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { switchToTextMode(); return }

    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    r.continuous = false

    r.onstart = () => {
        isVoiceInputActive = true
        document.getElementById('mic-btn')?.classList.add('listening')
        LuloVoice.stop()
    }
    r.onresult = e => {
        const t = e.results[0][0].transcript
        stopVoiceInput()
        // Populate input and send
        const inp = document.getElementById('lulo-input')
        if (inp) inp.value = t
        luloListen()
    }
    r.onerror = e => {
        stopVoiceInput()
        if (e.error === 'not-allowed') switchToTextMode()
    }
    r.onend = () => stopVoiceInput()
    r.start()
    currentRecognition = r
}

function stopVoiceInput() {
    isVoiceInputActive = false
    document.getElementById('mic-btn')?.classList.remove('listening')
    if (currentRecognition) { try { currentRecognition.stop() } catch {} currentRecognition = null }
}
```

At the top of the existing `luloListen()` function, add: `stopVoiceInput()`.

---

## PART 4: IN-APP NOTIFICATION CENTER

Daily scriptures no longer display automatically in the main card. They get pushed to a notification
tray. The shield badge in the top bar shows unread notification count.

### Notification Data Structure

Notifications live in `localStorage` key `luloNotifications` as a JSON array:
```javascript
// Each notification object:
{
    id: Date.now().toString(),
    type: 'daily_scripture' | 'streak' | 'lulo_message',
    title: string,
    body: string,
    verseRef: string | null,   // for daily_scripture type
    verseText: string | null,  // for daily_scripture type
    timestamp: ISO string,
    read: false
}
```

### Core Notification Functions

```javascript
function pushNotification({ type, title, body, verseRef = null, verseText = null }) {
    const notifs = getNotifications()
    notifs.push({
        id: Date.now().toString(),
        type, title, body, verseRef, verseText,
        timestamp: new Date().toISOString(),
        read: false
    })
    // Keep max 30 notifications
    if (notifs.length > 30) notifs.splice(0, notifs.length - 30)
    localStorage.setItem('luloNotifications', JSON.stringify(notifs))
    updateNotifBadge()
}

function getNotifications() {
    try { return JSON.parse(localStorage.getItem('luloNotifications')) || [] } catch { return [] }
}

function getUnreadNotifCount() {
    return getNotifications().filter(n => !n.read).length
}

function markAllNotifsRead() {
    const notifs = getNotifications().map(n => ({ ...n, read: true }))
    localStorage.setItem('luloNotifications', JSON.stringify(notifs))
    updateNotifBadge()
}

function updateNotifBadge() {
    const count = getUnreadNotifCount()
    const badge = document.getElementById('notif-count')
    const btn = document.getElementById('notif-btn')
    if (badge) badge.textContent = count > 0 ? count : ''
    if (btn) btn.classList.toggle('has-unread', count > 0)
}
```

### Daily Scripture → Notification

Find the function that runs the daily scripture (likely `showDailyScripture()` or similar — it checks
if a scripture has already been shown today using `luloLastScriptureDate` or similar key).

Instead of displaying the scripture in the main card, call:
```javascript
// Replace the display logic with:
pushNotification({
    type: 'daily_scripture',
    title: "Today's Scripture",
    body: verse.text,
    verseRef: verse.ref,
    verseText: verse.text
})
```

The daily scripture still only runs once per day (preserve that check).

### Notification Tray HTML + CSS

Add in `index.html`, after the `#sync-panel` div:
```html
<div id="notif-tray" style="display:none;">
    <div id="notif-tray-header">
        <span id="notif-tray-title">Notifications</span>
        <button onclick="markAllNotifsRead();renderNotifTray()" id="notif-mark-read">Mark all read</button>
    </div>
    <div id="notif-tray-list"></div>
</div>
```

CSS:
```css
#notif-tray {
    position: fixed;
    top: 68px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 380px;
    max-height: 60vh;
    overflow-y: auto;
    border-radius: 22px;
    padding: 16px;
    z-index: 9999;
    backdrop-filter: blur(24px);
    background: rgba(12, 12, 32, 0.96);
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 12px 48px rgba(0,0,0,0.4);
}
#notif-tray-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; padding-bottom: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
}
#notif-tray-title { font-size: 0.75rem; font-weight: 600; color: rgba(255,255,255,0.5); letter-spacing: 1.5px; text-transform: uppercase; }
#notif-mark-read { background: none; border: none; color: rgba(0,212,255,0.6); font-size: 0.72rem; cursor: pointer; font-family: 'Inter', sans-serif; }
.notif-item {
    padding: 12px 14px;
    border-radius: 14px;
    margin-bottom: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    cursor: pointer;
    transition: all 0.2s ease;
}
.notif-item:hover { background: rgba(255,255,255,0.07); }
.notif-item.unread { border-color: rgba(0,212,255,0.2); background: rgba(0,212,255,0.04); }
.notif-item-title { font-size: 0.75rem; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 4px; }
.notif-item-body { font-size: 0.78rem; color: rgba(255,255,255,0.45); line-height: 1.55; font-style: italic; }
.notif-item-ref { font-size: 0.68rem; color: rgba(0,212,255,0.6); margin-top: 4px; letter-spacing: 0.5px; }
.notif-item-time { font-size: 0.62rem; color: rgba(255,255,255,0.2); margin-top: 6px; }
.notif-empty { text-align: center; color: rgba(255,255,255,0.2); font-size: 0.8rem; padding: 24px 0; font-family: 'Inter', sans-serif; }
```

JS:
```javascript
function toggleNotifTray() {
    const tray = document.getElementById('notif-tray')
    const isOpen = tray.style.display !== 'none'
    tray.style.display = isOpen ? 'none' : 'block'
    if (!isOpen) {
        renderNotifTray()
        markAllNotifsRead()
    }
    // Close other panels
    document.getElementById('more-menu').style.display = 'none'
    document.getElementById('sync-panel').style.display = 'none'
}

function renderNotifTray() {
    const list = document.getElementById('notif-tray-list')
    const notifs = getNotifications().slice().reverse() // newest first
    if (notifs.length === 0) {
        list.innerHTML = '<p class="notif-empty">Nothing yet — Lulo will leave notes here for you 💙</p>'
        return
    }
    list.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifTap('${n.id}')">
            <div class="notif-item-title">${escapeHTML(n.title)}</div>
            <div class="notif-item-body">${escapeHTML(n.body.slice(0, 140))}${n.body.length > 140 ? '…' : ''}</div>
            ${n.verseRef ? `<div class="notif-item-ref">${escapeHTML(n.verseRef)}</div>` : ''}
            <div class="notif-item-time">${timeAgo(n.timestamp)}</div>
        </div>
    `).join('')
}

function handleNotifTap(id) {
    const notif = getNotifications().find(n => n.id === id)
    if (!notif) return
    toggleNotifTray()
    if (notif.type === 'daily_scripture' && notif.verseText) {
        // Show the scripture card overlay with this verse
        showScriptureFromNotif({ text: notif.verseText, ref: notif.verseRef })
    }
}

function showScriptureFromNotif(verse) {
    // Populate the scripture card and enter scripture mode
    const textEl = document.getElementById('scripture-text')
    const refEl = document.getElementById('scripture-ref')
    if (textEl) textEl.textContent = verse.text
    if (refEl) refEl.textContent = verse.ref
    const card = document.getElementById('scripture-card')
    if (card) card.style.display = 'block'
    enterScriptureMode()
    LuloVoice.speak(verse.text + '. ' + verse.ref)
}

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}
```

Close the tray when clicking outside it — add to the existing outside-click handler (or create one):
```javascript
document.addEventListener('click', e => {
    const tray = document.getElementById('notif-tray')
    const btn = document.getElementById('notif-btn')
    if (tray && tray.style.display !== 'none' && !tray.contains(e.target) && !btn.contains(e.target)) {
        tray.style.display = 'none'
    }
})
```

Call `updateNotifBadge()` inside `initApp()` to restore unread count on startup.

---

## PART 5: ESSENTIAL PHASE 3 FIXES

### 5A — Real Streak (Consecutive Days)

Currently `luloSessionCount` counts total sessions ever — it's shown in the badge but it's not a streak.
Add a real consecutive-day streak using `luloLastVisitTimestamp` (already stored).

Add these functions:
```javascript
function updateStreak() {
    const lastVisit = localStorage.getItem('luloLastVisitTimestamp')
    const today = new Date().toDateString()
    const streakKey = 'luloConsecutiveDays'
    const lastStreakDate = localStorage.getItem('luloLastStreakDate')
    let streak = parseInt(localStorage.getItem(streakKey) || '0', 10)

    if (!lastVisit) {
        streak = 1
    } else {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const lastDate = new Date(lastVisit).toDateString()
        if (lastDate === today) {
            // Same day — no change
        } else if (lastDate === yesterday.toDateString()) {
            streak += 1 // Consecutive day
        } else {
            streak = 1 // Gap — reset
        }
    }

    localStorage.setItem(streakKey, String(streak))
    localStorage.setItem('luloLastStreakDate', today)
    return streak
}

function getStreak() {
    return parseInt(localStorage.getItem('luloConsecutiveDays') || '1', 10)
}
```

Call `updateStreak()` inside `initApp()` (after existing session count increment logic).

Update the streak badge in the top bar to show `getStreak()` instead of raw `luloSessionCount`:
```javascript
function updateStreakBadge() {
    const el = document.getElementById('notif-count') // or a separate streak element
    // The shield badge should show streak days
    const streakEl = document.getElementById('streak-count')
    if (streakEl) streakEl.textContent = getStreak()
}
```

Add `id="streak-count"` to the number inside the shield badge in `#top-bar`.

When streak hits a milestone (7, 14, 30, 50, 100 days), push a notification:
```javascript
const milestones = [7, 14, 21, 30, 50, 100]
if (milestones.includes(streak)) {
    const name = localStorage.getItem('luloUserName') || 'friend'
    pushNotification({
        type: 'streak',
        title: `${streak}-day streak 🛡`,
        body: `${name}, you've checked in with yourself ${streak} days in a row. I see you showing up — that takes courage. I'm proud of you.`
    })
}
```

### 5B — Replace `classifyIntent` with Local Logic

The `classifyIntent` function currently makes a second Claude API call on every message that contains
an emotion keyword, adding 500–1500ms latency and doubling API costs on those calls.

Find `classifyIntent` in `app.js`. Replace it with this local function:

```javascript
function classifyIntent(text) {
    // Returns 'expressing' (user sharing emotion) or 'asking' (user asking a question)
    const t = text.toLowerCase().trim()

    // Clear question patterns
    const questionStarters = /^(what|how|why|when|where|who|is|are|can|could|does|do|did|should|would|will|has|have|tell me|explain)/
    const questionMark = t.includes('?')
    if (questionStarters.test(t) || questionMark) return 'asking'

    // Clear expression patterns
    const expressionPhrases = /\b(i feel|i'm feeling|i am feeling|feeling|i've been|i have been|i am|i'm|makes me|i can't|i cannot|i don't|i don't know|i'm scared|i'm worried|i'm sad|i'm happy|i'm angry|i'm tired|i'm exhausted|i'm struggling)\b/
    if (expressionPhrases.test(t)) return 'expressing'

    // Default: treat as expressing (safer for empathy-first response)
    return 'expressing'
}
```

Remove all `await classifyIntent(...)` API calls. The function now runs synchronously with zero latency.

### 5C — Chat Error Retry Button

When the Cloudflare Worker fails, Lulo currently says "I can't reach my brain right now" (or similar).
Find where that fallback message is added to the chat thread and add a retry button.

After the failure message is appended, add a retry button inside that bubble:
```javascript
// After adding the error message to chat, append a retry element
function addRetryButton(lastUserMessage) {
    const retryEl = document.createElement('div')
    retryEl.className = 'chat-retry'
    retryEl.innerHTML = `<button onclick="retryLastMessage()" class="retry-btn">↺ Try again</button>`
    document.getElementById('chat-thread')?.appendChild(retryEl)
}

let _lastUserMessage = ''
function retryLastMessage() {
    if (!_lastUserMessage) return
    document.querySelector('.chat-retry')?.remove()
    const inp = document.getElementById('lulo-input')
    if (inp) inp.value = _lastUserMessage
    luloListen()
}
```

CSS:
```css
.chat-retry { text-align: center; margin: 4px 0 12px; }
.retry-btn {
    background: none; border: 1px solid rgba(0,212,255,0.25); color: rgba(0,212,255,0.7);
    font-size: 0.75rem; font-family: 'Inter', sans-serif; padding: 6px 16px;
    border-radius: 20px; cursor: pointer; transition: all 0.2s ease;
}
.retry-btn:hover { background: rgba(0,212,255,0.08); border-color: rgba(0,212,255,0.4); }
```

Store the last user message: at the top of `luloListen()`, after reading the input value, add:
```javascript
_lastUserMessage = inputValue
```

### 5D — Fix `luloPrayerForOtherName` Bug

In `generatePrayer()`, the code references `localStorage.getItem('luloPrayerForOtherName')` as a
fallback, but this key is never set in the prayer-for-others capture flow (the name is passed as a
parameter instead). The localStorage fallback would silently return `null`.

Fix: in the prayer-for-others capture flow (where the user provides the name of the person to pray for),
add: `localStorage.setItem('luloPrayerForOtherName', capturedName)`.
Then in `generatePrayer()`, the `localStorage.getItem('luloPrayerForOtherName')` fallback works.
Clean it up after the prayer is generated: `localStorage.removeItem('luloPrayerForOtherName')`.

---

## PART 6: app.js MODULARISATION

app.js is 5,600 lines in one file. Do NOT attempt a full split in this session — the inter-function
dependencies are too dense to refactor safely all at once. Extract only the two safest boundaries:

### 6A — Extract `lulo-scripture.js`

The scripture verse arrays are pure data with no function dependencies. They are ~1,500 lines and
can be safely moved.

1. Find every `const` array declaration in `app.js` that holds Bible verse objects
   (e.g. `const joyVerses = [...]`, `const peaceVerses = [...]`, any array ending in `Verses` or
   containing objects with `.text` and `.ref` properties).
2. Create `lulo-scripture.js` and move ALL those arrays into it. Do not move any functions.
3. In `index.html`, add `<script src="lulo-scripture.js"></script>` **before**
   `<script src="app.js"></script>`.
4. Remove the moved arrays from `app.js`.
5. Verify: `app.js` references to these arrays should still work since they're now global via the
   earlier script tag.

### 6B — Extract `lulo-voice.js`

The `LuloVoice` object and `updateVoiceToggleUI()` are new code with no reverse dependencies.

1. Create `lulo-voice.js` and move the entire `LuloVoice` object and `updateVoiceToggleUI()` into it.
2. In `index.html`, add `<script src="lulo-voice.js"></script>` **before** `<script src="app.js"></script>`.
3. Remove from `app.js`.

### 6C — Future Architecture (document, do not implement yet)

Create a comment block at the top of `app.js`:
```javascript
/*
 * Em_Q app.js — Phase 3
 * Full modularisation planned for Phase 4:
 *   lulo-scripture.js  — all verse arrays (extracted Phase 3)
 *   lulo-voice.js      — voice engine (extracted Phase 3)
 *   lulo-brain.js      — luloListen, luloThink, generatePrayer, classifyIntent, crisis detection
 *   lulo-ui.js         — screens, animations, carousel, themes, journal UI
 *   lulo-core.js       — init, state, memory, Firebase sync, games
 * Until then: all remaining code lives here.
 */
```

---

## PART 7: THINGS TO PRESERVE EXACTLY

Do not touch any of the following:

- Lulo's system prompt string (passed to Claude API)
- `checkForCrisis()` and all crisis detection logic
- All emotion arrays (`emotionMap`, `situationResponses`, `interests` capture)
- All game functions (Bible trivia, number guess, choosing game)
- Firebase sync (`saveToCloud`, `loadFromCloud`, `useSyncCode`, `connectWithCode`, `syncToFirestore`)
- Journal data structures and journal rendering logic
- `generatePrayer()` business logic (only add `LuloVoice.speak()` after it renders, fix the name bug)
- `updateLuloMood()` — PNG swapping stays
- Theme system (`setTheme`, all four themes) — only the dark theme gets the galaxy background
- Web Audio API sound system (welcome/response/prayer/praise/crisis tones) — LuloVoice is additive
- Tongues unlock and Maker Easter egg
- `luloSessionCount` increment logic (keep it; streak is additive)
- Code reveal screen and Lulo Code generation logic

---

## PART 8: SERVICE WORKER + CSP

Bump SW cache name from `emq-v27` to `emq-v28` in `sw.js`.

No CSP changes needed this phase. When the RunPod endpoint URL is known, add it to `connect-src` in
the `<meta http-equiv="Content-Security-Policy">` tag in `index.html`.

---

## FINAL CHECKLIST

**UI**
- [ ] Galaxy background on dark theme; other themes unchanged
- [ ] Top bar: sound pill left, EM_Q center, shield (streak) + notif count, menu hamburger
- [ ] Lulo 240px, stronger glow, halo below, device tilt enabled
- [ ] Scripture card overlay: Lulo recedes, card expands with premium font
- [ ] Mood cards (card deck, not ring); LULO card glows green at center
- [ ] Bottom bar: mic button + "Swipe to text" hint
- [ ] Text mode: full-page overlay, Lulo not visible, char counter, sync with chat thread

**Onboarding**
- [ ] Splash screen skipped; new users go straight to `#name-screen`
- [ ] "What is Em_Q?" collapsible visible on name screen for first timers

**Voice**
- [ ] `voice-server/` folder created with `main.py`, `Dockerfile`, `requirements.txt`, `DEPLOY.md`
- [ ] `LuloVoice.load()` called in `initApp()`
- [ ] `LuloVoice.speak()` fires after every Lulo response, prayer, scripture, crisis message
- [ ] `toggleSound()` calls `LuloVoice.toggle()`
- [ ] Mic button starts SpeechRecognition; falls back to text mode if not supported
- [ ] Char counter appears at 200 chars remaining, turns amber

**Notifications**
- [ ] Daily scripture → `pushNotification()` not main card
- [ ] Shield badge shows unread count, pulses cyan when unread > 0
- [ ] Notification tray opens/closes on badge tap
- [ ] Tapping a daily scripture notification shows it in the scripture overlay

**Fixes**
- [ ] `updateStreak()` called on init; badge shows consecutive days
- [ ] Streak milestones push notifications at 7, 14, 21, 30, 50, 100 days
- [ ] `classifyIntent` is now local (no second API call)
- [ ] Error retry button appears in chat on Worker failure
- [ ] `luloPrayerForOtherName` bug fixed

**Modularisation**
- [ ] `lulo-scripture.js` created; verse arrays removed from `app.js`
- [ ] `lulo-voice.js` created; `LuloVoice` removed from `app.js`
- [ ] Both loaded in `index.html` before `app.js`
- [ ] Future architecture comment block added to top of `app.js`

**Service Worker**
- [ ] Cache version bumped to `emq-v28`

---

## EXECUTION ORDER

Work in this order to minimise risk of breaking things mid-session:

1. `sw.js` — version bump (30 seconds, zero risk)
2. `styles.css` — all new CSS (no JS changes, safe to do fully)
3. `lulo-scripture.js` — extract verse arrays (data only, safe)
4. `lulo-voice.js` — move LuloVoice (new code, safe)
5. `index.html` — structural changes (add new scripts, rework top bar, bottom bar, name screen)
6. `app.js` — JS additions in this order:
   a. Global vars (`currentRecognition`, `isVoiceInputActive`, `_lastUserMessage`)
   b. `LuloVoice.load()` + `updateStreak()` + `updateNotifBadge()` calls in `initApp()`
   c. Notification functions
   d. Streak functions
   e. `classifyIntent` local replacement
   f. `toggleVoiceInput()`, `stopVoiceInput()`, `switchToTextMode()`, `switchToVoiceMode()`
   g. `buildCarousel()` rewrite
   h. `enterScriptureMode()`, `exitScriptureMode()`
   i. `toggleNotifTray()`, `renderNotifTray()`
   j. `LuloVoice.speak()` wired after each Lulo response
   k. Retry button in error path
   l. `luloPrayerForOtherName` fix
   m. `voice-server/` folder + files
7. Final smoke-test pass: check all onclick handlers resolve, no undefined function errors
