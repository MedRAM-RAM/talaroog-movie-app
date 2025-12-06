// Service Worker لدعم PWA
const CACHE_NAME = 'talaroog-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

// تثبيت Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('تم فتح ذاكرة التخزين المؤقت');
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
  // تجاهل طلبات API
  if (event.request.url.includes('/api/') || event.request.url.includes('yts.lt')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // نسخ الاستجابة
        const responseClone = response.clone();
        
        // فتح ذاكرة التخزين المؤقت وتخزين الاستجابة
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseClone);
          });
          
        return response;
      })
      .catch(() => {
        // إذا فشل الطلب، استخدم ذاكرة التخزين المؤقت
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
            
            // إذا كان الطلب لصفحة HTML، قم بإرجاع الصفحة الرئيسية
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// معالجة مشاركة الروابط من التطبيقات الأخرى
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // التحقق مما إذا كان الطلب من مشاركة
  if (url.searchParams.has('text') || url.searchParams.has('url') || url.searchParams.has('title')) {
    // إرسال رسالة إلى التطبيق بالرابط المشارك
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SHARE_TARGET_URL',
          url: url.searchParams.get('text') || url.searchParams.get('url') || url.searchParams.get('title')
        });
      });
    });
  }
});
