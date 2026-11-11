// Backend Atlas service worker: offline app shell + cached static data.
const VERSION = 'v4';
const SHELL = `atlas-shell-${VERSION}`;
const ASSETS = `atlas-assets-${VERSION}`;
const PRECACHE = ['/', '/manifest.webmanifest', '/catalog.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(PRECACHE);
    // Also cache the hashed JS/CSS the shell references so the first offline launch works.
    const html = await (await shell.match('/')).text();
    const built = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
    const assets = await caches.open(ASSETS);
    await Promise.all(built.map((path) => assets.add(path).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL, ASSETS].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never touch cross-origin traffic (Supabase auth/sync) or the local code runner.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  // Pages: network first so deploys show up, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => { const copy = response.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); return response; })
        .catch(() => caches.match('/', { ignoreVary: true })),
    );
    return;
  }

  // Everything else: serve cached copy immediately and refresh it in the background.
  event.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const cached = await caches.match(request, { ignoreVary: true });
      const refresh = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || refresh;
    }),
  );
});
