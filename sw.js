const CACHE = 'emq-v39'

// App shell — core files served cache-first
const SHELL_ASSETS = [
    '/EmQ/',
    '/EmQ/index.html',
    '/EmQ/styles.css',
    '/EmQ/lulo-scripture.js',
    '/EmQ/lulo-voice.js',
    '/EmQ/lulo-wave.js',
    '/EmQ/app.js',
    '/EmQ/site.webmanifest',
]

// Images — cached on install, served cache-first indefinitely
const IMAGE_ASSETS = [
    '/EmQ/images/lulo.png',
    '/EmQ/images/lulo_happy.png',
    '/EmQ/images/lulo_sad.png',
    '/EmQ/images/lulo_anxious.png',
    '/EmQ/images/lulo_peaceful.png',
    '/EmQ/images/lulo_excited.png',
    '/EmQ/images/lulo_caring.png',
    '/EmQ/images/lulo_depressed.png',
    '/EmQ/images/lulo_angry.png',
    '/EmQ/images/lulo_tired.png',
    '/EmQ/images/lulo_heartbroken.png',
    '/EmQ/images/lulo_overwhelmed.png',
    '/EmQ/images/lulo_prayer.png',
    '/EmQ/images/lulo_tongues.png',
    '/EmQ/images/lulo_empty.png',
    '/EmQ/images/lulo_unsettled.png',
    '/EmQ/images/lulo_praise.png',
    '/EmQ/images/lulo_sick.png',
    '/EmQ/images/lulo_loved.png',
    '/EmQ/images/lulo_afraid.png',
    '/EmQ/images/lulo_invisible.png',
    '/EmQ/images/lulo_bored.png',
    '/EmQ/images/lulo_t2.png',
    '/EmQ/images/lulo_t2_afraid.png',
    '/EmQ/images/lulo_t2_angry.png',
    '/EmQ/images/lulo_t2_anxious.png',
    '/EmQ/images/lulo_t2_bored.png',
    '/EmQ/images/lulo_t2_caring.png',
    '/EmQ/images/lulo_t2_depressed.png',
    '/EmQ/images/lulo_t2_empty.png',
    '/EmQ/images/lulo_t2_excited.png',
    '/EmQ/images/lulo_t2_expecting.png',
    '/EmQ/images/lulo_t2_happy.png',
    '/EmQ/images/lulo_t2_heartbroken.png',
    '/EmQ/images/lulo_t2_invisible.png',
    '/EmQ/images/lulo_t2_joyful.png',
    '/EmQ/images/lulo_t2_lonely.png',
    '/EmQ/images/lulo_t2_loved.png',
    '/EmQ/images/lulo_t2_overwhelmed.png',
    '/EmQ/images/lulo_t2_praise.png',
    '/EmQ/images/lulo_t2_prayerful.png',
    '/EmQ/images/lulo_t2_sad.png',
    '/EmQ/images/lulo_t2_sick.png',
    '/EmQ/images/lulo_t2_tired.png',
    '/EmQ/images/lulo_t2_tongues.png',
    '/EmQ/images/lulo_t2_unsettled.png',
]

const ALL_ASSETS = [...SHELL_ASSETS, ...IMAGE_ASSETS]

// ─── INSTALL: cache all assets, then skip waiting immediately ─────────────────
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => {
            return Promise.allSettled(
                ALL_ASSETS.map(asset => cache.add(asset).catch(() => {
                    // Silently skip assets that fail — don't block install
                }))
            )
        }).then(() => self.skipWaiting()) // Activate immediately, don't wait for old tabs to close
    )
})

// ─── ACTIVATE: delete old caches, claim all clients ───────────────────────────
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE) {
                        return caches.delete(cache)
                    }
                })
            )
        }).then(() => self.clients.claim()) // Take control of all pages immediately
    )
})

// ─── NOTIFICATION TAP ─────────────────────────────────────────────────────────
// Without this, tapping an Em_Q notification does nothing at all: the banner
// dismisses and the app never opens. Focus an existing window if one is around,
// otherwise launch the app.
self.addEventListener('notificationclick', e => {
    e.notification.close()
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
            for (const w of windows) {
                if ('focus' in w) return w.focus()
            }
            if (self.clients.openWindow) return self.clients.openWindow('/EmQ/')
        })
    )
})

// ─── FETCH: network-first for shell, cache-first for images ───────────────────
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url)

    // Don't intercept non-GET, cross-origin API calls (Firebase, Worker, Analytics)
    if (e.request.method !== 'GET') return
    if (!url.origin.includes('github.io') && !url.pathname.startsWith('/EmQ')) return

    const isShell = SHELL_ASSETS.some(a => url.pathname === a || url.pathname === a + 'index.html')
    const isImage = url.pathname.includes('/images/')

    if (isShell) {
        // Network-first for the shell.
        //
        // This used to be stale-while-revalidate, which always served the cached
        // copy and refreshed it in the background — so a deploy only became
        // visible on the *second* launch. Going to the network first means the
        // current build loads straight away; the cache is still written on every
        // success, so offline continues to work from the last good copy.
        e.respondWith(
            caches.open(CACHE).then(cache =>
                fetch(e.request)
                    .then(response => {
                        if (response && response.status === 200) {
                            cache.put(e.request, response.clone())
                        }
                        return response
                    })
                    .catch(() => cache.match(e.request))
            )
        )
    } else if (isImage) {
        // Cache-first for images — they don't change often.
        //
        // A miss now writes what it fetched. Without the put, anything outside
        // IMAGE_ASSETS was re-fetched on every load and never available
        // offline — which the theme backgrounds depend on, and they are far
        // too large to precache on install.
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached
                return fetch(e.request).then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const copy = response.clone()
                        caches.open(CACHE).then(cache => cache.put(e.request, copy))
                    }
                    return response
                })
            })
        )
    }
    // Everything else (fonts, GA, Firebase) goes straight to network
})
