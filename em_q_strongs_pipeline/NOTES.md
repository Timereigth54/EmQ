# Em_Q Strong's data — sources, licenses, and gaps

Built by scripting a conversion pipeline against two real datasets, per
Rule Zero in `STRONGS-DATA-PROMPT.md`. Nothing in `strongs-lexicon.json`
or `bible-tagged.json` was typed from memory — every Strong's number,
lemma, gloss, and definition sentence was extracted or mechanically
reformatted from the source files below, and the extraction is a script
you can re-run and audit.

## 1. Source datasets

### a. KJV text + word-level Strong's tagging
- **What:** `sources/en/KJVA/KJVA-osis.json` — OSIS-marked-up KJV text
  (1769 edition, incl. Apocrypha) with a `<w lemma="strong:H...">` /
  `<w lemma="strong:G...">` tag around (or spanning) each word/phrase
  that carries a Strong's number.
- **Repo:** https://github.com/scrollmapper/bible_databases
  (commit `e1b254cef86d0e65b1a5d1a94b8b112d0f296a2c`, fetched via a
  sparse git checkout of that one blob — see "How to rerun" below).
- **License — read this carefully:** The repository as a whole is MIT
  licensed (that covers Scrollmapper's own conversion code and the
  aggregate database), and its README states the bundled Bible
  *translations* are public domain. **But** the per-source README at
  `sources/en/KJVA/README.md` states the KJVA text+tagging specifically
  is **licensed GPL** — this is the CrossWire/SWORD "KJV + Strong's
  Numbers + Morphology" module lineage, and Strong's/morphology
  tagging layers on SWORD are commonly GPL even when the underlying
  KJV prose is public domain. **`bible-tagged.json` is a derivative of
  this GPL-licensed tagging layer.** If Em_Q is closed-source, get a
  second opinion on this before shipping — the safer alternative is
  to re-derive tagging from STEPBible's TAHOT/TAGNT (CC BY 4.0) or
  OpenScriptures' morphhb (CC BY 4.0), which this session didn't have
  time to also build a converter for.

### b. Strong's Hebrew + Greek dictionary
- **What:** `strongs-dictionary.xhtml` — the unified Hebrew+Greek
  Strong's dictionary (~14,197 entries: 8,674 Hebrew + 5,523 Greek,
  matching the published Strong's totals exactly).
- **Repo:** https://github.com/openscriptures/strongs
- **License:** The file's own header says the *merged* XML document is
  "Freely released under GPL 3.0" by Open Scriptures. Its two inputs
  are independently more permissive: James Strong's 1890 dictionary
  text is public domain (published 1890, author died 1894), and the
  corrected real-Greek-unicode edition it's merged with
  (morphgnt/strongs-dictionary-xml) is released under **CC0** (public
  domain waiver). So: the *content* is public domain/CC0 in origin,
  but the specific file consumed here carries a GPL 3.0 label from the
  merge step. Same flag as above — if that's a problem, rebuild
  `strongs-lexicon.json` from `hebrew/strongshebrew.dat` +
  `greek/strongsgreek.dat` in that same repo (the pre-merge originals)
  instead of `strongs-dictionary.xhtml`.

### c. Candidates checked and not used
- **STEPBible TAHOT/TAGNT** (CC BY 4.0) — real, current, and would
  avoid the GPL question above entirely by tagging the Hebrew/Greek
  text directly rather than via a KJV-anchored intermediate. Not used
  this session for time reasons; recommended as the next thing to try
  if the GPL question above is a blocker.
- **OpenScriptures morphhb** (CC BY 4.0, Hebrew only) — same shape of
  tradeoff as STEPBible; Hebrew-only so would still need a Greek NT
  source (STEPBible TAGNT, or morphgnt's own SBLGNT+tagging under
  CC BY 4.0).
- **Berean Interlinear (BSB)** — is in the scrollmapper repo
  (`sources/en/BSB/`) but as plain text without embedded Strong's tags
  in the copy this session could reach; would need its own separately
  sourced interlinear dataset.

## 2. Why the tagging is aligned by diff, not direct lookup

Em_Q's own Bible text is the **World English Bible (WEB)**
(confirmed by wording like "his only born Son" in John 3:16, vs KJV's
"his only begotten Son"), not the KJV. The only tagging source found
and verified this session is anchored to KJV wording. So
`build_tagged_bible.py` diffs each verse's WEB words against that
verse's KJV words (`difflib.SequenceMatcher`) and only keeps a tag
where a WEB word and a KJV word are literally the same word in that
verse. Wherever WEB and KJV diverge, the tag is dropped rather than
guessed — this is why word-level coverage is well under 100% even
though verse-level coverage is ~100%.

## 3. Validation results (from `validate.py`, this run)

