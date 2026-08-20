# Working with Kay on Em_Q

Start a new chat with this file. It is what I have learned across our sessions
that is not obvious from the code, and it is meant to save you from repeating
mistakes I have already made.

---

## 1. How Kay works

**Make the call. Do not hand back a menu.** When asked "would X be a good
idea?", the answer wanted is a decision with the reasoning behind it, then the
work done. Not three options with trade-offs. If a genuine fork exists, pick
the one you would defend and say what you picked and why — Kay will correct it
in one line if wrong, and that costs far less than a paragraph of hedging.

**Requirements arrive mid-task, and that is normal.** Kay will send new
instructions while you are still working. They are refinements, not
complaints. Fold them in and keep going. Recent examples: "actually the Bible
is a secret level", "let's have multiple ways in", "remove door 2, too
common", "the message should fade when the mic is used".

**Kay reads the output carefully and will catch what you missed.** "It looks
like one big block of text" and "we didn't remember to touch the white themes"
were both correct and both things a proper check would have found first. Being
caught is a signal you skipped verification, not that the bar is unusually
high.

**Blunt about constraints, and the constraints are real.** Money is finite,
RunPod costs real money, and Kay will say plainly when something is not
sustainable. Do not talk anyone into spending. When a feature gets switched
off, say the decision was sound if it was — Kay is often apologetic about
these calls and they are usually the right ones.

**Tone: plain, warm, no ceremony.** Skip the preamble. No "Great question!".
Lead with the answer. Kay writes with real care about how Lulo speaks to
people, and appreciates the same care in prose about the work.

---

## 2. Non-negotiables in this codebase

**Never invent scripture, Strong's numbers, glosses, or original-language
claims.** This is the founding rule of the whole Bible feature and it is
written into Lulo's prompt in several places. Data comes from a re-runnable
pipeline against real sources, never from model memory. If you cannot source
something, say so and leave it out. A file that covers 80% honestly beats one
that covers 100% with a fifth invented.

**"Omit rather than guess" is applied literally.** The tagging pipeline drops
a tag wherever the wording does not line up, instead of forcing a match. When
you extend any of this, keep that instinct — including in code. If an
auto-generated mapping might be wrong, do not ship it. Fuzzy-matching
transliterations to pronunciation keys proposed `eros -> "part"` and
`abba -> "servants"`; that is why only 27 of 61 lexicon entries carry a
Strong's number and the rest deliberately carry none.

**Comments explain WHY, not what.** Every non-obvious decision in this repo
has a comment explaining the reasoning, often including what went wrong
before. Match that. It is the house style and it is genuinely load-bearing —
several bugs were only diagnosable because a past comment recorded the trap.

**Safety rails are not features.** Scripture retrieval is always on, whether
or not the study level is unlocked, because it is what stops Lulo answering
from memory. Know which parts of a system are rails before gating anything.

---

## 3. Traps that have already bitten

**CRLF files.** `index.html` and `styles.css` are stored **CRLF**. Everything
else is LF. A Python script that reads with default newlines and writes with
`newline=''` silently converts the whole file to LF — a 100-line CSS edit came
back as 5,610 changed lines. **Always check before committing:**

```bash
for f in index.html styles.css; do
  echo "$f HEAD=$(git show HEAD:"$f" | file - | grep -o CRLF || echo LF) now=$(file "$f" | grep -o CRLF || echo LF)"
done
```

Restore with a byte-level rewrite: `read('rb').replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')`.

**Themes: there are FOUR, and TWO are pale.** `dark`, `light`, `soft`,
`midnight`. `isLight = theme === 'light' || theme === 'soft'`. Testing
`theme === 'light'` alone misses `soft` — this bug exists in more than one
place in `app.js`. Any new UI must be checked on all four. Prefer the
`--sv-*` CSS variables published by `setTheme()` over hardcoded colours; they
cannot be forgotten the way a new inline-styled element can.

**The theme `accent` is not safe for text.** It is a decorative colour.
`soft`'s is `#e8a0a0`, which measures 1.8:1 as text on a white card. Use
`--sv-accent-ink` for words and `--sv-accent` for borders and fills.

**Heredocs eat backslashes.** `python - <<'PY'` in this environment collapses
`\\n` to a real newline and `\'` to `'`, which produces broken JS. Write the
script to a file with the Write tool and run it, for anything containing
escapes or apostrophes.

**`backdrop-filter` creates a containing block.** `.glass-screen` uses it, so
a `position: fixed` child anchors to that element rather than the viewport.
Body-level is the fix for anything that must pin to the screen.

**The browser caches scripts hard.** Serve test builds with
`Cache-Control: no-store` or you will debug a stale file. This cost a full
round of confused investigation once already.

---

## 4. Deploys — three of them, independent

| what | where | how |
|---|---|---|
| the app | GitHub Pages, serves `main` only | `git push origin main` |
| the API proxy | Cloudflare Worker | `wrangler deploy`, or the dashboard editor |
| the voice server | RunPod (**frozen**) | see `voice-server/DEPLOY.md` |

`worker/index.js` in the repo is a **mirror, not the deployed code**.
Cloudflare is the source of truth. Editing the file changes nothing until it
is deployed separately. Kay does not have wrangler installed and the dashboard
editor is the usual path.

Pushing to `main` deploys to real users. Kay asks for pushes explicitly.

---

## 5. Current state, as of 2026-08-20

**Lulo's voice is FROZEN.** Not broken — switched off, because the GPU cost is
not sustainable yet. Frozen in three places: `lulo-voice.js` (`FROZEN` flag,
endpoint nulled), `lulo-wave.js` (the visualiser went with it), and
`worker/index.js` (`/tts` returns 410 without calling RunPod). All three are
live — the Worker was deployed 2026-08-20 and verified returning
`410 {"error":"tts_frozen"}`. RunPod max/active workers are also set to 0, so
the spend and the data path are both closed.

Mic input, speech recognition and everything Lulo says in text still work.
In its place there is an appeal: the speaker pill opens a card, and a line
under the home greeting fades out while the mic is open. Both go to
`mailto:kayuso2003@hotmail.com`. Mailto only — no payment form, no account
details.

**The Study is a secret level.** Word-level Hebrew and Greek, unlocked by four
undisclosed doors (asking outright, asking about the original languages, seven
taps on the EM_Q logo, or a passphrase). A 📖 menu entry appears afterwards.
Data ships as per-book files under `data/`; the pipeline lives in
`em_q_strongs_pipeline/`. `NOTES.md` records the sources, the licences, and
the corrections to the delivering session's claims.

**Open: the GPL question.** The Strong's tagging derives from a GPL-licensed
source. Accepted for now as a deliberate decision. The risk is not a lawsuit —
it is that a proprietary EmQ with a GPL derivative inside becomes a blocker if
the project ever takes money or gets acquired. STEPBible's TAHOT/TAGNT
(CC BY 4.0) is the escape hatch and stays cheap because what Kay owns is the
pipeline, not the data.

---

## 6. The one habit to keep

**Verify before reporting, and verify the thing Kay will actually look at.**

Not "the syntax parses". Run it. Open the app. Check every theme, not the one
you happened to be on. Measure rather than eyeball — a contrast script across
4 themes and 18 elements found four failures that looked fine in a screenshot.
Check the diff before committing. Say plainly what you tested and what you did
not.

Kay has said it directly: **always double check your work.** Every correction
so far has been something a proper check would have caught first.
