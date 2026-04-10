const swUrl = new URL(self.location.href);  
const buildValue = swUrl.searchParams.get('build');  
const BUILD_MARKER = buildValue ? buildValue : 'dev';  
const STATIC_CACHE_NAME = 'pv-static-' + BUILD_MARKER;  
const PAGE_CACHE_NAME = 'pv-pages-' + BUILD_MARKER;  
const CACHE_PREFIXES = ['pv-static-', 'pv-pages-'];  
const APP_SHELL = ['/offline.html', '/login', '/icons/icon-192.svg', '/icons/icon-512.svg', '/icons/maskable.svg'];  
  
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
  
function isSameOrigin(request) {  
  const url = new URL(request.url);  
  return url.origin === self.location.origin;  
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
  const contentTypeRaw = response.headers.get('content-type');  
  const contentType = contentTypeRaw ? contentTypeRaw : '';  
  if (!contentType.includes('text/html')) return;  
  const cache = await caches.open(PAGE_CACHE_NAME);  
  await cache.put(request, response.clone());  
}  
  
async function offlineNavigationResponse(request) {  
  const cachedPage = await caches.match(request, { ignoreSearch: true });  
  if (cachedPage) return cachedPage;  
  const cachedHome = await caches.match('/home', { ignoreSearch: true });  
  if (cachedHome) return cachedHome;  
  const offline = await caches.match('/offline.html');  
  if (offline) return offline;  
  return caches.match('/login');  
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
        const response = await fetch(event.request);  
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
      if (response.status === 200) {  
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
  const payload = event.data.json();  
  let title = 'Password Vault';  
  let body = '';  
  let href = '/home';  
  let tag = 'pv-push';  
  let image = undefined;  
  let vibrate = [120, 80, 120];  
  let requireInteraction = false;  
  if (payload) {  
    if (payload.title) title = payload.title;  
    if (payload.body) body = payload.body;  
    if (payload.href) href = payload.href;  
    if (payload.tag) tag = payload.tag;  
    if (payload.image) image = payload.image;  
    if (payload.vibrate) vibrate = payload.vibrate;  
    if (payload.requireInteraction) requireInteraction = true;  
  }  
  
  const options = {  
    body: body,  
    icon: '/icons/icon-192.svg',  
    badge: '/icons/icon-192.svg',  
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
  
  if (event.data.type === 'PURGE_OLD_CACHES' || event.data.type === 'PURGE_APP_CACHE') {  
    event.waitUntil(cleanupOldCaches());  
    return;  
  }  
  
  if (event.data.type === 'SHOW_NOTIFICATION') {  
    const payload = event.data.payload ? event.data.payload : {};  
    const title = payload.title ? payload.title : 'Password Vault';  
    const body = payload.message ? payload.message : '';  
    const href = payload.href ? payload.href : '/home';  
    const tag = payload.tag ? payload.tag : 'pv-local';  
    const vibrate = payload.vibrate ? payload.vibrate : [120, 80, 120];  
  
    event.waitUntil(self.registration.showNotification(title, {  
      body: body,  
      icon: '/icons/icon-192.svg',  
      badge: '/icons/icon-192.svg',  
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
