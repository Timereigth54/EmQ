const CACHE = 'emq-v1'
const ASSETS = [
    '/',
    '/index.html',
    '/lulo.png',
    '/lulo_happy.png',
    '/lulo_sad.png',
    '/lulo_anxious.png',
    '/lulo_peaceful.png',
    '/lulo_excited.png',
    '/lulo_caring.png',
    '/lulo_depressed.png',
    '/lulo_angry.png',
    '/lulo_tired.png',
    '/lulo_heartbroken.png',
    '/lulo_overwhelmed.png',
    '/lulo_prayer.png',
    '/lulo_tongues.png',
    '/lulo_empty.png',
    '/lulo_unsettled.png',
    '/lulo_praise.png',
    '/lulo_sick.png',
]

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS))
    )
})

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    )
})