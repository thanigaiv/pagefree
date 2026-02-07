/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { registerRoute } from 'workbox-routing';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// Precache static assets
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Runtime caching for incidents API
registerRoute(
  /\/api\/incidents(\?.*)?$/,
  new NetworkFirst({
    cacheName: 'incidents-list-cache',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// Cache individual incidents
registerRoute(
  /\/api\/incidents\/[^/]+$/,
  new NetworkFirst({
    cacheName: 'incidents-detail-cache',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 5 * 60,
      }),
    ],
    networkTimeoutSeconds: 3,
  })
);

// Cache timeline data
registerRoute(
  /\/api\/incidents\/[^/]+\/timeline$/,
  new NetworkFirst({
    cacheName: 'timeline-cache',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60,
      }),
    ],
  })
);

// Cache user/team data (changes less frequently)
registerRoute(
  /\/api\/(users|teams)/,
  new StaleWhileRevalidate({
    cacheName: 'users-teams-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 60, // 30 minutes
      }),
    ],
  })
);

// ============================================================================
// PUSH NOTIFICATION HANDLING
// ============================================================================

// Handle push notification received
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body || 'New incident',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.incidentId || 'incident',
    data: {
      incidentId: data.incidentId,
      url: data.url || `/incidents/${data.incidentId}`,
    },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'acknowledge', title: 'Acknowledge' },
    ],
    vibrate: [200, 100, 200],
    requireInteraction: data.priority === 'CRITICAL' || data.priority === 'HIGH',
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'OnCall Alert', options)
  );
});

// Handle notification click (deep link per user decision)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data as { incidentId?: string; url?: string };
  const url = data?.url || '/incidents';

  // Handle action buttons
  if (event.action === 'acknowledge' && data?.incidentId) {
    // Open incident with action query param
    event.waitUntil(
      self.clients.openWindow(`/incidents/${data.incidentId}?action=acknowledge`)
    );
    return;
  }

  // Default: open incident detail (per user decision: tap goes to detail)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client && 'navigate' in client) {
          (client as WindowClient).focus();
          return (client as WindowClient).navigate(url);
        }
      }
      // Otherwise, open new window
      return self.clients.openWindow(url);
    })
  );
});
