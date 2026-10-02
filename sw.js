/* DYSON service worker: makes the app installable and keeps the shell available offline. Data is never cached. */
const V = 'dyson-v6', SHELL = ['app.html', 'status.html', 'login.html', 'settings.html', 'profile.html', 'style.css', 'core.js', 'app.js', 'media.js', 'contacts.js', 'emoji.js', 'menu.js', 'crop.js', 'groups.js', 'ui.js', 'settings.js', 'profile.js', 'auth.js', 'config.js', 'icons.svg', 'icon.png', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || !(u.origin === location.origin || u.hostname === 'cdn.jsdelivr.net')) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((x) => x.put(r, c)); } return res; })
    .catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('app.html') : Response.error()))));
});
