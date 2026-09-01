// =====================================================
// SERVICE WORKER - PUSH NOTIFICATIONS
// =====================================================

const CACHE_NAME = "mymessage-v7";

// -----------------------------------------------------
// INSTALL
// -----------------------------------------------------

self.addEventListener("install", (event) => {
    console.log("[SW] Installed");

    // ڕاستەوخۆ Service Worker ـی نوێ چالاک بکە
    self.skipWaiting();
});

// -----------------------------------------------------
// ACTIVATE
// -----------------------------------------------------

self.addEventListener("activate", (event) => {
    console.log("[SW] Activated");

    event.waitUntil(
        (async () => {
            // دەسەڵات بە SW بدە کە هەموو tab ـەکان کۆنترۆڵ بکات
            await self.clients.claim();

            // cache ـە کۆنەکان بسڕەوە
            const cacheNames = await caches.keys();

            await Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })()
    );
});

// -----------------------------------------------------
// FETCH
// -----------------------------------------------------

self.addEventListener("fetch", (event) => {
    // API و POST و upload ـەکان cache مەکە
    if (
        event.request.method !== "GET" ||
        event.request.url.includes("/api/")
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

// -----------------------------------------------------
// PUSH NOTIFICATION
// -----------------------------------------------------

self.addEventListener("push", (event) => {
    console.log("[SW] Push received");

    let data = {};

    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (error) {
        console.error("[SW] Push JSON error:", error);

        try {
            data = {
                title: "پیامێکی نوێ",
                body: event.data ? event.data.text() : "پەیامێکی نوێت هەیە"
            };
        } catch {
            data = {
                title: "پیامێکی نوێ",
                body: "پەیامێکی نوێت هەیە"
            };
        }
    }

    const type = data.type || "message";

    // -------------------------------------------------
    // Notification content
    // -------------------------------------------------

    let title = data.title;
    let body = data.body;

    if (!title || !body) {
        if (type === "voice-call") {
            title = title || "📞 پەیوەندی دەنگی";
            body = body || "پەیوەندی دەنگیت هەیە";
        } else if (type === "video-call") {
            title = title || "📹 پەیوەندی ڤیدیۆ";
            body = body || "پەیوەندی ڤیدیۆت هەیە";
        } else {
            title = title || "💬 پەیامێکی نوێ";
            body = body || "پەیامێکی نوێت هەیە";
        }
    }

    // -------------------------------------------------
    // Notification options
    // -------------------------------------------------

    const options = {
        body,

        icon: data.icon || "/icon-192.png",
        badge: data.badge || "/icon-192.png",

        tag: data.tag || `mymessage-${type}`,

        renotify: true,

        requireInteraction:
            type === "voice-call" ||
            type === "video-call",

        vibrate:
            type === "voice-call" ||
            type === "video-call"
                ? [300, 100, 300, 100, 500]
                : [200, 100, 200],

        data: {
            type,
            url: data.url || "/",
            chatUrl: data.chatUrl || "/",
            senderId: data.senderId || null,
            senderName: data.senderName || null,
            callId: data.callId || null
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// -----------------------------------------------------
// NOTIFICATION CLICK
// -----------------------------------------------------

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const notificationData = event.notification.data || {};

    const targetUrl =
        notificationData.chatUrl ||
        notificationData.url ||
        "/";

    event.waitUntil(
        (async () => {
            const clientsList = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true
            });

            // ئەگەر وێبسایتەکە کراوەیە، هەمان window بکەرەوە
            for (const client of clientsList) {
                try {
                    if ("focus" in client) {
                        await client.focus();

                        if (
                            targetUrl &&
                            "navigate" in client &&
                            client.url !== targetUrl
                        ) {
                            await client.navigate(targetUrl);
                        }

                        return;
                    }
                } catch (error) {
                    console.error(
                        "[SW] Client focus error:",
                        error
                    );
                }
            }

            // ئەگەر هیچ tab ـێک نەکراوە، نوێی بکەرەوە
            if (self.clients.openWindow) {
                await self.clients.openWindow(targetUrl);
            }
        })()
    );
});

// -----------------------------------------------------
// NOTIFICATION CLOSE
// -----------------------------------------------------

self.addEventListener("notificationclose", (event) => {
    console.log("[SW] Notification closed");
});