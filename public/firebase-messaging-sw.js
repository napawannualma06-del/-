importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// To receive background messages, we need to initialize firebase in the service worker
// The config must match the one in firebase-applet-config.json
// But since we can't easily import json here without a bundler, we will fetch it or hardcode.
// For the AI Studio environment, the config is injected. We can fetch it from the same path if served, 
// but it's not served by default. We'll use a placeholder and notify the user about manual setup if needed.

firebase.initializeApp({
  apiKey: "API_KEY",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'มีเคสใหม่!';
  const notificationOptions = {
    body: payload.notification?.body || 'มีเคสใหม่เข้ามาในระบบ',
    icon: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
