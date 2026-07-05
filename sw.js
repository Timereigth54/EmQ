const CACHE = 'emq-v24'
const ASSETS = [
    '/EmQ/',
    '/EmQ/index.html',
    '/EmQ/styles.css',
    '/EmQ/app.js',
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

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => {
            return Promise.allSettled(
                ASSETS.map(asset => cache.add(asset).catch(err => {
                    console.log('Could not cache:', asset)
                }))
            )
        })
    )
})

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE) {
                        console.log('Deleting old cache:', cache)
                        return caches.delete(cache)
                    }
                })
            )
        })
    )
    self.clients.claim()
})

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    )
})