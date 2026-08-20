/*
 * Em_Q — lulo-bible.js
 * The whole Bible, and the means to look things up in it.
 *
 * bible.json is ~4.7MB and 31,082 verses. None of that can go in a prompt, so
 * this is a retrieval layer: find the passages that matter to what was asked,
 * and hand her those with their surroundings.
 *
 * The surroundings are the point. She is not allowed to answer Bible questions
 * from memory or from whatever the internet generally says — she reads the
 * passage in its context, with the user, and lets scripture interpret
 * scripture. That is only possible if she is holding the actual text, which
 * before this she never was.
 *
 * Loaded lazily. Most sessions never ask a Bible question and should not pay
 * 4.7MB for the possibility.
 *
 * Loaded BEFORE app.js. Nothing here depends on app.js.
 */

const LuloBible = {
    _raw: null,          // { testament: { book: { chapter: { verse: text } } } }
    _flat: null,         // [{ ref, book, chapter, verse, text, lower }]
    _byBook: null,       // book -> { chapter -> [verseNumbers] }
    _loading: null,
    source: 'bible.json',

    // Word-level Strong's tagging. Split per book on purpose: the combined
    // file is 317,497 tiny {w,strongs} objects, and parsing all of it leaves
    // tens of MB resident on a phone that is already holding bible.json, the
    // wave canvas and her decoded audio. A book is fetched when a book is
    // read. The median one is 10KB gzipped.
    tagSource: 'data/tagged/',
    lexiconIndexSource: 'data/lexicon-index.json',
    lexiconDefsSource: 'data/lexicon-defs.json',

    _tagManifest: null,      // book -> { file, chapters }
    _tags: new Map(),        // book -> { chapter: { verse: [ {w, strongs} ] } }
    _tagLoads: new Map(),    // book -> in-flight promise
    _lexicon: null,          // strongs -> { lemma, pron, language, gloss, occurrences }
    _defs: null,             // strongs -> definition
    _defsLoading: null,
    TAG_BOOKS_KEPT: 4,       // small LRU; a study ranges, it does not roam

    // ─── LOADING ────────────────────────────────────────────────────────────
    // One in-flight load, shared. Several things can ask at once — a question
    // arriving while a card is opening — and 4.7MB fetched twice is a real
    // cost on a phone.
    load() {
        if (this._loading) return this._loading
        this._loading = fetch(this.source)
            .then(r => { if (!r.ok) throw new Error('bible.json ' + r.status); return r.json() })
            .then(data => { this._raw = data; this._build(); return this })
            .catch(err => {
                // Reset so a later question can retry — a dropped connection
                // should not disable scripture for the rest of the session.
                this._loading = null
                throw err
            })
        return this._loading
    },

    get loaded() { return this._flat !== null },

    // Flattened once, at load. Search walks this array; rebuilding it per
    // query would be 31,000 objects per keystroke of thought.
    _build() {
        const flat = []
        const byBook = {}
        for (const testament of Object.keys(this._raw)) {
            for (const book of Object.keys(this._raw[testament])) {
                byBook[book] = {}
                const chapters = this._raw[testament][book]
                for (const ch of Object.keys(chapters)) {
                    const verses = chapters[ch]
                    byBook[book][ch] = Object.keys(verses).sort((a, b) => +a - +b)
                    for (const v of byBook[book][ch]) {
                        const text = verses[v]
                        flat.push({
                            ref: `${book} ${ch}:${v}`,
                            book, chapter: +ch, verse: +v, text,
                            lower: text.toLowerCase()
                        })
                    }
                }
            }
        }
        this._flat = flat
        this._byBook = byBook
    },

    // The 66, in order. Needed because normaliseBook() falls back to this list
    // when the text has not loaded yet — without it parseRef('John 3:16')
    // returned null before the first fetch, since 'john' is not in _ALIASES
    // and there was nothing else to match against. Anything that wants to
    // recognise a reference *in order to decide whether to load* was broken
    // by that, which is every caller that matters.
    _BOOK_NAMES: [
        'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua',
        'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
        '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job',
        'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah',
        'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel',
        'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
        'Haggai', 'Zechariah', 'Malachi',
        'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
        '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
        'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
        '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
        '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'
    ],

    get books() { return this._byBook ? Object.keys(this._byBook) : this._BOOK_NAMES },

    // ─── REFERENCE PARSING ──────────────────────────────────────────────────
    // People write references the way they say them: "Jn 3:16", "1 cor 13",
    // "Psalm 23" for a book actually called Psalms. A lookup that only accepts
    // the canonical spelling is a lookup that mostly fails.
    _ALIASES: {
        'psalm': 'Psalms', 'ps': 'Psalms', 'psa': 'Psalms',
        'song of songs': 'Song of Solomon', 'songs': 'Song of Solomon', 'sos': 'Song of Solomon',
        'gen': 'Genesis', 'ex': 'Exodus', 'exod': 'Exodus', 'lev': 'Leviticus',
        'num': 'Numbers', 'deut': 'Deuteronomy', 'dt': 'Deuteronomy',
        'josh': 'Joshua', 'judg': 'Judges', 'jdg': 'Judges',
        '1 sam': '1 Samuel', '2 sam': '2 Samuel', '1 kgs': '1 Kings', '2 kgs': '2 Kings',
        '1 chr': '1 Chronicles', '2 chr': '2 Chronicles', 'neh': 'Nehemiah', 'est': 'Esther',
        'prov': 'Proverbs', 'prv': 'Proverbs', 'eccl': 'Ecclesiastes', 'ecc': 'Ecclesiastes',
        'isa': 'Isaiah', 'jer': 'Jeremiah', 'lam': 'Lamentations', 'ezek': 'Ezekiel',
        'dan': 'Daniel', 'hos': 'Hosea', 'obad': 'Obadiah', 'jon': 'Jonah', 'mic': 'Micah',
        'nah': 'Nahum', 'hab': 'Habakkuk', 'zeph': 'Zephaniah', 'hag': 'Haggai',
        'zech': 'Zechariah', 'mal': 'Malachi',
        'matt': 'Matthew', 'mt': 'Matthew', 'mk': 'Mark', 'lk': 'Luke', 'jn': 'John',
        'rom': 'Romans', 'rm': 'Romans',
        '1 cor': '1 Corinthians', '2 cor': '2 Corinthians',
        'gal': 'Galatians', 'eph': 'Ephesians', 'phil': 'Philippians', 'php': 'Philippians',
        'col': 'Colossians', '1 thess': '1 Thessalonians', '2 thess': '2 Thessalonians',
        '1 tim': '1 Timothy', '2 tim': '2 Timothy', 'tit': 'Titus', 'philem': 'Philemon',
        'heb': 'Hebrews', 'jas': 'James', 'jms': 'James',
        '1 pet': '1 Peter', '2 pet': '2 Peter',
        '1 jn': '1 John', '2 jn': '2 John', '3 jn': '3 John',
        'rev': 'Revelation', 'apoc': 'Revelation',
    },

    normaliseBook(name) {
        if (!name) return null
        // "1st Corinthians" / "First Corinthians" / "I Corinthians" all mean 1.
        let s = String(name).trim().toLowerCase()
            .replace(/\.$/, '').replace(/\./g, '')
            .replace(/^(?:the\s+)?(?:book\s+of\s+)?/, '')
            .replace(/^first\s+/, '1 ').replace(/^second\s+/, '2 ').replace(/^third\s+/, '3 ')
            .replace(/^i{3}\s+/, '3 ').replace(/^i{2}\s+/, '2 ').replace(/^i\s+/, '1 ')
            .replace(/^(\d)(?:st|nd|rd|th)\s+/, '$1 ')
            .replace(/^(\d)\s*/, '$1 ')
            .replace(/\s+/g, ' ').trim()

        if (this._ALIASES[s]) return this._ALIASES[s]
        const books = this.books
        const exact = books.find(b => b.toLowerCase() === s)
        if (exact) return exact
        // Prefix match, but only when unambiguous — "j" must not silently
        // become John when Job, Joel, Jonah, Jude and James all qualify.
        const starts = books.filter(b => b.toLowerCase().startsWith(s))
        if (starts.length === 1) return starts[0]
        return null
    },

    // "John 3:16", "John 3:16-18", "Romans 8", "1 Cor 13:4"
    parseRef(str) {
        if (!str) return null
        const m = String(str).trim().match(
            /^\s*((?:[1-3I]{1,3}\s*)?[A-Za-z][A-Za-z\s]*?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/
        )
        if (!m) return null
        const book = this.normaliseBook(m[1])
        if (!book) return null
        return {
            book,
            chapter: +m[2],
            verse: m[3] ? +m[3] : null,
            through: m[4] ? +m[4] : (m[3] ? +m[3] : null)
        }
    },

    // ─── READING ────────────────────────────────────────────────────────────
    verse(book, chapter, verse) {
        const b = this.normaliseBook(book)
        if (!b || !this._raw) return null
        for (const t of Object.keys(this._raw)) {
            const text = this._raw[t]?.[b]?.[String(chapter)]?.[String(verse)]
            if (text) return { ref: `${b} ${chapter}:${verse}`, book: b, chapter: +chapter, verse: +verse, text }
        }
        return null
    },

    chapterLength(book, chapter) {
        const b = this.normaliseBook(book)
        const list = b && this._byBook[b] && this._byBook[b][String(chapter)]
        return list ? list.length : 0
    },

    // A span of verses, as one readable passage.
    passage(book, chapter, from, to) {
        const b = this.normaliseBook(book)
        if (!b) return null
        const len = this.chapterLength(b, chapter)
        if (!len) return null
        const start = Math.max(1, from || 1)
        const end = Math.min(len, to || len)
        const verses = []
        for (let v = start; v <= end; v++) {
            const got = this.verse(b, chapter, v)
            if (got) verses.push(got)
        }
        if (!verses.length) return null
        return {
            ref: start === end ? `${b} ${chapter}:${start}` : `${b} ${chapter}:${start}-${end}`,
            book: b, chapter: +chapter, from: start, to: end, verses,
            text: verses.map(v => `${v.verse}. ${v.text}`).join(' ')
        }
    },

    // What surrounds a verse. This is the function the whole module exists for:
    // a verse handed over alone is exactly how a verse gets misused, and she is
    // meant to read passages rather than quote fragments.
    context(refOrObj, radius = 4) {
        const parsed = typeof refOrObj === 'string' ? this.parseRef(refOrObj) : refOrObj
        if (!parsed) return null
        const { book, chapter } = parsed
        const len = this.chapterLength(book, chapter)
        if (!len) return null
        if (!parsed.verse) return this.passage(book, chapter, 1, len)
        const from = Math.max(1, parsed.verse - radius)
        const to = Math.min(len, (parsed.through || parsed.verse) + radius)
        const p = this.passage(book, chapter, from, to)
        if (p) {
            p.focus = parsed.through && parsed.through !== parsed.verse
                ? `${book} ${chapter}:${parsed.verse}-${parsed.through}`
                : `${book} ${chapter}:${parsed.verse}`
            p.chapterLength = len
        }
        return p
    },

    // ─── WORD-LEVEL TAGGING ─────────────────────────────────────────────────
    // What Hebrew or Greek word stands behind a word on the page. Until this
    // existed she genuinely could not know, and was told to say so.
    //
    // The tagging is aligned to this file's own wording, and where the two
    // diverge the tag was dropped rather than guessed — so coverage is near
    // total in the Old Testament and around 72% in the New, where this text
    // reads modern. A word with no tag is a word she must not claim to know.

    // The index is small enough (259KB gzipped) to hold for the session; the
    // definitions are four times that and most sessions never open one, so
    // they wait until something actually asks for a definition.
    loadLexicon() {
        if (this._lexicon) return Promise.resolve(this._lexicon)
        if (this._lexLoading) return this._lexLoading
        this._lexLoading = fetch(this.lexiconIndexSource)
            .then(r => { if (!r.ok) throw new Error('lexicon-index ' + r.status); return r.json() })
            .then(data => { this._lexicon = data; return data })
            .catch(err => { this._lexLoading = null; throw err })
        return this._lexLoading
    },

    loadDefinitions() {
        if (this._defs) return Promise.resolve(this._defs)
        if (this._defsLoading) return this._defsLoading
        this._defsLoading = fetch(this.lexiconDefsSource)
            .then(r => { if (!r.ok) throw new Error('lexicon-defs ' + r.status); return r.json() })
            .then(data => { this._defs = data; return data })
            .catch(err => { this._defsLoading = null; throw err })
        return this._defsLoading
    },

    // One book's tagging, plus the lexicon index it is meaningless without.
    // Shared in-flight, like load() — a passage and a cross reference can ask
    // for the same book in the same tick.
    loadTags(book) {
        const b = this.normaliseBook(book)
        if (!b) return Promise.resolve(null)
        if (this._tags.has(b)) {
            // Touch it so the LRU keeps what is being read.
            const held = this._tags.get(b)
            this._tags.delete(b); this._tags.set(b, held)
            return Promise.resolve(held)
        }
        if (this._tagLoads.has(b)) return this._tagLoads.get(b)

        const manifest = this._tagManifest
            ? Promise.resolve(this._tagManifest)
            : fetch(this.tagSource + 'index.json')
                .then(r => { if (!r.ok) throw new Error('tag index ' + r.status); return r.json() })
                .then(m => { this._tagManifest = m; return m })

        const job = Promise.all([manifest, this.loadLexicon()])
            .then(([m]) => {
                const file = m[b] && m[b].file
                if (!file) return null
                return fetch(this.tagSource + file)
                    .then(r => { if (!r.ok) throw new Error(file + ' ' + r.status); return r.json() })
            })
            .then(data => {
                if (data) {
                    this._tags.set(b, data)
                    while (this._tags.size > this.TAG_BOOKS_KEPT) {
                        this._tags.delete(this._tags.keys().next().value)
                    }
                }
                this._tagLoads.delete(b)
                return data
            })
            .catch(err => {
                // Tagging is an enrichment. Losing it must never take the
                // passage down with it — she simply goes back to not knowing.
                this._tagLoads.delete(b)
                console.warn('tagging unavailable for ' + b, err)
                return null
            })

        this._tagLoads.set(b, job)
        return job
    },

    // Synchronous once loadTags() has resolved for the book. Returns the
    // tagged words of one verse, each joined to its lexicon entry.
    //
    // A tag is {i, strongs}: the index of the word in this verse's whitespace
    // split, and the number it carries. The index rather than the word's text
    // is what makes a reader able to underline the right one — a verse that
    // says "God" twice under two different numbers cannot be resolved by
    // matching on the text, and guessing there is the sort of quiet wrongness
    // this whole module exists to avoid.
    tagged(book, chapter, verse) {
        const b = this.normaliseBook(book)
        if (!b || !this._lexicon) return []
        const held = this._tags.get(b)
        const raw = held && held[String(chapter)] && held[String(chapter)][String(verse)]
        if (!raw) return []
        const got = this.verse(b, chapter, verse)
        if (!got) return []
        const words = got.text.trim().split(/\s+/)
        return raw.map(t => {
            const e = this._lexicon[t.strongs] || {}
            return {
                index: t.i,
                word: words[t.i] || '',
                strongs: t.strongs,
                lemma: e.lemma || null, pron: e.pron || null,
                language: e.language || null, gloss: e.gloss || null,
                occurrences: typeof e.occurrences === 'number' ? e.occurrences : null
            }
        }).filter(t => t.word)
    },

    // One Strong's number, without needing a verse. Definition only if
    // loadDefinitions() has run — the caller decides whether it is worth it.
    strongs(number) {
        if (!this._lexicon || !number) return null
        const key = String(number).trim().toUpperCase()
        const e = this._lexicon[key]
        if (!e) return null
        return { strongs: key, ...e, definition: (this._defs && this._defs[key]) || null }
    },

    // Rendered for a prompt. Deliberately only the verse asked about: the
    // surrounding passage carries hundreds of tagged words and printing all
    // of them buries the question the way a concordance does.
    formatTags(list, ref) {
        if (!list || !list.length) return ''
        const lines = list
            .filter(t => t.lemma)
            .map(t => `  ${t.word} — ${t.strongs} ${t.lemma}`
                + (t.pron ? ` (${t.pron})` : '')
                + (t.gloss ? `, ${t.gloss}` : '')
                + (t.occurrences ? `, ${t.occurrences}x in this text` : ''))
        if (!lines.length) return ''
        return `The original-language words behind ${ref}:\n` + lines.join('\n')
    },

    // ─── SEARCH ─────────────────────────────────────────────────────────────
    // Deliberately plain: score by how many of the asked-for words a verse
    // carries, prefer rarer words, prefer them close together. No index — a
    // linear pass over 31,000 short strings is a few tens of milliseconds, and
    // an index would cost memory on a phone for a feature used a few times a
    // session.
    _STOP: new Set(('a an the and or but if of to in on at by for with about from is are was were be been being ' +
        'it its this that these those he she they them his her their you your i me my we us our ' +
        'what who whom which when where why how does do did done say says said tell told mean means ' +
        'bible verse scripture scriptures god lord jesus christ').split(' ')),

    search(query, limit = 8) {
        if (!this._flat || !query) return []
        const words = String(query).toLowerCase()
            .replace(/[^a-z0-9\s']/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !this._STOP.has(w))
        if (!words.length) return []

        // Rarer words say more about what was asked. Counted over the corpus
        // once per query, which is the same pass we need anyway.
        const freq = {}
        for (const w of words) freq[w] = 0
        for (const row of this._flat) {
            for (const w of words) if (row.lower.includes(w)) freq[w]++
        }
        const weight = {}
        for (const w of words) weight[w] = Math.log(this._flat.length / (1 + freq[w]))

        const scored = []
        for (const row of this._flat) {
            let score = 0, hits = 0
            for (const w of words) {
                if (row.lower.includes(w)) { score += weight[w]; hits++ }
            }
            if (!hits) continue
            // All the words beats some of them, by a lot.
            score *= (hits / words.length) ** 2
            // A short verse containing them is more about them than a long one.
            score *= 1 + (60 / (60 + row.text.length))
            scored.push({ row, score })
        }
        scored.sort((a, b) => b.score - a.score)
        return scored.slice(0, limit).map(s => ({ ...s.row, score: +s.score.toFixed(3) }))
    },

    // ─── LETTING SCRIPTURE INTERPRET SCRIPTURE ──────────────────────────────
    // Where else does the Bible speak to this? Derived from the text rather
    // than from a curated cross-reference list, because a curated list is not
    // in the file and inventing one would be exactly the guessing this module
    // exists to prevent.
    //
    // The method is plain: take what is distinctive about the verse — the
    // words that are rare across the whole Bible — and find the other places
    // carrying them. That catches direct quotation (the New Testament quoting
    // the Old shares wording almost exactly), and it catches passages on the
    // same subject, because subjects are made of words.
    //
    // Its honest weakness is that it finds shared wording, not shared meaning,
    // so a theme expressed in different words is missed. She is told these are
    // starting points to read rather than an authoritative chain.
    crossRefs(target, limit = 4) {
        if (!this._flat) return []
        const focus = typeof target === 'string'
            ? (() => { const p = this.parseRef(target); return p && p.verse ? this.verse(p.book, p.chapter, p.verse) : null })()
            : target
        if (!focus || !focus.text) return []

        const words = focus.lower ? focus.lower.split(/\s+/) : focus.text.toLowerCase().split(/\s+/)
        const terms = [...new Set(words
            .map(w => w.replace(/[^a-z0-9']/g, ''))
            .filter(w => w.length > 3 && !this._STOP.has(w)))]
        if (!terms.length) return []

        const freq = {}
        for (const w of terms) freq[w] = 0
        for (const row of this._flat) for (const w of terms) if (row.lower.includes(w)) freq[w]++

        // Keep only the genuinely distinctive terms. A verse sharing "people"
        // with another verse is not a cross reference.
        const rare = terms.filter(w => freq[w] > 0 && freq[w] < this._flat.length / 40)
        if (!rare.length) return []
        const weight = {}
        for (const w of rare) weight[w] = Math.log(this._flat.length / (1 + freq[w]))

        const scored = []
        for (const row of this._flat) {
            // Its own chapter is context, already supplied, not a cross reference.
            if (row.book === focus.book && row.chapter === focus.chapter) continue
            let score = 0, hits = 0
            for (const w of rare) if (row.lower.includes(w)) { score += weight[w]; hits++ }
            if (hits < 2) continue          // one shared rare word is coincidence
            score *= (hits / rare.length) ** 0.5
            scored.push({ row, score, hits })
        }
        scored.sort((a, b) => b.score - a.score)

        // Spread across books, so a study does not come back with four verses
        // from the same letter when the whole point is to range.
        const out = []
        const perBook = {}
        for (const s of scored) {
            const b = s.row.book
            perBook[b] = (perBook[b] || 0)
            if (perBook[b] >= 2) continue
            perBook[b]++
            out.push({ ...s.row, score: +s.score.toFixed(2), shared: s.hits })
            if (out.length >= limit) break
        }
        return out
    },

    // ─── WHAT SHE IS GIVEN ──────────────────────────────────────────────────
    // Turns a question into the passages she should be reading, with their
    // surroundings, ready to drop into a prompt. Explicit references win over
    // keyword hits: someone who names a verse wants that verse.
    gather(question, { maxPassages = 3, radius = 4, withCrossRefs = true } = {}) {
        if (!this.loaded) return null
        const out = []
        const seen = new Set()

        const add = passage => {
            if (!passage || seen.has(passage.ref)) return
            seen.add(passage.ref)
            out.push(passage)
        }

        // Any references written in the question itself.
        const refRe = /((?:[1-3]\s*)?[A-Z][a-z]+(?:\s+of\s+[A-Z][a-z]+)?)\.?\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?/g
        let m
        while ((m = refRe.exec(question)) !== null && out.length < maxPassages) {
            const parsed = this.parseRef(m[0])
            if (parsed) add(this.context(parsed, radius))
        }

        // Then whatever the words themselves point at, each with its context
        // so she is never handed a bare line.
        if (out.length < maxPassages) {
            for (const hit of this.search(question, maxPassages * 3)) {
                if (out.length >= maxPassages) break
                add(this.context({ book: hit.book, chapter: hit.chapter, verse: hit.verse }, radius))
            }
        }

        // Then, for the passage actually asked about, where else scripture
        // speaks to it. Only the first — running cross references on every
        // passage buries the question under a concordance.
        if (withCrossRefs && out.length) {
            const first = out[0]
            const focusVerse = first.focus
                ? (() => { const p = this.parseRef(first.focus); return p ? this.verse(p.book, p.chapter, p.verse) : null })()
                : first.verses[Math.floor(first.verses.length / 2)]
            if (focusVerse) first.crossRefs = this.crossRefs(focusVerse, 4)
        }
        return out
    },

    // Loads the tagging the gathered passages need, and attaches it to the
    // verse each passage is actually about. Only the focus verse: a passage
    // is nine verses and every one of them carries a dozen tagged words, so
    // tagging the lot would bury the question under a concordance — the very
    // failure mode the lexicon's own caution notes exist to prevent.
    //
    // Always resolves. Tagging is enrichment; if it fails she is simply back
    // to not knowing, which she is already told how to say.
    async attachTags(passages) {
        if (!passages || !passages.length) return passages
        const wanted = passages.slice(0, 1)
        await Promise.all(wanted.map(p => this.loadTags(p.book)))
        for (const p of wanted) {
            const parsed = p.focus ? this.parseRef(p.focus) : null
            const verse = parsed && parsed.verse
                ? parsed.verse
                : p.verses[Math.floor(p.verses.length / 2)].verse
            const list = this.tagged(p.book, p.chapter, verse)
            if (list.length) {
                p.tags = list
                p.tagsRef = `${p.book} ${p.chapter}:${verse}`
            }
        }
        return passages
    },

    // Rendered for a prompt. Verse numbers are kept so she can point at a line
    // and the user can find it on the page in front of them.
    format(passages) {
        if (!passages || !passages.length) return ''
        return passages.map(p => {
            let s = `${p.ref}${p.focus ? ` (asked about: ${p.focus})` : ''}\n${p.text}`
            if (p.tags && p.tags.length) {
                s += '\n\n' + this.formatTags(p.tags, p.tagsRef)
            }
            if (p.crossRefs && p.crossRefs.length) {
                s += '\n\nElsewhere in scripture, sharing this passage\'s distinctive wording:\n'
                    + p.crossRefs.map(c => `  ${c.ref} — ${c.text}`).join('\n')
            }
            return s
        }).join('\n\n')
    }
}
