#!/usr/bin/env python3
"""
build_lexicon.py

Converts openscriptures/strongs' `strongs-dictionary.xhtml` (the unified
Strong's Hebrew + Greek dictionary) into strongs-lexicon.json in the shape
Em_Q expects.

SOURCE
------
File:    strongs-dictionary.xhtml
Repo:    https://github.com/openscriptures/strongs
Content: A derivative of James Strong's 1890 "Dictionaries of Hebrew and
         Greek Words" (public domain text, published 1890, author died
         1894 -> public domain worldwide) merged with the corrected,
         real-unicode-Greek XML edition produced by Dr. Ulrik
         Sandborg-Petersen / MorphGNT (morphgnt/strongs-dictionary-xml),
         released under CC0 (public domain waiver).
License: The file's own header states the *merged/unified* XML document
         is "Freely released under GPL 3.0" by Open Scriptures. The two
         inputs it merges (1890 Strong's text, and the MorphGNT Greek
         re-edition) are each public domain / CC0 on their own. This is a
         real license tension worth knowing about before shipping it in a
         closed-source app -- see the note this script prints at the end
         and the top-level delivery notes.

WHAT THIS SCRIPT DOES NOT DO
-----------------------------
It does not write, guess, or "improve" any Hebrew/Greek word, gloss, or
definition. Every field in the output is extracted verbatim (or lightly
templated/reformatted, never re-worded) from the entry text already
present in the source file. If an entry is missing a piece (e.g. no
kjv_def span), that field is simply omitted.

USAGE
-----
    python3 build_lexicon.py \
        --source ../sources/strongs-dictionary.xhtml \
        --occurrences ../output/occurrences.json \
        --out ../output/strongs-lexicon.json
"""
import argparse
import json
import re
import sys
from html import unescape

ENTRY_RE = re.compile(
    r'<li value="(\d+)" id="(ot|nt):(\d+)">(.*?)</li>', re.S
)
LEMMA_RE = re.compile(
    r'<i title="([^"]*)" xml:lang="([a-z]+)">([^<]*)</i>'
)
FIRST_BRACE_RE = re.compile(r"\{([^}]*)\}")
KJV_DEF_RE = re.compile(r'<span class="kjv_def">(.*?)</span>', re.S)

LANG_MAP = {
    "hbo": "Hebrew",
    "oar": "Aramaic",   # "Old Aramaic" - Biblical Aramaic portions (Ezra/Daniel)
    "grc": "Greek",
    "lat": "Latin",
}


def strip_tags(s: str) -> str:
    """Remove any nested tags (e.g. <a>...</a> cross-reference links) and
    collapse whitespace. Used only for cleanup, never to alter wording."""
    s = re.sub(r"<[^>]+>", "", s)
    s = unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_gloss(kjv_def: str) -> str:
    """Take the first term of the kjv_def list and strip the
    parenthetical inflection markers Strong's uses, e.g.
    '(be-)love(-ed)' -> 'love'. This is pure string cleanup of the
    dictionary's own first-listed rendering, not a new gloss."""
    first = kjv_def.split(",")[0].split(";")[0].strip()
    # remove bracketed/parenthesized fragments like "(be-)" or "(-ed)"
    cleaned = re.sub(r"\(-?[^)]*-?\)", "", first)
    cleaned = re.sub(r"^[XÎ§]\s*", "", cleaned)  # Strong's "X" = "some form of"
    cleaned = cleaned.strip(" -")
    return cleaned or first


def build_definition(meaning_clause: str, kjv_def: str) -> str:
    """Two plain-English sentences built mechanically from real source
    text: (1) the dictionary's own 'meaning' clause -- the text between
    the lemma and the final colon, and (2) the actual list of KJV
    renderings. No content is invented; this only reformats/templates
    text already in the entry."""
    sentences = []
    if meaning_clause:
        mc = meaning_clause.strip(" ;,.")
        # Capitalize first letter for sentence form.
        mc = mc[0].upper() + mc[1:] if mc else mc
        if not mc.endswith("."):
            mc += "."
        sentences.append(mc)
    if kjv_def:
        sentences.append(f"In the KJV it is rendered: {kjv_def}.")
    return " ".join(sentences)


