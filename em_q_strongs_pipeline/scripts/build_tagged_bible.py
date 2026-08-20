#!/usr/bin/env python3
"""
build_tagged_bible.py

Produces bible-tagged.json by:

  1. Extracting word-level Strong's-number tagging from the KJV+Strong's
     text (sources/KJVA-osis.json, OSIS <w lemma="strong:H..."> markup).
  2. Tokenizing the app's own WEB-text Bible (sources/bible-web.json).
  3. Aligning the two word sequences per-verse with a real diff algorithm
     (difflib.SequenceMatcher) and only keeping a tag where the WEB word
     and the KJV word are the *same word* in that spot.

SOURCE (for the tagging itself)
--------------------------------
Repo:    scrollmapper/bible_databases -> sources/en/KJVA/KJVA-osis.json
License: KJV text is public domain. The Strong's-number/morphology
         tagging embedded in it traces back to the CrossWire SWORD
         project's KJV+StrongsNumbers+Morphology module, built on the
         OpenScriptures/public-domain Strong's tagging tradition; the
         scrollmapper repository as a whole is public domain per its
         README ("All included Bible translations are in the public
         domain").
Grabbed: sparse git checkout of a single blob from GitHub (see notes.md
         for the exact commands), not re-typed or regenerated from
         memory.

WHY THIS ALIGNMENT STEP EXISTS
-------------------------------
This app's Bible text is the World English Bible (WEB), not the KJV.
The Strong's tagging above is only available anchored to KJV wording.
Rather than pretend the WEB words carry the tags directly, this script
literally diffs the two verses word-by-word and transfers a tag only
where the words line up exactly. Everywhere the WEB translator chose
different words (a very large fraction of verses -- WEB is a fresh,
modern translation, not a KJV revision), the corresponding tag is
dropped rather than guessed. That is the "omit rather than guess"
instruction in the brief, implemented literally.

USAGE
-----
    python3 build_tagged_bible.py \
        --kjva ../sources/KJVA-osis.json \
        --web  ../sources/bible-web.json \
        --out  ../output/bible-tagged.json \
        --occurrences-out ../output/occurrences.json
"""
import argparse
import difflib
import json
import re
import sys
from html import unescape
from collections import defaultdict

# ---------------------------------------------------------------------
# Book name mapping: KJVA (with Apocrypha) book names -> this app's
# 66-book naming. Only canonical-66 books are mapped; the 11 Apocrypha
# books in KJVA have no counterpart in bible-web.json and are skipped.
# ---------------------------------------------------------------------
KJVA_TO_APP_BOOK = {
    "Genesis": "Genesis", "Exodus": "Exodus", "Leviticus": "Leviticus",
    "Numbers": "Numbers", "Deuteronomy": "Deuteronomy", "Joshua": "Joshua",
    "Judges": "Judges", "Ruth": "Ruth",
    "I Samuel": "1 Samuel", "II Samuel": "2 Samuel",
    "I Kings": "1 Kings", "II Kings": "2 Kings",
    "I Chronicles": "1 Chronicles", "II Chronicles": "2 Chronicles",
    "Ezra": "Ezra", "Nehemiah": "Nehemiah", "Esther": "Esther", "Job": "Job",
    "Psalms": "Psalms", "Proverbs": "Proverbs", "Ecclesiastes": "Ecclesiastes",
    "Song of Solomon": "Song of Solomon", "Isaiah": "Isaiah",
    "Jeremiah": "Jeremiah", "Lamentations": "Lamentations", "Ezekiel": "Ezekiel",
    "Daniel": "Daniel", "Hosea": "Hosea", "Joel": "Joel", "Amos": "Amos",
    "Obadiah": "Obadiah", "Jonah": "Jonah", "Micah": "Micah", "Nahum": "Nahum",
    "Habakkuk": "Habakkuk", "Zephaniah": "Zephaniah", "Haggai": "Haggai",
    "Zechariah": "Zechariah", "Malachi": "Malachi",
    "Matthew": "Matthew", "Mark": "Mark", "Luke": "Luke", "John": "John",
    "Acts": "Acts", "Romans": "Romans",
    "I Corinthians": "1 Corinthians", "II Corinthians": "2 Corinthians",
    "Galatians": "Galatians", "Ephesians": "Ephesians",
    "Philippians": "Philippians", "Colossians": "Colossians",
    "I Thessalonians": "1 Thessalonians", "II Thessalonians": "2 Thessalonians",
    "I Timothy": "1 Timothy", "II Timothy": "2 Timothy",
    "Titus": "Titus", "Philemon": "Philemon", "Hebrews": "Hebrews",
    "James": "James", "I Peter": "1 Peter", "II Peter": "2 Peter",
    "I John": "1 John", "II John": "2 John", "III John": "3 John",
    "Jude": "Jude", "Revelation of John": "Revelation",
}

