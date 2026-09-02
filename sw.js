/* Rumanía en familia · service worker
   Estrategia: network-first para todo lo del propio sitio.
   Con señal, siempre se ve la última versión publicada en GitHub Pages.
   Sin señal (o con señal muy mala), se sirve la última copia guardada.
   El timeout es lo que evita que la app se quede colgada en una zona sin cobertura. */

const CACHE = 'rumania-v22';
const TIMEOUT = 3500;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './mapa-ruta.jpg',
  './mapa-sinaia.jpg',
  './mapa-prejmer-harman.jpg',
  './mapa-brasov-casco.jpg',
  './mapa-dinoparc-cueva.jpg',
  './mapa-rasnov-bran.jpg',
  './mapa-ruta-rupea.jpg',
  './mapa-sighisoara-ciudadela.jpg',
  './mapa-ruta-fagaras.jpg',
  './mapa-ruta-sibiu.jpg',
  './mapa-sibiu-casco.jpg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',

  /* audioguia de Sibiu: si un mp3 todavia no esta subido,
     el install lo saltea sin romper nada */
  './audio/sibiu-00.mp3',
  './audio/sibiu-01.mp3',
  './audio/sibiu-02.mp3',
  './audio/sibiu-03.mp3',
  './audio/sibiu-04.mp3',
  './audio/sibiu-05.mp3',
  './audio/sibiu-06.mp3',
  './audio/sibiu-07.mp3',
  './audio/sibiu-08.mp3',
  './audio/sibiu-09.mp3',
  './audio/sibiu-10.mp3',
  './audio/sibiu-11.mp3',
  './audio/sibiu-12.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function guardar(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copia = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copia));
  }
  return res;
}

/* Red primero, con tope de espera. Si la red tarda más que TIMEOUT
   o falla, se responde con lo guardado y la red sigue en segundo plano
   para dejar la copia fresca para la próxima vez. */
function redPrimero(req) {
  return new Promise((resolve) => {
    let resuelto = false;

    const reloj = setTimeout(() => {
      if (resuelto) return;
      caches.match(req).then((guardada) => {
        if (guardada && !resuelto) { resuelto = true; resolve(guardada); }
      });
    }, TIMEOUT);

    fetch(req)
      .then((res) => {
        clearTimeout(reloj);
        guardar(req, res);
        if (!resuelto) { resuelto = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(reloj);
        if (resuelto) return;
        caches.match(req)
          .then((guardada) => guardada || caches.match('./index.html'))
          .then((r) => {
            resuelto = true;
            resolve(r || new Response(
              '<meta charset="utf-8"><body style="font-family:system-ui;padding:40px;background:#f4ecdc;color:#20180f">' +
              '<h2>Sin conexión</h2><p>Todavía no hay una copia guardada de la guía. Abrila una vez con datos o wifi y después funciona sin señal.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            ));
          });
      });
  });
}

/* Las webfonts de Google: al revés, primero lo guardado.
   No cambian nunca y así no gastan tiempo ni datos en el viaje. */
function cachePrimero(req) {
  return caches.match(req).then((guardada) => {
    if (guardada) return guardada;
    return fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
      }
      return res;
    }).catch(() => guardada || Response.error());
  });
}

/* Dominios externos que si conviene guardar: solo las webfonts.
   Todo lo demas (Leaflet, mosaicos del mapa) se deja pasar sin tocar,
   para que lo maneje el navegador con sus propios reintentos. */
const FUENTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin) {
    e.respondWith(redPrimero(e.request));
  } else if (FUENTES.indexOf(url.hostname) !== -1) {
    e.respondWith(cachePrimero(e.request));
  }
  /* resto de dominios: sin respondWith, pasa directo a la red */
});

/* Permite forzar la limpieza del caché desde la página */
self.addEventListener('message', (e) => {
  if (e.data === 'limpiar') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
