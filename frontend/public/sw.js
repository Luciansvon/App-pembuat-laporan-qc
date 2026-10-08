const CACHE = 'qc-report-shell-v6'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/fonts/Manrope-Variable.ttf']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const page = await fetch('/', { cache: 'no-store' })
    if (!page.ok) throw new Error('Cannot precache application shell')
    const html = await page.text()
    await cache.put('/', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((match) => match[1])
    await cache.addAll([...SHELL.slice(1), ...assets])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('qc-report-shell-') && name !== CACHE) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) await (await caches.open(CACHE)).put('/', response.clone())
        return response
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }
  event.respondWith((async () => {
    // The API's CORS middleware adds Vary: Origin to static responses too.
    // This cache contains only same-origin shell assets, so ignore that vary key.
    const cached = await caches.match(url.pathname, { ignoreVary: true })
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok) await (await caches.open(CACHE)).put(request, response.clone())
    return response
  })())
})