# Self-closing <w .../> alternative MUST be tried first and MUST require
# the tag to actually end in "/>" -- otherwise a non-greedy (.*?)</w> on
# the open/close alternative will happily skip straight past a
# self-closing tag looking for the next real </w>, silently merging two
# unrelated words' attributes and text together. (Caught by testing
# against the worked John 3:16 example in the brief: "For" was coming out
# tagged G3588 -- the *article's* number -- instead of G1063 (gar, "for")
# until this ordering/anchoring was fixed.)
WORD_TAG_RE = re.compile(r'<w\b([^>]*?)/>|<w\b([^>]*)>(.*?)</w>', re.S)
ATTR_LEMMA_RE = re.compile(r'lemma="([^"]*)"')
TAG_STRIP_RE = re.compile(r"<[^>]+>")
STRONG_REF_RE = re.compile(r"strong:([HG])(\d+)")


def normalize_strongs_id(letter: str, digits: str) -> str:
    """The KJVA-osis source zero-pads Hebrew numbers (H07225) but the
    Strong's dictionary itself, and standard citation form, do not
    (H7225). Strip leading zeros so tagged verses and the lexicon key
    on the same number. Greek numbers in this source are already
    unpadded (G3588), so int() round-trips them unchanged."""
    return f"{letter}{int(digits)}"


def strip_inner_tags(s: str) -> str:
    return unescape(TAG_STRIP_RE.sub("", s)).strip()


def normalize(word: str) -> str:
    """Lowercase, strip surrounding punctuation, for comparison only.
    The original-cased word (from the WEB text) is what gets output."""
    return re.sub(r"^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$", "", word).lower()


def extract_kjv_words_with_strongs(verse_html: str):
    """Returns a flat list of (word_text, strongs_id_or_None) for one
    verse, expanding multi-word <w> phrases into individual word tokens
    and assigning the tag's *last* Strong's number (the lexical head,
    per the compound-tag convention this dataset uses -- verified
    against the worked example in the brief: G3588+G2889 'the world'
    resolves to G2889 kosmos, which is exactly the number the brief's
    own John 3:16 example uses) to the last word of the phrase only."""
    out = []
    for m in WORD_TAG_RE.finditer(verse_html):
        if m.group(1) is not None:
            # self-closing <w .../> -- e.g. an untranslated Greek article.
            attrs, text = m.group(1), ""
        else:
            attrs, text = m.group(2), m.group(3)
        text = strip_inner_tags(text)
        if not text:
            continue
        lemma_m = ATTR_LEMMA_RE.search(attrs or "")
        strongs_ids = [normalize_strongs_id(letter, digits)
                       for letter, digits in STRONG_REF_RE.findall(lemma_m.group(1))] \
            if lemma_m else []
        words = text.split()
        for i, w in enumerate(words):
            is_last = (i == len(words) - 1)
            out.append((w, strongs_ids[-1] if (is_last and strongs_ids) else None))
    return out


