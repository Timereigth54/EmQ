/*
 * Em_Q — lulo-lexicon.js
 * The Hebrew and Greek words people actually ask about.
 *
 * ── WHY THIS FILE EXISTS RATHER THAN A CONCORDANCE ──────────────────────────
 * bible.json is English text with no Strong's numbers and no word-level
 * tagging. There is no way to ask it "what is the Greek behind this verse",
 * because that information is simply not in the file.
 *
 * That leaves two options. Let her answer from model memory — which is exactly
 * what she is forbidden to do with scripture, and where invented Strong's
 * numbers and confident-sounding glosses come from. Or give her a small,
 * checked set of the words that come up in real conversation, and have her say
 * plainly when a word is not in it.
 *
 * This is the second. It is deliberately short. Every entry is a
 * well-attested, uncontroversial word whose meaning is not in dispute among
 * people who read the languages; the moment an entry needs an argument, it
 * does not belong here.
 *
 * ── THE THING THIS FILE IS MOST LIKELY TO BE MISUSED FOR ────────────────────
 * Word studies are the most abused tool in lay Bible study. "The Greek word
 * means X, therefore the verse means X" is usually wrong: words mean what they
 * mean in a sentence, not what their roots once meant, and a writer using
 * agape does not automatically invoke a technical definition of it. The New
 * Testament itself uses agape and phileo interchangeably in places.
 *
 * So every entry carries a `caution` where one is warranted, and the prompt
 * rules tell her the original language serves the passage rather than
 * overruling it. A lexicon that makes someone confident is worse than no
 * lexicon at all.
 *
 * Loaded BEFORE app.js. Nothing here depends on app.js.
 */

