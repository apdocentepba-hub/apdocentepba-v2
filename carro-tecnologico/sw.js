const CACHE_NAME = 'carro-tecnologico-v2';
const APP_SHELL = [
  './',
  './index.html',
  './tema-lindo.css?v=1',
  './manifest.webmanifest?v=1'
];

function patchIndexHtml(html) {
  return html.replace(
    'prepararAutosave();\nactualizarLista();',
    "prepararAutosave();\nmostrarValidaciones();\ntry{const raw=localStorage.getItem(DRAFT_KEY);if(raw)actualizarDraftBox(JSON.parse(raw))}catch(e){}"
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  const isIndex = event.request.mode === 'navigate' || url.pathname.endsWith('/carro-tecnologico/') || url.pathname.endsWith('/carro-tecnologico/index.html');

  if (isIndex) {
    event.respondWith(
      fetch(event.request)
        .then(response => response.text().then(html => new Response(patchIndexHtml(html), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })))
        .catch(() => caches.match('./index.html').then(cached => cached ? cached.text().then(html => new Response(patchIndexHtml(html), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })) : caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