def load_kjva(path, book_filter):
    d = json.load(open(path, encoding="utf-8"))
    verses = {}  # (book, chapter, verse) -> [(word, strongs_or_None), ...]
    for book in d["books"]:
        app_name = KJVA_TO_APP_BOOK.get(book["name"])
        if not app_name or app_name not in book_filter:
            continue
        for ch in book["chapters"]:
            for v in ch["verses"]:
                key = (app_name, ch["chapter"], v["verse"])
                verses[key] = extract_kjv_words_with_strongs(v["text"])
    return verses


def tokenize_web(text):
    """Split on whitespace, keep punctuation attached to words (as the
    output 'w' field should look like the app's own text)."""
    return text.split()


def align_verse(web_words, kjv_words):
    """web_words: list[str] (as they appear in the app's text)
    kjv_words: list[(str, strongs_or_None)]
    Returns list of {"i": ..., "w": ..., "strongs": ...} using difflib to find
    exact-match runs between normalized word sequences."""
    web_norm = [normalize(w) for w in web_words]
    kjv_norm = [normalize(w) for w, _ in kjv_words]
    sm = difflib.SequenceMatcher(None, web_norm, kjv_norm, autojunk=False)
    tagged = []
    for block in sm.get_matching_blocks():
        for offset in range(block.size):
            wi = block.a + offset
            ki = block.b + offset
            strongs = kjv_words[ki][1]
            if strongs:
                tagged.append({
                    # wi is the word's index in this verse's whitespace split.
                    # Emitting it is what lets a reader highlight the exact
                    # word that carries the number: without it a consumer has
                    # to re-match on the word's text, and a verse that says
                    # "God" twice under two different numbers gets one of them
                    # attached to the wrong occurrence.
                    "i": wi,
                    "w": web_words[wi],
                    "strongs": strongs,
                })
    return tagged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kjva", required=True)
    ap.add_argument("--web", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--occurrences-out", required=True,
                     help="Where to write real per-Strong's-number "
                          "occurrence counts, computed by counting the "
                          "tags actually found in the 66-book KJVA text "
                          "(used later by build_lexicon.py).")
    args = ap.parse_args()

    web = json.load(open(args.web, encoding="utf-8"))
    book_filter = set()
    for testament in ("Old Testament", "New Testament"):
        book_filter.update(web[testament].keys())

    print(f"Loading KJVA source and filtering to this app's {len(book_filter)} books...")
    kjva_verses = load_kjva(args.kjva, book_filter)
    print(f"Loaded tagging for {len(kjva_verses)} KJVA verses in scope.")

    occurrences = defaultdict(int)
    for words in kjva_verses.values():
        for _, sid in words:
            if sid:
                occurrences[sid] += 1

    result = {}
    stats = {"verses_total": 0, "verses_with_kjva": 0, "verses_tagged": 0,
              "words_total": 0, "words_tagged": 0}

    for testament in ("Old Testament", "New Testament"):
        for book, chapters in web[testament].items():
            for ch_num, verses in chapters.items():
                for v_num, text in verses.items():
                    stats["verses_total"] += 1
                    web_words = tokenize_web(text)
                    stats["words_total"] += len(web_words)
                    key = (book, int(ch_num), int(v_num))
                    kjv_words = kjva_verses.get(key)
                    if not kjv_words:
                        continue
                    stats["verses_with_kjva"] += 1
                    tagged = align_verse(web_words, kjv_words)
                    if tagged:
                        stats["verses_tagged"] += 1
                        stats["words_tagged"] += len(tagged)
                        result.setdefault(book, {}).setdefault(ch_num, {})[v_num] = tagged

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    with open(args.occurrences_out, "w", encoding="utf-8") as f:
        json.dump(dict(occurrences), f)

    print(f"Wrote {args.out}")
    print(f"Wrote {args.occurrences_out} ({len(occurrences)} distinct Strong's numbers)")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
