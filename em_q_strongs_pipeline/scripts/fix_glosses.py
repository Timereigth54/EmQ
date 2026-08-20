#!/usr/bin/env python3
"""
fix_glosses.py

Repairs the `gloss` field in strongs-lexicon.json.

THE BUG
-------
build_lexicon.py took the dictionary's *first-listed* KJV rendering as the
gloss. Strong's lists renderings alphabetically, not by importance, so the
first one is frequently a rare sense:

    G2889 kosmos  -> "adorning"    (actually renders "world" 181x)
    G3056 logos   -> "account"     (actually renders "word" 166x)
    G5485 charis  -> "acceptable"  (actually renders "grace" 129x)
    H2617 chesed  -> "favour"      (actually renders "mercy" 137x)

Those are the words people ask about most, and a UI that answers "kosmos
means adorning" is worse than one that says nothing.

THE FIX
-------
Use the rendering that number *actually carries* most often in this text --
counted from bible-tagged.json, which is real tagging, not a judgement call.

Guarded one way, which turns out to be the only one needed: the winner must
also appear in the dictionary's own list of KJV renderings for that entry.
If the text says one thing and Strong's has never heard of it, the entry
keeps its original gloss.

An earlier version also refused to let a function word be a gloss, on the
theory that an article dragged into a compound tag could win on frequency.
It cannot -- compound tags attach to the last word of a phrase, and phrases
do not end on articles. What the rule actually did was break the words that
genuinely are function words: G1063 gar, which renders "for" 1004 times,
came out glossed "yet" on 3. The dictionary gate is the real protection.

Entries with no tagged occurrence in this text are left exactly as they were.
"""
import argparse, json, re
from collections import Counter

def renderings_from_definition(definition: str):
    """Pull back the dictionary's own KJV-rendering list, which build_lexicon
    appended verbatim as 'In the KJV it is rendered: ...'."""
    m = re.search(r'In the KJV it is rendered:\s*(.+?)\.?\s*$', definition or '')
    if not m:
        return set()
    words = set()
    for w in re.findall(r"[A-Za-z']+", m.group(1).lower()):
        words.add(w)
    return words


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--tagged', required=True)
    p.add_argument('--lexicon', required=True)
    p.add_argument('--out', required=True)
    a = p.parse_args()

    tagged = json.load(open(a.tagged, encoding='utf-8'))
    lex = json.load(open(a.lexicon, encoding='utf-8'))

    used = {}
    for chapters in tagged.values():
        for verses in chapters.values():
            for entries in verses.values():
                for e in entries:
                    w = re.sub(r"[^A-Za-z']", '', e['w']).lower().strip("'")
                    if w:
                        used.setdefault(e['strongs'], Counter())[w] += 1

    changed = kept = no_data = 0
    for num, entry in lex.items():
        counts = used.get(num)
        if not counts:
            no_data += 1
            continue
        allowed = renderings_from_definition(entry.get('definition', ''))
        winner = None
        for word, _n in counts.most_common():
            if len(word) < 2:
                continue
            # The dictionary must recognise this rendering. Strong's lists
            # lemma forms ("love"), the text carries inflections ("loved"),
            # so a prefix match in either direction counts as the same word.
            if any(word == r or word.startswith(r) or r.startswith(word) for r in allowed):
                winner = word
                break
        if not winner:
            kept += 1
            continue
        if winner != entry.get('gloss'):
            entry['gloss'] = winner
            changed += 1
        else:
            kept += 1

    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(lex, f, ensure_ascii=False, separators=(',', ':'))

    print('glosses replaced with the text\'s own most common rendering: %d' % changed)
    print('already correct or no dictionary-backed candidate:          %d' % kept)
    print('no tagged occurrence in this text, left untouched:          %d' % no_data)


if __name__ == '__main__':
    main()
