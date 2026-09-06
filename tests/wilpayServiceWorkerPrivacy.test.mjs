import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

const requiredFragments = [
  "request.headers.has('authorization')",
  "request.headers.has('cookie')",
  "request.headers.has('range')",
  "request.headers.has('if-range')",
  "cacheControl.includes('private')",
  "cacheControl.includes('no-store')",
  "response.headers.has('set-cookie')",
  "response.headers.has('content-range')",
  "token === 'cookie' || token === 'authorization'",
  "credentials: 'omit'",
  "redirect: 'error'"
];

for (const fragment of requiredFragments) {
  assert.ok(sw.includes(fragment), `Service Worker privacy regression: missing ${fragment}`);
}

assert.match(sw, /if \(isPrivate\(request, url\)\) return;/, 'Private requests must bypass the cache path');
assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/, 'Cross-origin requests must bypass the cache path');
assert.match(sw, /if \(url\.search\) return;/, 'Requests with query strings must not enter the app-shell cache');
assert.match(sw, /keys\.filter\(key => key\.startsWith\(CACHE_PREFIX\) && key !== CACHE\)/, 'Old W.I.L Pay caches must be purged on activation');

console.log('wilpayServiceWorkerPrivacy: PASS');
