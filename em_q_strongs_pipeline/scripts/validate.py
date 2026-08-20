#!/usr/bin/env python3
"""
validate.py - runs the checks requested in STRONGS-DATA-PROMPT.md:

  1. Every `strongs` value in bible-tagged.json exists as a key in
     strongs-lexicon.json.
  2. Book names in bible-tagged.json match the app's list exactly.
  3. No chapter/verse number falls outside the real range for its book
     (checked against the app's own bible-web.json, which IS the ground
     truth for what ranges are "real" in this app).
  4. Verse coverage: % of the 31,082 verses with any tagging, by
     testament.
  5. File sizes, raw and gzipped.
"""
import argparse
import gzip
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tagged", required=True)
    ap.add_argument("--lexicon", required=True)
    ap.add_argument("--web", required=True)
    args = ap.parse_args()

    tagged = json.load(open(args.tagged, encoding="utf-8"))
    lexicon = json.load(open(args.lexicon, encoding="utf-8"))
    web = json.load(open(args.web, encoding="utf-8"))

    ok = True

    # Ground truth: book -> chapter -> set(verse numbers), and testament map.
    book_testament = {}
    valid_ranges = {}  # book -> {chapter_int: max_verse_int}
    total_verses = 0
    testament_totals = {"Old Testament": 0, "New Testament": 0}
    for testament in ("Old Testament", "New Testament"):
        for book, chapters in web[testament].items():
            book_testament[book] = testament
            valid_ranges[book] = {}
            for ch, verses in chapters.items():
                nums = [int(v) for v in verses.keys()]
                valid_ranges[book][int(ch)] = max(nums)
                total_verses += len(nums)
                testament_totals[testament] += len(nums)

    app_book_set = set(book_testament.keys())

    # --- Check 1: every strongs value in file 1 exists in file 2 -----
    missing_strongs = set()
    total_tag_count = 0
    for book, chapters in tagged.items():
        for ch, verses in chapters.items():
            for v, words in verses.items():
                for w in words:
                    total_tag_count += 1
                    if w["strongs"] not in lexicon:
                        missing_strongs.add(w["strongs"])
    print("== Check 1: every tagged Strong's number exists in the lexicon ==")
    if missing_strongs:
        ok = False
        print(f"FAIL: {len(missing_strongs)} Strong's numbers used in tagging "
              f"are missing from the lexicon: {sorted(missing_strongs)[:20]}"
              f"{' ...' if len(missing_strongs) > 20 else ''}")
    else:
        print(f"PASS: all {total_tag_count} word-tags reference a Strong's "
              f"number present in strongs-lexicon.json.")

    # --- Check 2: book names match exactly ----------------------------
    tagged_books = set(tagged.keys())
    bad_books = tagged_books - app_book_set
    print("\n== Check 2: book names ==")
    if bad_books:
        ok = False
        print(f"FAIL: tagging file has book names not in the app's list: {sorted(bad_books)}")
    else:
        print(f"PASS: all {len(tagged_books)} book names in bible-tagged.json "
              f"match the app's book list exactly.")

    # --- Check 3: chapter/verse ranges ---------------------------------
    out_of_range = []
    for book, chapters in tagged.items():
        for ch_str, verses in chapters.items():
            ch = int(ch_str)
            if book not in valid_ranges or ch not in valid_ranges[book]:
                out_of_range.append((book, ch_str, None))
                continue
            max_v = valid_ranges[book][ch]
            for v_str in verses.keys():
                v = int(v_str)
                if v < 1 or v > max_v:
                    out_of_range.append((book, ch_str, v_str))
    print("\n== Check 3: chapter/verse ranges ==")
    if out_of_range:
        ok = False
        print(f"FAIL: {len(out_of_range)} chapter/verse refs fall outside "
              f"the app's real range, e.g. {out_of_range[:10]}")
    else:
        print("PASS: every chapter/verse reference in bible-tagged.json "
              "falls within this app's real ranges.")

    # --- Check 4: verse coverage ---------------------------------------
    print("\n== Check 4: verse coverage ==")
    covered = {"Old Testament": 0, "New Testament": 0}
    for book, chapters in tagged.items():
        testament = book_testament.get(book)
        if not testament:
            continue
        for ch, verses in chapters.items():
            covered[testament] += len(verses)
    total_covered = covered["Old Testament"] + covered["New Testament"]
    print(f"Total: {total_covered}/{total_verses} verses have at least one "
          f"tagged word ({100 * total_covered / total_verses:.1f}%)")
    for t in ("Old Testament", "New Testament"):
        pct = 100 * covered[t] / testament_totals[t] if testament_totals[t] else 0
        print(f"  {t}: {covered[t]}/{testament_totals[t]} ({pct:.1f}%)")

    # --- Check 5: file sizes ---------------------------------------
    print("\n== Check 5: file sizes ==")
    for path in (args.tagged, args.lexicon):
        raw = os.path.getsize(path)
        with open(path, "rb") as f:
            gz = len(gzip.compress(f.read(), compresslevel=9))
        print(f"  {os.path.basename(path)}: {raw:,} bytes raw, "
              f"{gz:,} bytes gzipped ({gz/raw*100:.1f}%)")

    print("\n" + ("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED - see above"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
