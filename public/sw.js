const CACHE = 'wil-pay-shell-v23-safe';
const OFFLINE = './index.html';
const APP_SHELL = [
  OFFLINE,
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-512-maskable.svg'
];
const PRIVATE_PATH = /\/(api|auth|login|logout|admin|session|token|account|profile|user|me)(\/|$)/i;
const PRIVATE_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'password',
  'passwd',
  'secret',
  'session',
  'auth',
  'authorization',
  'api_key',
  'apikey',
  'code',
  'credential',
  'credentials'
]);

function hasSensitiveQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (PRIVATE_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

function isPrivate(request, url) {
  return request.headers.has('authorization') ||
    request.headers.has('cookie') ||
    PRIVATE_PATH.test(url.pathname) ||
    hasSensitiveQuery(url);
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
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
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match(OFFLINE))
    );
    return;
  }

  // Cache only immutable app-shell URLs without query strings. This prevents
  // accidental caching of signed URLs, cache-busting tokens, or private data.
  if (url.search) return;

  const relativePath = `.${url.pathname.replace('/W.I.L-PAY', '')}`;
  if (!APP_SHELL.includes(relativePath)) return;

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request, { cache: 'no-store' }))
  );
});
