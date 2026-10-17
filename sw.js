/* Service worker · V1.0 · Autor: Cristhian Steven Blandón Henao
   Deja la aplicación disponible sin internet y muestra avisos (llamados, SOS, puntos y chat), también con la aplicación cerrada. */
const V = 'cbv-campo-v1';
const BASE = ['./', 'index.html', 'config.js', 'esquema.js', 'jszip.min.js', 'gen.js', 'leaflet.js', 'leaflet.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'plantillas/reporte_emergencias.xlsx'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

/* ---- datos de sesión que la página deja guardados para poder preguntar a la central ---- */
function idb() { return new Promise((res, rej) => { const o = indexedDB.open('cbv-auth', 1); o.onupgradeneeded = () => o.result.createObjectStore('kv'); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); }); }
async function kvGet(k) { try { const d = await idb(); return await new Promise(r => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; } }
async function kvSet(k, v) { try { const d = await idb(); await new Promise(r => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => r(); t.onerror = () => r(); }); } catch (e) { /* ok */ } }

/* ---- aviso que llega del servidor (sin contenido): se le pregunta a la central qué pasó y se muestra ---- */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const a = await kvGet('auth');
    let items = [];
    if (a && a.url && a.t) {
      try {
        const r = await fetch(a.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ u: a.u, t: a.t, por: a.por, a: 'pushInfo', chatDesde: a.chatUlt || 0 }), redirect: 'follow' });
        const j = await r.json();
        if (j && j.ok) { items = j.items || []; if (j.chatUlt && j.chatUlt > (a.chatUlt || 0)) { a.chatUlt = j.chatUlt; await kvSet('auth', a); } }
      } catch (err) { /* sin conexión: se muestra el aviso general */ }
    }
    if (!items.length) items = [{ tag: 'cbv-aviso', titulo: 'Aviso de la central', texto: 'Hay una novedad. Toque para abrir la aplicación.', url: './' }];
    for (const it of items) {
      await self.registration.showNotification(it.titulo, {
        body: it.texto, tag: it.tag, renotify: false, requireInteraction: !!it.urgente,
        vibrate: it.urgente ? [400, 150, 400, 150, 400] : [200, 100, 200], icon: 'icon-192.png', badge: 'icon-192.png', data: { url: it.url },
        actions: it.llamado ? [{ action: 'activa', title: 'Unidad activa' }, { action: 'omitir', title: 'Omitir' }] : []
      });
    }
  })());
});
/* toque en un aviso (o en «Unidad activa» / «Omitir») */
self.addEventListener('notificationclick', e => {
  const n = e.notification; n.close();
  const d = n.data || {}; const url = new URL(d.url || './', self.registration.scope);
  const id = url.searchParams.get('llamado');
  const accion = e.action || '';
  if (accion === 'omitir') return;
  const ir = url.searchParams.get('mapa') ? 'mapa' : url.searchParams.get('chat') ? 'chat' : url.searchParams.get('alerta') ? 'alerta' : '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs[0];
    if (c) { c.focus(); if (id) c.postMessage({ llamado: id, accion: accion || 'ver' }); else if (ir) c.postMessage({ ir }); return; }
    if (id && accion === 'activa') url.searchParams.set('acc', 'activa');
    return self.clients.openWindow(url.href);
  }));
});
