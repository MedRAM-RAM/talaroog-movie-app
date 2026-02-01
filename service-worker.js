// Service Worker لدعم PWA
const CACHE_NAME = 'talaroog-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './images/icon-192x192.png',
  './images/icon-512x512.png'
];

// تثبيت Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// تنشيط Service Worker وحذف ذاكرة التخزين المؤقت القديمة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية الشبكة أولاً، ثم ذاكرة التخزين المؤقت
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // تجاهل طلبات API والطلبات الخارجية
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) {
    return;
  }

  // معالجة طلبات المشاركة (Share Target)
  // بما أننا نستخدم GET، سيقوم المتصفح بتحميل index.html مع الباراميترات
  // السكريبت الرئيسي (script.js) سيتولى قراءة هذه الباراميترات
  if (event.request.method === 'GET' && (url.searchParams.has('title') || url.searchParams.has('text') || url.searchParams.has('url'))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      }))
  );
});
