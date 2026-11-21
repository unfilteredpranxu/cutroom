const SHELL = 'cutroom-shell-v1'
const BASICS = ['/', '/mark.svg', '/manifest.webmanifest', '/icons/cutroom-192.png', '/icons/cutroom-512.png', '/icons/apple-touch.png']
const STATIC = /^\/(assets|icons|caption-fonts)\//

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    await cache.addAll(BASICS)
    const document = await (await cache.match('/')).text()
    const assets = [...document.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map((match) => match[1])
    await cache.addAll(assets)
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('cutroom-shell-') && key !== SHELL) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return

  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(SHELL)).match('/')) ?? Response.error()))
    return
  }

  if (!STATIC.test(url.pathname) && !BASICS.includes(url.pathname)) return
  if (request.headers.has('range')) return
  event.respondWith((async () => {
    const cache = await caches.open(SHELL)
    const cached = await cache.match(request, { ignoreVary: true })
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
      await cache.put(request, response.clone()).catch(() => {})
    }
    return response
  })())
})