def parse_entries(xhtml_path: str):
    data = open(xhtml_path, encoding="utf-8").read()
    entries = {}
    skipped_no_lemma = 0
    skipped_no_kjvdef = 0
    for m in ENTRY_RE.finditer(data):
        _value, section, num, body = m.groups()
        strongs_id = ("H" if section == "ot" else "G") + num

        lemma_m = LEMMA_RE.search(body)
        if not lemma_m:
            skipped_no_lemma += 1
            continue
        title_raw, lang_code, lemma_word = lemma_m.groups()
        # title is normally exactly "{translit}"; a small number of entries
        # (e.g. H595) add a second "sometimes {alt-translit}" footnote. We
        # keep the primary (first) bracketed pronunciation as `translit`;
        # the alternate footnote, if present, is real data too but doesn't
        # fit this single-string schema field, so it's dropped here rather
        # than silently concatenated into something that looks like one
        # transliteration.
        brace_m = FIRST_BRACE_RE.search(title_raw)
        translit = brace_m.group(1).strip() if brace_m else title_raw.strip()

        kjv_def_m = KJV_DEF_RE.search(body)
        kjv_def = strip_tags(kjv_def_m.group(1)) if kjv_def_m else ""
        if not kjv_def_m:
            skipped_no_kjvdef += 1

        # meaning clause = body text after the lemma's closing </i>, up to
        # the kjv_def span (or end), stripped of tags/links.
        after_lemma = body[lemma_m.end():]
        if kjv_def_m:
            meaning_region = after_lemma[: after_lemma.find('<span class="kjv_def"')]
        else:
            meaning_region = after_lemma
        meaning_clause = strip_tags(meaning_region)
        # meaning_clause typically ends with ':' before kjv_def; drop it.
        meaning_clause = meaning_clause.rstrip(":").strip()

        entry = {
            "lemma": lemma_word,
            "translit": translit,
            "language": LANG_MAP.get(lang_code, lang_code),
        }
        if kjv_def:
            entry["gloss"] = clean_gloss(kjv_def)
        definition = build_definition(meaning_clause, kjv_def)
        if definition:
            entry["definition"] = definition

        entries[strongs_id] = entry

    return entries, skipped_no_lemma, skipped_no_kjvdef


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--occurrences", required=False,
                     help="Optional JSON file of {strongs_id: count} computed "
                          "from the actual tagged Bible text, to fill in the "
                          "'occurrences' field with a real, counted number.")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    entries, skipped_no_lemma, skipped_no_kjvdef = parse_entries(args.source)

    occ = {}
    if args.occurrences:
        try:
            occ = json.load(open(args.occurrences))
        except FileNotFoundError:
            print(f"WARNING: occurrences file {args.occurrences} not found; "
                  f"'occurrences' field will be omitted.", file=sys.stderr)

    n_with_occ = 0
    for sid, entry in entries.items():
        if sid in occ:
            entry["occurrences"] = occ[sid]
            n_with_occ += 1

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Parsed {len(entries)} lexicon entries "
          f"({sum(1 for k in entries if k.startswith('H'))} Hebrew, "
          f"{sum(1 for k in entries if k.startswith('G'))} Greek).")
    print(f"Skipped {skipped_no_lemma} malformed entries with no lemma "
          f"(these do not appear in the output at all).")
    print(f"{skipped_no_kjvdef} entries had no kjv_def span (still included, "
          f"just without a 'gloss' field).")
    print(f"Attached real occurrence counts to {n_with_occ} entries.")
    print(f"Wrote {args.out}")

    print(
        "\nLICENSE NOTE: strongs-dictionary.xhtml's own header declares the "
        "*merged* file 'Freely released under GPL 3.0' by Open Scriptures, "
        "even though its two inputs (Strong's 1890 text, and the MorphGNT "
        "Greek re-edition) are independently public domain / CC0. If GPL "
        "3.0 is a problem for a closed-source app, the safer path is to "
        "rebuild this lexicon straight from the two original public-domain "
        "sources (strongshebrew.dat / strongsgreek.dat in the same repo, "
        "plus morphgnt/strongs-dictionary-xml under CC0) instead of the "
        "pre-merged file. Flagging this rather than deciding it for you."
    )


if __name__ == "__main__":
    main()
