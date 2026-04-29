// ─── Service Worker — ຕິດຕາມແຈ່ວຫອມແຊບ ───────────────────────────────────
const CACHE_NAME = 'jaew-homxab-v1'
const OFFLINE_URL = '/offline.html'

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/logo.png',
  '/manifest.json',
]

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch (Network-first, fallback to cache) ──────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  // Skip Supabase API calls — always go to network
  const url = new URL(event.request.url)
  if (url.hostname.includes('supabase')) return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses (HTML, JS, CSS, images)
        if (response.ok && ['document', 'script', 'style', 'image'].includes(event.request.destination)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// ── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch {}

  const title   = data.title || '🌶 ແຈ່ວຫອມແຊບ'
  const body    = data.body  || 'ມີການອັບເດດໃໝ່'
  const options = {
    body,
    icon:    '/logo.png',
    badge:   '/logo.png',
    tag:     data.tag || 'jaew-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: data.actions || [],
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ── Notification Click ────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus existing tab if open
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open new window
        if (clients.openWindow) return clients.openWindow(targetUrl)
      })
  )
})
