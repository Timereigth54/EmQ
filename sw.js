const CACHE = 'emq-v1'
const ASSETS = [
    '/EmQ/',
    '/EmQ/index.html',
    '/EmQ/lulo.png',
    '/EmQ/lulo_happy.png',
    '/EmQ/lulo_sad.png',
    '/EmQ/lulo_anxious.png',
    '/EmQ/lulo_peaceful.png',
    '/EmQ/lulo_excited.png',
    '/EmQ/lulo_caring.png',
    '/EmQ/lulo_depressed.png',
    '/EmQ/lulo_angry.png',
    '/EmQ/lulo_tired.png',
    '/EmQ/lulo_heartbroken.png',
    '/EmQ/lulo_overwhelmed.png',
    '/EmQ/lulo_prayer.png',
    '/EmQ/lulo_tongues.png',
    '/EmQ/lulo_empty.png',
    '/EmQ/lulo_unsettled.png',
    '/EmQ/lulo_praise.png',
    '/EmQ/lulo_sick.png',
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