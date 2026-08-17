# Prompt: build the Strong's data for Em_Q

Hand this to whichever model you're using. It specifies the exact shapes
`lulo-bible.js` and `lulo-lexicon.js` already expect, so the output drops in
without further work.

The most important instruction is the first one. Ignore it and you get 31,000
verses of confident, invented tagging that nobody will catch until Lulo tells
someone the Greek behind a verse and is wrong.

---

## THE PROMPT

> I am building a Bible study feature for an app called Em_Q. I need two data
> files. Read every instruction before starting.
>
> **RULE ZERO — DO NOT GENERATE THIS DATA FROM YOUR OWN KNOWLEDGE.**
> You will be tempted to write out Strong's numbers, lemmas and glosses from
> memory. Do not. You will produce plausible, well-formatted, confidently wrong
> data, and the errors will be invisible to me because they will look exactly
> like the correct entries. Strong's numbers in particular are trivial to
> hallucinate and impossible to spot-check at scale.
>
> Instead: identify existing open-licensed datasets that already contain this
> information, tell me what they are, where to get them, and what licence they
> carry. Then write a **conversion script** that transforms those files into
> the shapes below. Your job is the pipeline, not the content.
>
> Candidate sources worth checking (verify these still exist and are current
> before recommending them — do not assume):
> - STEPBible's TAHOT/TAGNT datasets (tagged Hebrew and Greek, CC BY)
> - OpenScriptures Hebrew Bible and the morphhb project
> - The Berean Study Bible interlinear data
> - Public-domain Strong's dictionaries in JSON form
>
> If you cannot find a source for some part of this, say so plainly and leave
> that part out. A file that covers 80% honestly is worth far more to me than
> one that covers 100% with a fifth of it invented.
>
> ### FILE 1 — `bible-tagged.json`
>
> Word-level tagging keyed to the same references my existing text uses.
> My Bible file is structured as:
> `{ "Old Testament" | "New Testament": { BookName: { chapter: { verse: text }}}}`
> with the standard 66 books, spelled: Genesis … Malachi, Matthew … Revelation,
> using "Psalms" (not Psalm) and "Song of Solomon".
>
> Produce:
>
> ```json
> {
>   "John": {
>     "3": {
>       "16": [
>         { "w": "loved",  "strongs": "G25",   "lemma": "ἀγαπάω", "translit": "agapao" },
>         { "w": "world",  "strongs": "G2889", "lemma": "κόσμος",  "translit": "kosmos" }
>       ]
>     }
>   }
> }
> ```
>
> - Only tag words that genuinely carry a Strong's number in the source. Do not
>   tag every English word.
> - `w` should match the English word as it appears in my text where possible.
>   Where the source uses a different translation and no match exists, omit the
>   entry rather than guessing at an alignment.
> - Keep it as small as you reasonably can; it will be fetched by a phone.
>
> ### FILE 2 — `strongs-lexicon.json`
>
> ```json
> {
>   "G25": {
>     "lemma": "ἀγαπάω",
>     "translit": "agapao",
>     "language": "Greek",
>     "gloss": "to love",
>     "definition": "one or two plain sentences on how the word is actually used",
>     "occurrences": 143
>   }
> }
> ```
>
> - `gloss` is short. `definition` is plain English for a non-specialist, and
>   describes usage rather than etymology.
> - Do not write devotional or theological commentary. This is a lexicon.
> - Where a word's meaning is genuinely disputed or uncertain, say so in the
>   definition rather than picking a side.
>
> ### VALIDATION — include this, I will run it
>
> A script that checks and prints results for:
> 1. Every `strongs` value in file 1 exists as a key in file 2.
> 2. Book names match my list exactly; report any that don't.
> 3. No chapter or verse number falls outside the real range for its book.
> 4. Total verse coverage: how many of the 31,082 verses got any tagging, as a
>    percentage, broken down by testament.
> 5. Both files' sizes, and gzipped sizes.
>
> ### DELIVERABLES
>
> 1. The source datasets you chose, with links and licences.
> 2. The conversion script, runnable, with its dependencies stated.
> 3. The validation script.
> 4. A short note on what is missing or imperfect, and why.
>
> Do not give me the finished JSON pasted into chat. Give me the pipeline that
> produces it, so I can rerun it and see where every value came from.

---

## When you have the files

Drop both into the repo root and tell me. `lulo-bible.js` is already shaped for
this — it needs a `tagged()` lookup alongside `verse()`, and the prompt rules in
`app.js` need loosening from "only the 61 checked words" to "the tagging for
this verse, which you can see". That is a small change, and I would rather make
it against real data than guess at the shape now.

Keep `lulo-lexicon.js` regardless. Its value is not the glosses — it is the
`caution` field on each entry, which is hand-written to defuse the specific
things people are commonly taught wrongly. No generated lexicon will contain
that, and it is the part that stops a word study going wrong.
