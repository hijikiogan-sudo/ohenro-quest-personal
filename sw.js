const BASE=new URL('./',self.location.href);
const PREFIX='ohenro-personal:'+BASE.pathname+':';
const CACHE=PREFIX+'v8';
const FILES=['./','./index.html','./style.css','./display.css','./memories.css','./quest-map.css','./quest-map.mjs','./photo-store.mjs','./today.css','./today-store.mjs','./today-ui.mjs','./prayer.css','./prayer.mjs','./mantras.mjs','./sutra-text.mjs','./plan.css','./plan-domain.mjs','./plan-store.mjs','./plan-ui.mjs','./album.css','./album-view.mjs','./photo-archive.mjs','./photo-ui.mjs','./photo-image.mjs','./photo-zip.mjs','./temple-marker.mjs','./display.mjs','./road-map.mjs','./vendor/leaflet/leaflet.js','./vendor/leaflet/leaflet.css','./vendor/leaflet/images/layers.png','./vendor/leaflet/images/layers-2x.png','./vendor/leaflet/images/marker-icon.png','./vendor/leaflet/images/marker-icon-2x.png','./vendor/leaflet/images/marker-shadow.png','./app.mjs','./personal-store.mjs','./domain.mjs','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./data/temples.json','./data/japan-coast.geojson','./data/provenance.json'];
const PATHS=new Set(FILES.map(p=>new URL(p,BASE).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(p=>new URL(p,BASE).href))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==BASE.origin||!PATHS.has(url.pathname))return;
  // 公開する画面・札所データだけをキャッシュする。訪問記録はIndexedDBに保存する。
  event.respondWith(fetch(event.request).then(res=>{
    if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}
    return res;
  }).catch(async()=>{
    const cache=await caches.open(CACHE);
    return await cache.match(event.request)||await cache.match(new URL(url.pathname,BASE).href)||(event.request.mode==='navigate'?await cache.match(BASE.href):null)||Response.error();
  }));
});