const LuloLexicon = {
    // language: 'Greek' | 'Hebrew'
    // word: transliteration people would type or say
    // also: other spellings and closely related forms
    // gloss: what it means, plainly
    // note: how it is actually used
    // caution: where people go wrong with it
    entries: [
        // ── LOVE, and the family of words people compare ──────────────────
        { word: 'agape', language: 'Greek', also: ['agapao'], gloss: 'love; self-giving, committed love',
          note: 'The most common New Testament word for love, used of God\'s love and of the love believers are commanded to have.',
          caution: 'Often taught as a uniquely divine love distinct from phileo. The New Testament does not hold that line strictly — John 21 uses both words of the same love, and agape is used of wrong loves too, as in 2 Timothy 4:10.' },
        { word: 'phileo', language: 'Greek', also: ['philia'], gloss: 'love; affection, the love of friendship',
          note: 'Warm, personal fondness. Used of God the Father toward the Son.',
          caution: 'Not a lesser love than agape. The two overlap heavily.' },
        { word: 'eros', language: 'Greek', gloss: 'desire, romantic love',
          note: 'Does not appear in the New Testament.',
          caution: 'Frequently included in sermon lists of "the four loves". It is not a biblical word.' },
        { word: 'storge', language: 'Greek', gloss: 'family affection',
          note: 'Appears only in compounds in the New Testament.', caution: '' },
        { word: 'chesed', language: 'Hebrew', also: ['hesed', 'checed'], gloss: 'steadfast love; covenant faithfulness, mercy, loyal kindness',
          note: 'One of the central words of the Old Testament. Often rendered lovingkindness or mercy. It carries commitment, not just feeling.',
          caution: 'No single English word covers it, which is why translations vary. Do not treat any one rendering as the meaning.' },

        // ── GOD, SPIRIT, WORD ─────────────────────────────────────────────
        { word: 'logos', language: 'Greek', gloss: 'word; message, account, reason',
          note: 'Ordinary Greek for a word or statement, and used of Christ in John 1.',
          caution: 'John 1 gives it that weight by how he uses it, not because the word itself always means the divine Word.' },
        { word: 'rhema', language: 'Greek', gloss: 'word; an utterance, something spoken',
          note: 'Used of spoken words and sayings.',
          caution: 'Widely taught as "a personal word from God for you now" as against logos for scripture generally. The New Testament does not use them that way; the two are often interchangeable.' },
        { word: 'ruach', language: 'Hebrew', gloss: 'spirit, breath, wind',
          note: 'Same word for all three — Genesis 1:2 has the ruach of God over the waters.', caution: '' },
        { word: 'pneuma', language: 'Greek', gloss: 'spirit, breath, wind',
          note: 'The Greek counterpart to ruach, used of the Holy Spirit, the human spirit and wind, as in John 3:8 where the double meaning is the point.', caution: '' },
        { word: 'YHWH', language: 'Hebrew', also: ['yahweh', 'jehovah', 'tetragrammaton'], gloss: 'the personal name of God',
          note: 'Rendered LORD in small capitals in most English Bibles. Connected to "I AM" in Exodus 3:14.',
          caution: '"Jehovah" is a later hybrid form, not how the name was pronounced.' },
        { word: 'elohim', language: 'Hebrew', gloss: 'God; also gods, or rulers',
          note: 'Grammatically plural, used of the one God with singular verbs.',
          caution: 'The plural form is not by itself evidence of the Trinity; Hebrew uses plural forms for majesty and the same word is used of pagan gods.' },
        { word: 'adonai', language: 'Hebrew', gloss: 'Lord, master', note: 'Spoken in place of the divine name when reading aloud.', caution: '' },

        // ── PEACE, JOY, HOPE, FAITH ───────────────────────────────────────
        { word: 'shalom', language: 'Hebrew', gloss: 'peace; wholeness, completeness, welfare',
          note: 'Far wider than absence of conflict — health, safety and things being as they should be. Used as a greeting.', caution: '' },
        { word: 'eirene', language: 'Greek', gloss: 'peace', note: 'The New Testament word, carrying much of shalom\'s breadth.', caution: '' },
        { word: 'chara', language: 'Greek', also: ['chairo'], gloss: 'joy, gladness', note: 'Shares a root with charis, grace.', caution: '' },
        { word: 'charis', language: 'Greek', gloss: 'grace; favour, a gift freely given',
          note: 'Ordinary Greek for favour or kindness, taken up by Paul for God\'s unearned favour.', caution: '' },
        { word: 'elpis', language: 'Greek', gloss: 'hope; confident expectation',
          note: 'Not wishing. It carries expectation rather than uncertainty.', caution: '' },
        { word: 'pistis', language: 'Greek', also: ['pisteuo'], gloss: 'faith, trust, faithfulness',
          note: 'Covers both believing something and being trustworthy. Context decides which is in view.', caution: '' },
        { word: 'emunah', language: 'Hebrew', gloss: 'faithfulness, steadiness, reliability',
          note: 'The Hebrew idea leans toward faithfulness and firmness more than mental assent.', caution: '' },

        // ── SIN, REPENTANCE, FORGIVENESS ──────────────────────────────────
        { word: 'hamartia', language: 'Greek', gloss: 'sin; missing the mark',
          note: 'An archery image lies behind the word.',
          caution: 'The image is often pressed too hard. In use it simply means sin or wrongdoing, not merely falling short of a target.' },
        { word: 'metanoia', language: 'Greek', also: ['metanoeo'], gloss: 'repentance; a change of mind and direction',
          note: 'A turning, not only regret.', caution: '' },
        { word: 'teshuvah', language: 'Hebrew', also: ['shuv'], gloss: 'returning, turning back',
          note: 'The Old Testament picture of repentance is coming back to where you belong.', caution: '' },
        { word: 'aphesis', language: 'Greek', gloss: 'forgiveness; release, letting go, cancellation of a debt', note: '', caution: '' },
        { word: 'splanchnizomai', language: 'Greek', gloss: 'to be moved with compassion, from the inward parts',
          note: 'Used of Jesus seeing crowds. A physical, gut-level word.', caution: '' },

        // ── FLESH, SOUL, HEART, MIND ──────────────────────────────────────
        { word: 'sarx', language: 'Greek', gloss: 'flesh; the body, or human nature turned from God',
          note: 'Paul uses it both plainly and morally. Which one is meant depends entirely on the sentence.',
          caution: 'Reading the moral sense everywhere makes Paul appear to condemn the body itself, which he does not.' },
        { word: 'psuche', language: 'Greek', also: ['psyche'], gloss: 'soul, life, self',
          note: 'Often simply "life" — the same word behind losing your life and losing your soul.', caution: '' },
        { word: 'nephesh', language: 'Hebrew', gloss: 'soul, life, living being, appetite',
          note: 'Genesis 2:7 has the man become a living nephesh. It describes the whole living creature.',
          caution: 'Not a detachable immaterial part in the way later thought imagined.' },
        { word: 'leb', language: 'Hebrew', also: ['lebab'], gloss: 'heart; the inner person, mind and will',
          note: 'In Hebrew the heart is where thinking and deciding happen, not only feeling.', caution: '' },
        { word: 'kardia', language: 'Greek', gloss: 'heart; the inner self', note: 'Same breadth as the Hebrew.', caution: '' },
        { word: 'nous', language: 'Greek', gloss: 'mind, understanding', note: 'The renewing of the nous in Romans 12:2.', caution: '' },

        // ── WORSHIP, PRAYER, GLORY ────────────────────────────────────────
        { word: 'proskuneo', language: 'Greek', gloss: 'to worship; to bow down, to prostrate oneself',
          note: 'A word of physical posture and homage.', caution: '' },
        { word: 'latreia', language: 'Greek', gloss: 'service, worship', note: 'Romans 12:1 calls offering the body a reasonable latreia.', caution: '' },
        { word: 'halal', language: 'Hebrew', gloss: 'to praise; to boast, to shine, to celebrate',
          note: 'The root behind hallelujah — praise YAH.', caution: '' },
        { word: 'yadah', language: 'Hebrew', gloss: 'to give thanks, to confess, to praise with extended hands', note: '', caution: '' },
        { word: 'kabod', language: 'Hebrew', also: ['kavod'], gloss: 'glory; weight, heaviness, honour',
          note: 'The root idea is weight — glory as substance and significance.', caution: '' },
        { word: 'doxa', language: 'Greek', gloss: 'glory, honour, splendour', note: 'Used to render kabod in the Greek Old Testament.', caution: '' },
        { word: 'parakaleo', language: 'Greek', also: ['parakletos'], gloss: 'to call alongside; to comfort, urge, encourage',
          note: 'Parakletos, the Helper or Comforter, is from this — one called to your side.', caution: '' },

        // ── TIME, WORD-PAIRS PEOPLE ASK ABOUT ─────────────────────────────
        { word: 'kairos', language: 'Greek', gloss: 'time; a season, an opportune moment', note: '',
          caution: 'Commonly contrasted with chronos as "God\'s time" against "clock time". The New Testament does not keep them that separate; both are used for ordinary time.' },
        { word: 'chronos', language: 'Greek', gloss: 'time; duration, a span of time', note: '', caution: 'See kairos.' },
        { word: 'aion', language: 'Greek', gloss: 'age, era, a long period', note: 'Behind "forever and ever" and "the end of the age".', caution: '' },
        { word: 'olam', language: 'Hebrew', gloss: 'a long duration, age, everlasting', note: 'Its length depends on what it is describing.', caution: '' },

        // ── COVENANT, LAW, RIGHTEOUSNESS ──────────────────────────────────
        { word: 'berit', language: 'Hebrew', also: ['berith'], gloss: 'covenant; a binding agreement', note: '', caution: '' },
        { word: 'diatheke', language: 'Greek', gloss: 'covenant, testament, will', note: 'The word behind Old and New Testament.', caution: '' },
        { word: 'torah', language: 'Hebrew', gloss: 'instruction, teaching, law',
          note: 'Wider than legislation — it is teaching and direction.',
          caution: 'Rendering it only as "law" makes the Old Testament sound more legal than it reads in Hebrew.' },
        { word: 'dikaiosune', language: 'Greek', gloss: 'righteousness, justice',
          note: 'One Greek word covers both English words, which is why some passages can be read either way.', caution: '' },
        { word: 'tsedeq', language: 'Hebrew', also: ['tzedek', 'tsedaqah'], gloss: 'righteousness, justice, rightness', note: '', caution: '' },
        { word: 'mishpat', language: 'Hebrew', gloss: 'justice, judgement, right ruling', note: 'Frequently paired with tsedeq.', caution: '' },

        // ── CHURCH, GOSPEL, KINGDOM ───────────────────────────────────────
        { word: 'ekklesia', language: 'Greek', gloss: 'assembly, gathering; the church',
          note: 'Ordinary Greek for a called-together assembly, including secular ones, as in Acts 19.',
          caution: '"Called-out ones" is a popular etymology pressed further than the usage supports.' },
        { word: 'euangelion', language: 'Greek', gloss: 'good news, gospel', note: 'Announcement of good news, as a herald brings.', caution: '' },
        { word: 'basileia', language: 'Greek', gloss: 'kingdom, reign, rule', note: 'Often the reign itself rather than a territory.', caution: '' },
        { word: 'koinonia', language: 'Greek', gloss: 'fellowship, sharing, participation, partnership',
          note: 'Carries having something in common, including shared money and practical partnership.', caution: '' },
        { word: 'diakonos', language: 'Greek', gloss: 'servant, minister, deacon', note: '', caution: '' },
        { word: 'kurios', language: 'Greek', gloss: 'lord, master, owner',
          note: 'Used for God, for Jesus, and for ordinary masters and sirs.', caution: '' },
        { word: 'christos', language: 'Greek', also: ['messiah', 'mashiach'], gloss: 'anointed one',
          note: 'Christos renders the Hebrew mashiach. A title before it became a name.', caution: '' },
        { word: 'tetelestai', language: 'Greek', gloss: 'it is finished; it is completed, paid in full',
          note: 'Jesus\' word from the cross in John 19:30. Attested on receipts meaning paid in full.', caution: '' },
        { word: 'amen', language: 'Hebrew', gloss: 'truly, so be it; firm, reliable',
          note: 'Related to emunah, faithfulness.', caution: '' },
        { word: 'hallelujah', language: 'Hebrew', also: ['alleluia'], gloss: 'praise YAH', note: 'An imperative — praise him.', caution: '' },
        { word: 'hosanna', language: 'Hebrew', gloss: 'save now, save please',
          note: 'A cry for rescue that became a shout of praise.', caution: '' },
        { word: 'selah', language: 'Hebrew', gloss: 'uncertain; possibly a musical pause or interlude',
          note: 'Appears mainly in Psalms.',
          caution: 'Its meaning is genuinely unknown. Confident explanations of it are guesses, and it is better to say so.' },
        { word: 'abba', language: 'Aramaic', gloss: 'father',
          note: 'The everyday Aramaic word for father, used by adults as well as children.',
          caution: 'Often taught as meaning "daddy". Scholars have largely moved away from that; it is intimate but not baby talk.' },
        { word: 'maranatha', language: 'Aramaic', gloss: 'our Lord, come; or our Lord has come', note: '1 Corinthians 16:22.', caution: '' },
    ],

    _index: null,

    _build() {
        const ix = {}
        for (const e of this.entries) {
            ix[e.word.toLowerCase()] = e
            for (const a of (e.also || [])) ix[a.toLowerCase()] = e
        }
        this._index = ix
    },

    lookup(word) {
        if (!this._index) this._build()
        if (!word) return null
        return this._index[String(word).trim().toLowerCase()] || null
    },

    // Words named anywhere in a question. Matched on whole words so "eros"
    // does not fire inside "heroes".
    find(text) {
        if (!this._index) this._build()
        if (!text) return []
        const t = String(text).toLowerCase()
        const out = []
        const seen = new Set()
        for (const key of Object.keys(this._index)) {
            if (new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t)) {
                const e = this._index[key]
                if (!seen.has(e.word)) { seen.add(e.word); out.push(e) }
            }
        }
        return out
    },

    format(list) {
        if (!list || !list.length) return ''
        return list.map(e => {
            const parts = [`${e.word} (${e.language}) — ${e.gloss}`]
            if (e.note) parts.push(`  Usage: ${e.note}`)
            if (e.caution) parts.push(`  Careful: ${e.caution}`)
            return parts.join('\n')
        }).join('\n\n')
    }
}
