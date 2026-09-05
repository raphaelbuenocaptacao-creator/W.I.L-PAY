const CACHE_PREFIX = 'wil-pay-shell-';
const CACHE = `${CACHE_PREFIX}v31-wallet-docs-location`;
const OFFLINE = './index.html';
const APP_SHELL = [
  OFFLINE,
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];
const PRIVATE_PATH = /\/(api|auth|login|logout|admin|session|token|account|profile|user|me)(\/|$)/i;
const PRIVATE_KEYS = new Set(['token','access_token','refresh_token','password','passwd','secret','session','auth','authorization','api_key','apikey','code','credential','credentials']);

function hasSensitiveQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (PRIVATE_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

function isPrivate(request, url) {
  return request.headers.has('authorization') ||
    request.headers.has('cookie') ||
    request.headers.has('range') ||
    request.headers.has('if-range') ||
    PRIVATE_PATH.test(url.pathname) ||
    hasSensitiveQuery(url);
}

function isCacheableResponse(response) {
  if (!response || !response.ok || response.status === 206 || response.type === 'opaque' || response.redirected) return false;
  const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
  if (cacheControl.includes('private') || cacheControl.includes('no-store')) return false;
  if (response.headers.has('set-cookie') || response.headers.has('content-range')) return false;
  return true;
}

async function precacheShell() {
  const cache = await caches.open(CACHE);
  await Promise.all(APP_SHELL.map(async asset => {
    try {
      const response = await fetch(asset, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (isCacheableResponse(response)) await cache.put(asset, response.clone());
    } catch (error) {
      console.warn('W.I.L Pay precache skipped:', asset, error);
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' }).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.search) return;
  const relativePath = `.${url.pathname.replace('/W.I.L-PAY', '')}`;
  if (!APP_SHELL.includes(relativePath)) return;

  event.respondWith(
    caches.match(request).then(async hit => {
      if (hit) return hit;
      const response = await fetch(request, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (!isCacheableResponse(response)) return response;
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
      return response;
    })
  );
});
