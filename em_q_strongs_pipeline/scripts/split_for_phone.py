#!/usr/bin/env python3
"""
split_for_phone.py

Takes the two monolithic outputs and re-lays them out for a phone.

WHY
---
The combined files are 14MB raw. Over the wire that is fine -- brotli
takes them to ~1.5MB. The cost that actually hurts is JSON.parse and
what the parse leaves resident: bible-tagged.json alone is 317,497 tiny
{w,strongs} objects plus 31,079 arrays, which in V8 is tens of MB of
heap that never goes away, on top of bible.json's own parse, on a device
already running the wave canvas and audio buffers.

Nobody needs 66 books at once. The median chapter's tagging is 8KB.
So: one file per book fetched when that book is opened, and the lexicon
split into the part you need to render a tapped word (lemma, translit,
gloss, occurrences) and the part you only need if the user reads further
(definition).

OUTPUT
------
    data/tagged/<book-slug>.json   66 files, median 9KB gzipped
    data/lexicon-index.json        eager, all 14,197 entries, no definitions
    data/lexicon-defs.json         lazy, fetched on first word tap
    data/tagged/index.json         book slug -> filename, chapter counts
"""
import argparse, json, os, re, gzip


def slug(book: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', book.lower()).strip('-')


def write(path, obj):
    raw = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(raw)
    return len(raw), len(gzip.compress(raw, 9))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--tagged', required=True)
    p.add_argument('--lexicon', required=True)
    p.add_argument('--outdir', required=True)
    a = p.parse_args()

    tagged = json.load(open(a.tagged, encoding='utf-8'))
    lexicon = json.load(open(a.lexicon, encoding='utf-8'))

    # --- per-book tagging -------------------------------------------------
    # The shipped files carry {i, strongs} only. `w` is the word's own text,
    # which the reader already has -- it is verse.split()[i] -- so shipping it
    # again costs 44% of the gzipped payload to say something twice. It stays
    # in the pipeline's own output/ copy, where it is the thing that makes the
    # tagging auditable by eye.
    def lean(chapters):
        return {c: {v: [{'i': e['i'], 'strongs': e['strongs']} for e in arr]
                    for v, arr in verses.items()}
                for c, verses in chapters.items()}

    manifest, raw_total, gz_total, gz_each = {}, 0, 0, []
    for book, chapters in tagged.items():
        s = slug(book)
        raw, gz = write(os.path.join(a.outdir, 'tagged', s + '.json'), lean(chapters))
        manifest[book] = {'file': s + '.json', 'chapters': len(chapters)}
        raw_total += raw; gz_total += gz; gz_each.append((gz, book))
    write(os.path.join(a.outdir, 'tagged', 'index.json'), manifest)

    # --- lexicon, split by what a tap actually needs -----------------------
    # Every entry stays in the index, including the 1,425 with no occurrence
    # in this text -- a direct Strong's-number lookup should not miss.
    index = {k: {f: v[f] for f in ('lemma', 'pron', 'language', 'gloss', 'occurrences') if f in v}
             for k, v in lexicon.items()}
    defs = {k: v['definition'] for k, v in lexicon.items() if 'definition' in v}

    ir, ig = write(os.path.join(a.outdir, 'lexicon-index.json'), index)
    dr, dg = write(os.path.join(a.outdir, 'lexicon-defs.json'), defs)

    gz_each.sort(reverse=True)
    mb = lambda n: '%.2fMB' % (n / 1e6)
    kb = lambda n: '%dKB' % (n / 1024)
    print('tagged/     %d books, %s raw / %s gzipped total' % (len(manifest), mb(raw_total), mb(gz_total)))
    print('            largest %s (%s gz), median %s gz'
          % (gz_each[0][1], kb(gz_each[0][0]), kb(gz_each[len(gz_each) // 2][0])))
    print('lexicon-index.json  %s raw / %s gz   <- eager' % (mb(ir), kb(ig)))
    print('lexicon-defs.json   %s raw / %s gz   <- lazy, first word tap' % (mb(dr), kb(dg)))
    print()
    print('eager cost was 14MB raw / 2.2MB gz -> now %s gz' % kb(ig))


if __name__ == '__main__':
    main()
