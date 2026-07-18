// Kill-switch service worker.
// An earlier version of this site registered a service worker that cached
// index.html cache-first, which pins returning visitors to that old copy of
// the site indefinitely (they never see deploys, e.g. the rebrand or the
// webinar banner). Any browser still holding that worker update-checks this
// URL on its next visit, installs this replacement, and this replacement
// deletes every cache, unregisters itself, and reloads open tabs so the next
// load comes from the network. Keep this file in place: it is the cure that
// heals old visitors, not dead code.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => client.navigate(client.url));
  })());
});
