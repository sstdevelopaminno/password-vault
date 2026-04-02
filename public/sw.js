const CACHE_NAME = "vault-static-v5";
const APP_SHELL = ["/login", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", function (event) {
 event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
 event.waitUntil(
 caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }),
 );
});

function shouldRuntimeCache(request) {
 const url = new URL(request.url);
 if (url.origin !== self.location.origin) return false;
 if (url.pathname.startsWith("/api/")) return false;
 if (request.mode === "navigate") return false;
 if (url.pathname.startsWith("/_next/static/")) return true;
 if (url.pathname.startsWith("/_next/image")) return true;
 if (url.pathname.startsWith("/icons/")) return true;
 return ["style", "script", "image", "font"].includes(request.destination);
}

self.addEventListener("fetch", function (event) {
 if (event.request.method !== "GET") return;

 if (event.request.mode === "navigate") {
 event.respondWith(
 fetch(event.request).catch(async function () {
 const login = await caches.match("/login");
 if (login) return login;
 return caches.match("/");
 }),
 );
 return;
 }

 if (!shouldRuntimeCache(event.request)) {
 return;
 }

 event.respondWith(
 caches.open(CACHE_NAME).then(async function (cache) {
 const cached = await cache.match(event.request);
 const networkPromise = fetch(event.request)
 .then(function (res) {
 if (res.status === 200) {
 if (event.request.url.startsWith(self.location.origin)) {
 cache.put(event.request, res.clone());
 }
 }
 return res;
 })
 .catch(function () { return null; });

 if (cached) return cached;
 const network = await networkPromise;
 if (network) return network;
 return caches.match("/login");
 }),
 );
});

self.addEventListener("push", function (event) {
 if (!event.data) return;
 const payload = event.data.json();
 let title = "Password Vault";
 let body = "";
 let href = "/home";
 let tag = "pv-push";
 let image = undefined;
 let vibrate = [120, 80, 120];
 let requireInteraction = false;
 if (payload) {
 if (payload.title) { title = payload.title; }
 if (payload.body) { body = payload.body; }
 if (payload.href) { href = payload.href; }
 if (payload.tag) { tag = payload.tag; }
 if (payload.image) { image = payload.image; }
 if (payload.vibrate) { vibrate = payload.vibrate; }
 if (payload.requireInteraction) { requireInteraction = true; }
 }
 const options = {
 body,
 icon: "/icons/icon-192.svg",
 badge: "/icons/icon-192.svg",
 image,
 data: { href },
 tag,
 renotify: true,
 requireInteraction,
 vibrate,
 };

 event.waitUntil((async function () {
 const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
 let hasVisibleClient = false;

 for (const client of list) {
 if (client.visibilityState === "visible") {
 hasVisibleClient = true;
 }
 client.postMessage({ type: "PUSH_RECEIVED", payload });
 }

 if (!hasVisibleClient) {
 await self.registration.showNotification(title, options);
 }
 })());
});

self.addEventListener("notificationclick", function (event) {
 event.notification.close();
 let target = "/home";
 if (event.notification) {
 const data = event.notification.data;
 if (data) {
 if (data.href) {
 target = data.href;
 }
 }
 }

 event.waitUntil(
 clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
 const existing = list.find(function (client) { return "focus" in client; });
 if (existing) {
 existing.navigate(target);
 return existing.focus();
 }
 return clients.openWindow(target);
 }),
 );
});

self.addEventListener("message", function (event) {
 if (event.data) {
 if (event.data.type === "SKIP_WAITING") {
 self.skipWaiting();
 return;
 }
 }

 if (event.data) {
 if (event.data.type === "PURGE_APP_CACHE") {
 event.waitUntil(
 caches.keys().then(function (keys) {
 return Promise.all(keys.map(function (key) { return caches.delete(key); }));
 }).then(async function () {
 const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
 for (const client of list) {
 client.postMessage({ type: "SW_CACHE_PURGED" });
 }
 }),
 );
 return;
 }
 }

 if (event.data) {
 if (event.data.type === "SHOW_NOTIFICATION") {
 let payload = {};
 if (event.data.payload) {
 payload = event.data.payload;
 }
 let title = "Password Vault";
 if (payload.title) {
 title = payload.title;
 }
 let body = "";
 if (payload.message) {
 body = payload.message;
 }
 let href = "/home";
 if (payload.href) {
 href = payload.href;
 }
 let tag = "pv-local";
 if (payload.tag) {
 tag = payload.tag;
 }
 let vibrate = [120, 80, 120];
 if (payload.vibrate) {
 vibrate = payload.vibrate;
 }

 const options = {
 body,
 icon: "/icons/icon-192.svg",
 badge: "/icons/icon-192.svg",
 image: payload.thumbnailUrl,
 data: { href },
 tag,
 renotify: true,
 requireInteraction: Boolean(payload.persistent),
 vibrate,
 silent: Boolean(payload.silent),
 };

 event.waitUntil(self.registration.showNotification(title, options));
 }
 }
});
