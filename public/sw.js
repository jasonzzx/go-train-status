self.addEventListener('push', (event) => {
  if (!event.data) return;
  let message;
  try { message = event.data.json(); } catch { return; }
  if (!message || typeof message.title !== 'string') return;
  event.waitUntil(self.registration.showNotification(message.title, {
    body: typeof message.body === 'string' ? message.body : '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: typeof message.tag === 'string' ? message.tag : 'go-arrival',
    data: { url: '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow('/');
  })());
});
