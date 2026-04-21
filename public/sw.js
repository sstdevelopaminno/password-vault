const swUrl = new URL(self.location.href);  
const buildValue = swUrl.searchParams.get('build');  
const BUILD_MARKER = buildValue ? buildValue : 'dev';  
const STATIC_CACHE_NAME = 'pv-static-' + BUILD_MARKER;  
const PAGE_CACHE_NAME = 'pv-pages-' + BUILD_MARKER;  
const CACHE_PREFIXES = ['pv-static-', 'pv-pages-'];  
const APP_SHELL = ['/', '/home', '/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];  
const NAVIGATION_NETWORK_TIMEOUT_MS = 15000;
const SAFE_PAGE_CACHE_PATHS = ['/', '/home', '/offline.html'];
  
async function cleanupOldCaches() {  
  const keys = await caches.keys();  
  const removable = keys.filter(function (name) {  
    const matchesPrefix = CACHE_PREFIXES.some(function (prefix) { return name.startsWith(prefix); });  
    if (!matchesPrefix) return false;  
    if (name === STATIC_CACHE_NAME) return false;  
    if (name === PAGE_CACHE_NAME) return false;  
    return true;  
  });  
  await Promise.all(removable.map(function (name) { return caches.delete(name); }));  
} 

async function purgeManagedCaches() {  
  const keys = await caches.keys();  
  const removable = keys.filter(function (name) {  
    const matchesPrefix = CACHE_PREFIXES.some(function (prefix) { return name.startsWith(prefix); });  
    return matchesPrefix;  
  });  
  await Promise.all(removable.map(function (name) { return caches.delete(name); }));  
} 

async function purgeManagedCachesAndWarmShell() {
  await purgeManagedCaches();
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.addAll(APP_SHELL);
  } catch {
    // ignore warmup failures (for offline or flaky networks)
  }
}
  
function isSameOrigin(request) {  
  const url = new URL(request.url);  
  return url.origin === self.location.origin;  
}  