- Every Strong's number used in `bible-tagged.json` exists in
  `strongs-lexicon.json`. PASS
- All 66 book names match Em_Q's own naming exactly. PASS
- No chapter/verse falls outside Em_Q's real ranges. PASS
- **Verse coverage:** 31,079 / 31,082 verses (100.0%) have at least one
  tagged word — OT 23,126/23,127, NT 7,953/7,955.
- **Word coverage:** 317,497 / 786,178 words (40.4%) carry a tag. This
  is the honest number — WEB is a fresh translation, not a KJV
  revision, so a majority of individual word choices differ and get
  correctly dropped rather than force-matched.
- 3 verses got **zero** tags at all (not a bug — checked individually):
  `Joshua 13:20`, `Luke 3:35`, `2 Timothy 2:9`. Two are genealogies/
  place-name lists where WEB's transliteration choices don't overlap
  the KJV's at all; the third is a heavily reworded sentence in WEB.
- File sizes: `bible-tagged.json` ≈ 10.0 MB raw / 1.4 MB gzipped.
  `strongs-lexicon.json` ≈ 3.5 MB raw / 0.8 MB gzipped. Both minified
  (no whitespace). If phone payload size matters more than this, the
  next lever is splitting `bible-tagged.json` per book (66 small
  files fetched on demand) rather than one 10 MB blob — didn't do that
  here since the shape you specified was a single file.

## 4. Known imperfections, stated plainly

- **Compound-tag heuristic:** where a single KJV `<w>` tag carries two
  Strong's numbers (e.g. Greek "the God" tagged `G3588 G2316` because
  the article and noun render as one English phrase), this pipeline
  keeps only the *last* number and treats it as the lexical head. This
  matches the worked example already in the brief (`G2889` for "world",
  not `G3588`), but it's a rule, not a certainty, for every one of the
  ~90,000 compound tags in the source. A minority will be wrong by
  this rule where Hebrew/Greek word order puts the content word first.
- **Multi-word phrase tags:** where one `<w>` tag's text spans several
  English words (e.g. "In the beginning" for `H7225`), the Strong's
  number is attached only to the *last* word of that phrase. Same
  caveat as above.
- **Occurrence counts** in `strongs-lexicon.json` are counted directly
  from this pipeline's own tagged 66-book text (not copied from a
  published concordance), so they reflect this project's tagging
  exactly — they will not always match printed concordances, which
  sometimes count differently (e.g. some published counts are
  KJV-only word-occurrence counts rather than root-occurrence counts).
- **`definition` field wording:** built mechanically from two pieces of
  real dictionary text — the dictionary's own "meaning" clause and its
  own list of KJV renderings — lightly reformatted into sentence case.
  Nothing is paraphrased freely; a handful of entries (176 of 14,197)
  have no `kjv_def` span in the source and so ship with `gloss`
  omitted rather than invented.
- **176 lexicon entries** have no `gloss` field (source dictionary had
  no `kjv_def` span for them). They still have `lemma`/`translit`/
  `language`/`definition`.
- **Apocrypha:** KJVA includes 11 Apocrypha books with no counterpart
  in Em_Q's 66-book text; they're correctly excluded (never even
  loaded — see `book_filter` in `build_tagged_bible.py`), not silently
  dropped after the fact.

## 5. How to rerun

No dependencies beyond Python 3 stdlib.

```bash
cd scripts

# 1. Tag the app's WEB text against KJV+Strong's, word by word.
python3 build_tagged_bible.py \
  --kjva ../sources/KJVA-osis.json \
  --web  ../sources/bible-web.json \
  --out  ../output/bible-tagged.json \
  --occurrences-out ../output/occurrences.json

# 2. Build the lexicon, with real occurrence counts from step 1.
python3 build_lexicon.py \
  --source ../sources/strongs-dictionary.xhtml \
  --occurrences ../output/occurrences.json \
  --out ../output/strongs-lexicon.json

# 3. Validate.
python3 validate.py \
  --tagged ../output/bible-tagged.json \
  --lexicon ../output/strongs-lexicon.json \
  --web ../sources/bible-web.json
```

`sources/KJVA-osis.json` and `sources/strongs-dictionary.xhtml` are
included as-fetched so the pipeline is reproducible without re-hitting
GitHub. To refresh them from upstream:

```bash
# KJVA-osis.json (sparse checkout of one blob, repo is huge):
git clone --filter=blob:none --no-checkout --depth 1 \
  https://github.com/scrollmapper/bible_databases.git
cd bible_databases
git cat-file -p HEAD:sources/en/KJVA/KJVA-osis.json > KJVA-osis.json

# strongs-dictionary.xhtml:
curl -o strongs-dictionary.xhtml \
  https://raw.githubusercontent.com/openscriptures/strongs/master/strongs-dictionary.xhtml
```
