// Service worker: guarda os arquivos do site para funcionar offline.
// Online, sempre busca a versão mais nova (e atualiza o cache); offline, usa o cache.
// Incremente CACHE_VERSION só ao renomear/remover arquivos da lista, para limpar o cache antigo.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `pocketmodify-${CACHE_VERSION}`;

const APP_FILES = [
    './',
    'index.html',
    'style.css',
    'manifest.webmanifest',
    'js/app.js',
    'js/pocketmod.js',
    'js/preview.js',
    'js/sources.js',
    'js/templates.js',
    'vendor/pdf-lib.min.js',
    'vendor/pdf.min.js',
    'vendor/pdf.worker.min.js',
    'icons/icon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const isSameOrigin = new URL(event.request.url).origin === self.location.origin;
    if (event.request.method !== 'GET' || !isSameOrigin) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
});
