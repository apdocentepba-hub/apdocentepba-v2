const CACHE_NAME = 'carro-tecnologico-v3-series';
const APP_SHELL = [
  './',
  './index.html',
  './tema-lindo.css?v=1',
  './manifest.webmanifest?v=1'
];

const SERIAL_TO_ID = {
  'AA8027133355':'ADM-A-01','AA7027284694':'ADM-A-02','AA7027271380':'ADM-A-03','AA7027125295':'ADM-A-04','AA7027272957':'ADM-A-05','AA8027069616':'ADM-A-06','AA8027100891':'ADM-A-07','AA8027074602':'ADM-A-08','AA7027275305':'ADM-A-09','AA8027134112':'ADM-A-10','AA8027100170':'ADM-A-11','AA7027124622':'ADM-A-12','AA7027268362':'ADM-A-13','AA7027283171':'ADM-A-14','AA8027221197':'ADM-A-15','AA7027276383':'ADM-A-16','AA8027132073':'ADM-A-17','AA7027287908':'ADM-A-18','AA7027274623':'ADM-A-19','AA8027221153':'ADM-A-20','AA8027217898':'ADM-A-21','AA8027125283':'ADM-A-22','AA7027122119':'ADM-A-23','AA8027214420':'ADM-A-24','AA8027076318':'ADM-A-25','AA8027165085':'ADM-A-26','AA7027282768':'ADM-A-27','AA6027280592':'ADM-A-28','AA7027285716':'ADM-A-29','AA8027124435':'ADM-A-30',
  'AA8027219783':'ADM-B-01','AA8027125416':'ADM-B-02','AA8027106903':'ADM-B-03','AA7027271546':'ADM-B-04','AA8027135003':'ADM-B-05','AA8027127843':'ADM-B-06','AA7027126299':'ADM-B-07','AA7027111580':'ADM-B-08','AA8027183764':'ADM-B-09','AA8027058856':'ADM-B-10','AA8027067975':'ADM-B-11','AA8027092436':'ADM-B-12','AA7027186495':'ADM-B-13','AA8027102076':'ADM-B-14','AA7027273024':'ADM-B-15','AA7027241927':'ADM-B-16','AA7027147073':'ADM-B-17','AA8027222858':'ADM-B-18','AA7027277848':'ADM-B-19','AA8027052058':'ADM-B-20','AA7027284971':'ADM-B-21','AA8027133941':'ADM-B-22','AA6027283252':'ADM-B-23','AA7027101382':'ADM-B-24','AA8027129390':'ADM-B-25','AA7027114262':'ADM-B-26','AA7027286656':'ADM-B-27','AA7027187951':'ADM-B-28','AA7027291310':'ADM-B-29','AA7027276477':'ADM-B-30',
  'AA2781058790':'ADM-C-01','AA4781028308':'ADM-C-02','AA3852013922':'ADM-C-03','AA3852050988':'ADM-C-04','AA4852014641':'ADM-C-05','AA2852048191':'ADM-C-06','AA4852002376':'ADM-C-07','AA3852009057':'ADM-C-08','AA4852006423':'ADM-C-09'
};

function patchIndexHtml(html) {
  const serialCode = `
const CARRO_SERIAL_TO_ID = ${JSON.stringify(SERIAL_TO_ID)};
const normalizarBaseCarro = normalizar;
normalizar = function(v){
  const raw = normalizarBaseCarro(v);
  return CARRO_SERIAL_TO_ID[raw] || raw;
};
const agregarCodigoBaseCarro = agregarCodigo;
agregarCodigo = function(codigo){
  const raw = normalizarBaseCarro(codigo);
  const id = CARRO_SERIAL_TO_ID[raw];
  agregarCodigoBaseCarro(codigo);
  if(id){mensaje('Serie física detectada: '+raw+' → '+id+'. Se agregó el código escolar.','ok')}
};
`;
  return html.replace(
    'prepararAutosave();\nactualizarLista();',
    serialCode + "\nprepararAutosave();\nmostrarValidaciones();\ntry{const raw=localStorage.getItem(DRAFT_KEY);if(raw)actualizarDraftBox(JSON.parse(raw))}catch(e){}"
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
