/* Web Push service worker for Stock Tracker.
   Served at /sw.js → root scope, so it covers the whole app.
   Shows the OS notification when a push arrives (even with the site closed) and
   focuses/opens the app on click. */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'Stock alert'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // Collapse repeats of the same exit into one notification.
      tag: data.tag || undefined,
      // Keep it on screen until dismissed — it's an action-required alert.
      requireInteraction: true,
      data: { url: data.url || '/' },
      icon: '/icon.svg',
      badge: '/icon.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.focus()
          if ('navigate' in w && url !== '/') w.navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