function normalizePathname(pathname) {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function shouldCacheNavigationPage(request) {
  if (!isSameOrigin(request)) return false;
  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);
  return SAFE_PAGE_CACHE_PATHS.some(function (safePath) {
    return safePath === pathname;
  });
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(new Error('NETWORK_TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
  
function shouldRuntimeCache(request) {  
  const url = new URL(request.url);  
  if (!isSameOrigin(request)) return false;  
  if (url.pathname.startsWith('/api/')) return false;  
  if (request.mode === 'navigate') return false;  
  if (url.pathname.startsWith('/_next/static/')) return true;  
  if (url.pathname.startsWith('/_next/image')) return true;  
  if (url.pathname.startsWith('/icons/')) return true;  
  return ['style', 'script', 'image', 'font'].includes(request.destination);  
}  
  
async function cachePageResponse(request, response) {  
  if (!isSameOrigin(request)) return;  
  if (response.status !== 200) return;  
  if (!shouldCacheNavigationPage(request)) return;
  const contentTypeRaw = response.headers.get('content-type');  
  const contentType = contentTypeRaw ? contentTypeRaw : '';  
  if (!contentType.includes('text/html')) return;  
  const cache = await caches.open(PAGE_CACHE_NAME);  
  await cache.put(request, response.clone());  
}  

function parsePushPayload(eventData) {
  if (!eventData) return null;
  try {
    return eventData.json();
  } catch {
    try {
      const text = eventData.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
  
async function offlineNavigationResponse(request) {  
  if (shouldCacheNavigationPage(request)) {
    const cachedPage = await caches.match(request, { ignoreSearch: true });  
    if (cachedPage) return cachedPage;  
  }
  const offline = await caches.match('/offline.html');  
  if (offline) return offline;  
  return new Response('Offline', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });  
}  
  
self.addEventListener('install', function (event) {  
  event.waitUntil(caches.open(STATIC_CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); }).then(function () { return self.skipWaiting(); }));  
});  
  
self.addEventListener('activate', function (event) {  
  event.waitUntil(cleanupOldCaches().then(function () { return self.clients.claim(); }));  
}); 
  
self.addEventListener('fetch', function (event) {  
  if (event.request.method !== 'GET') return;  
  
  if (event.request.mode === 'navigate') {  
    event.respondWith((async function () {  
      try {  
        const response = await withTimeout(fetch(event.request), NAVIGATION_NETWORK_TIMEOUT_MS);  
        await cachePageResponse(event.request, response);  
        return response;  
      } catch {  
        return offlineNavigationResponse(event.request);  
      }  
    })());  
    return;  
  }  
  
  if (!shouldRuntimeCache(event.request)) return;  
  
  event.respondWith((async function () {  
    const cache = await caches.open(STATIC_CACHE_NAME);  
    const cached = await cache.match(event.request);  
    const networkPromise = fetch(event.request).then(function (response) {  
      if (response.status === 200 && response.type !== 'opaque') {  
        if (isSameOrigin(event.request)) {  
          cache.put(event.request, response.clone());  
        }  
      }  
      return response;  
    }).catch(function () {  
      return null;  
    });  
  
    if (cached) {  
      return cached;  
    }  
  
    const network = await networkPromise;  
    if (network) return network;  
    return caches.match('/offline.html');  
  })());  
}); 
  
self.addEventListener('push', function (event) {  
  if (!event.data) return;  
  const payload = parsePushPayload(event.data) || {};  
  let title = 'Vault';  
  let body = '';  
  let href = '/home';  
  let tag = 'pv-push';  
  let image = undefined;  
  let vibrate = [120, 80, 120];  
  let requireInteraction = false;  
  if (payload.title) title = payload.title;  
  if (payload.body) body = payload.body;  
  if (payload.href) href = payload.href;  
  if (payload.tag) tag = payload.tag;  
  if (payload.image) image = payload.image;  
  if (payload.vibrate) vibrate = payload.vibrate;  
  if (payload.requireInteraction) requireInteraction = true;  
  
  const options = {  
    body: body,  
    icon: '/icons/icon-192.png',  
    badge: '/icons/icon-192.png',  
    image: image,  
    data: { href: href },  
    tag: tag,  
    renotify: true,  
    requireInteraction: requireInteraction,  
    vibrate: vibrate,  
    silent: false,  
  };  
  
  event.waitUntil((async function () {  
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });  
    for (const client of list) {  
      client.postMessage({ type: 'PUSH_RECEIVED', payload: payload });  
    }  
    await self.registration.showNotification(title, options);  
  })());  
}); 
  
self.addEventListener('notificationclick', function (event) {  
  event.notification.close();  
  let target = '/home';  
  if (event.notification) {  
    if (event.notification.data) {  
      if (event.notification.data.href) {  
        target = event.notification.data.href;  
      }  
    }  
  }  
  
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {  
    const existing = list.find(function (client) { return 'focus' in client; });  
    if (existing) {  
      existing.navigate(target);  
      return existing.focus();  
    }  
    return clients.openWindow(target);  
  }));  
});  
  
self.addEventListener('message', function (event) {  
  if (!event.data) return;  
  
  if (event.data.type === 'SKIP_WAITING') {  
    self.skipWaiting();  
    return;  
  }  
  
  if (event.data.type === 'PURGE_OLD_CACHES') {  
    event.waitUntil(cleanupOldCaches());  
    return;  
  }  

  if (event.data.type === 'PURGE_APP_CACHE' || event.data.type === 'PURGE_ALL_CACHES') {  
    event.waitUntil(purgeManagedCachesAndWarmShell());  
    return;  
  }
  
  if (event.data.type === 'SHOW_NOTIFICATION') {  
    const payload = event.data.payload ? event.data.payload : {};  
    const title = payload.title ? payload.title : 'Vault';  
    const body = payload.message ? payload.message : '';  
    const href = payload.href ? payload.href : '/home';  
    const tag = payload.tag ? payload.tag : 'pv-local';  
    const vibrate = payload.vibrate ? payload.vibrate : [120, 80, 120];  
  
    event.waitUntil(self.registration.showNotification(title, {  
      body: body,  
      icon: '/icons/icon-192.png',  
      badge: '/icons/icon-192.png',  
      image: payload.thumbnailUrl,  
      data: { href: href },  
      tag: tag,  
      renotify: true,  
      requireInteraction: Boolean(payload.persistent),  
      vibrate: vibrate,  
      silent: Boolean(payload.silent),  
    }));  
  }  
}); 

