const CACHE_NAME = "vault-static-v2";
const APP_SHELL = ["/", "/login", "/register", "/verify-otp", "/settings/notifications", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          if (res.status === 200 && event.request.url.startsWith(self.location.origin)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/"));
    }),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const title = payload?.title || "Password Vault";
  const options = {
    body: payload?.body || "",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    image: payload?.image,
    data: {
      href: payload?.href || "/home",
    },
    tag: payload?.tag || "pv-push",
    renotify: true,
    requireInteraction: Boolean(payload?.requireInteraction),
    vibrate: payload?.vibrate || [120, 80, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.href || "/home";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const payload = event.data.payload || {};
    const title = payload.title || "Password Vault";
    const options = {
      body: payload.message || "",
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      image: payload.thumbnailUrl,
      data: { href: payload.href || "/home" },
      tag: payload.tag || "pv-local",
      renotify: true,
      requireInteraction: Boolean(payload.persistent),
      vibrate: payload.vibrate || [120, 80, 120],
      silent: Boolean(payload.silent),
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});
