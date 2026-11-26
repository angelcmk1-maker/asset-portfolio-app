/* 오프라인 대비: 앱 화면 파일을 저장해 두고, 인터넷이 되면 항상 서버의 새 버전을 받는다(네트워크 우선, 브라우저 HTTP 캐시 무시). */
const CACHE = 'pf-shell-v2';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return; // API 호출 등 외부 요청은 건드리지 않음
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
