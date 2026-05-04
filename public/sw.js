// ─── Service Worker — ຕິດຕາມແຈ່ວຫອມແຊບ ───────────────────────────────────
// ⚠️  Bump this version on every deploy to bust old caches
const CACHE_NAME = 'jaew-homxab-v3'

// Static assets that rarely change (NOT hashed JS/CSS — those are cache-busted by URL)
const STATIC_ASSETS = [
  '/logo.png',
  '/manifest.json',
  '/qr-payment.jpg',
]

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())   // activate immediately
  )
})

// ── Activate — delete ALL old caches ─────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// ── Fetch strategy ────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // 1. Skip Supabase API calls — always network
  if (url.hostname.includes('supabase')) return

  // 2. Hashed JS/CSS assets (/assets/*.js, /assets/*.css)
  //    These are immutable per-build; let the browser HTTP cache handle them.
  //    Do NOT put them in SW cache (stale cache = MIME type errors on redeploy).
  if (url.pathname.startsWith('/assets/')) return

  // 3. HTML documents — Network-first, NO fallback to stale cache
  //    Always fetch fresh index.html so asset hash references are correct.
  if (event.request.destination === 'document' || url.pathname === '/') {
    event.respondWith(
      fetch(event.request).catch(() =>
        // Only fall back to cache if network is truly offline
        caches.match('/') || caches.match('/index.html')
      )
    )
    return
  }

  // 4. Static assets (images, manifest) — Cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        if (response.ok && event.request.destination === 'image') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
        }
        return response
      }).catch(() => cached)
    })
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
    icon:     '/logo.png',
    badge:    '/logo.png',
    tag:      data.tag || 'jaew-notification',
    renotify: true,
    vibrate:  [200, 100, 200],
    data:     { url: data.url || '/' },
    actions:  data.actions || [],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification Click ────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) return client.focus()
        }
        if (clients.openWindow) return clients.openWindow(targetUrl)
      })
  )
})
