/* 오프라인 캐시 — 앱으로 설치했을 때 인터넷 없이도 열리게 한다.
 *
 *  화면(HTML)은 네트워크를 먼저 본다: 새로 배포한 내용이 바로 보여야 하기 때문이다.
 *  나머지 파일은 캐시를 먼저 내주고 뒤에서 조용히 갱신한다: three.js 처럼
 *  큰 파일을 매번 받아오면 느려지기만 한다.
 */
const CACHE = 'officelight-v1';

const ASSETS = [
  './', 'index.html', 'mobile.html',
  'app.js', 'mobile.js', 'install.js', 'data.js', 'figures.js', 'people.js',
  'lib/three.min.js', 'lib/OrbitControls.js',
  'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'setup.js',
];

self.addEventListener('install', e => {
  // 한 파일이 없다고 설치 전체를 실패시키지 않는다.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 바깥 주소(방문 집계 등)는 손대지 않고 그대로 통과시킨다.
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
