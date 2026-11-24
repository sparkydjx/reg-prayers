/* Service worker helper for prayer reminder notification clicks. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || './#reminders'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    })
  )
})
