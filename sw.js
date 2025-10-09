const CACHE_NAME = 'inventory-pwa-v3';
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'firebase.js',
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
  if(req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached=> cached || fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c=> c.put(req, copy));
      return res;
    }).catch(()=> caches.match('index.html')))
  );
});


