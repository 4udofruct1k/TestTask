/**
 * Офлайн для веб-версии. Раздел 4.1 обещает работу без сети,
 * и для страницы на «Домой» это обещание держит сервис-воркер.
 *
 * В приложении под Capacitor не регистрируется: там файлы и так на устройстве.
 */

const CACHE = 'budget-v1';
const INDEX = new URL('./index.html', self.location.href).href;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Переход по адресу — сначала сеть, чтобы обновление доезжало.
  // Без сети отдаётся сохранённая страница.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(INDEX, copy));
          return response;
        })
        .catch(() => caches.match(INDEX).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Ассеты собраны с хешем в имени и неизменяемы — сначала кэш
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
