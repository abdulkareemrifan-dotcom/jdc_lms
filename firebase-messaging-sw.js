// ══════════════════════════════════════════════════════════════════
// JDC-LMS — Firebase Cloud Messaging Service Worker
// ══════════════════════════════════════════════════════════════════
// IMPORTANT: this file must be deployed as its OWN static file at the
// SITE ROOT — e.g. https://yourdomain.com/firebase-messaging-sw.js —
// in the same directory as index.html. It cannot live in a subfolder,
// because a service worker's scope is limited to the folder it's
// served from and everything below it; index.html registers it with
// navigator.serviceWorker.register('/firebase-messaging-sw.js'), which
// requires it to be reachable at exactly that root-level path.
//
// This worker is responsible ONLY for background push (the app/tab is
// closed, backgrounded, or the phone is locked). Foreground (app open)
// notifications are handled inside index.html itself via Firestore
// real-time sync, so nothing here needs to duplicate that.
//
// See PUSH_NOTIFICATIONS_SETUP.md for the full deployment checklist.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Force the SW to activate immediately rather than waiting for all
// existing tabs to close — this is what allows FCM's getToken() to
// find an "active" SW on first load, even if a previous SW version
// was already registered (e.g. the old blob-based one).
self.addEventListener('install', function(e){ e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

// Keep this identical to the firebaseConfig object inside index.html.
firebase.initializeApp({
  apiKey: "AIzaSyBiOPwNCQ1uDCENaevuusTQ_S3iwDfjan0",
  authDomain: "student-portal-2b672.firebaseapp.com",
  projectId: "student-portal-2b672",
  storageBucket: "student-portal-2b672.firebasestorage.app",
  messagingSenderId: "521803667061",
  appId: "1:521803667061:web:7d256be9fa2bb221bc0a3c"
});

var messaging = firebase.messaging();

// JDC logo as an inline SVG data URI (same icon used elsewhere in the app)
// so no separate icon file needs to be hosted.
var JDC_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="%23095996"/><text x="96" y="130" font-family="Arial" font-size="72" font-weight="bold" fill="white" text-anchor="middle">JDC</text></svg>';

messaging.onBackgroundMessage(function (payload) {
  var data = payload.data || {};
  var notification = payload.notification || {};
  var title = notification.title || data.title || 'JDC-LMS';
  var body = notification.body || data.body || '';

  var options = {
    body: body,
    icon: JDC_ICON,
    badge: JDC_ICON,
    tag: data.category || 'jdc-lms',
    // Re-showing the same tag replaces rather than stacks duplicate alerts.
    renotify: true,
    requireInteraction: false,
    data: {
      page: data.page || 'dashboard',
      notifId: data.notifId || ''
    }
  };

  return self.registration.showNotification(title, options);
});

// Tapping a notification focuses an already-open tab (and tells it which
// page to navigate to via postMessage) or opens a new one if none exists.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var page = (event.notification.data && event.notification.data.page) || 'dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) {
          c.postMessage({ type: 'NAVIGATE', page: page });
          return c.focus();
        }
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});
