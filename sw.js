const CACHE_NAME = 'inventory-pwa-v3';
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(c=> c.addAll(ASSETS)).then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  
  // تجاهل الطلبات غير GET
  if(req.method !== 'GET') return;
  
  // تجاهل بعض المصادر التي لا يمكن تخزينها
  if (req.url.startsWith('chrome-extension://') || 
      req.url.includes('extension') || 
      req.url.includes('chrome')) {
    return;
  }

  e.respondWith(
    caches.match(req).then(cached=> {
      // إذا وجد في الـ Cache، استخدمه
      if (cached) return cached;

      // إذا لم يوجد، حاول جلبه من الشبكة
      return fetch(req).then(res=> {
        // تجاهل الاستجابات غير الناجحة
        if(!res || res.status !== 200) {
          return res;
        }

        try {
          // نسخ الاستجابة وتخزينها في الـ Cache
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache=> {
            // تأكد من أن URL صالح للتخزين
            if (req.url.startsWith('http')) {
              cache.put(req, copy);
            }
          });
          return res;
        } catch (error) {
          console.warn('⚠️ فشل تخزين الاستجابة في Cache:', error);
          return res;
        }
      }).catch(error=> {
        console.warn('⚠️ فشل جلب المصدر:', error);
        // إرجاع الصفحة الرئيسية في حالة الفشل
        return caches.match('index.html');
      });
    })
  );
});


