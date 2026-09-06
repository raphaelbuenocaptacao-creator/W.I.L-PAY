import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/lib/neonClient.js', import.meta.url), 'utf8');

assert.match(source, /VITE_WILPAY_NEON_AUTH_URL/);
assert.match(source, /VITE_WILPAY_NEON_DATA_API_URL/);
assert.match(source, /us-east-2/);
assert.match(source, /hostname\.endsWith\('\.neon\.tech'\)/);
assert.doesNotMatch(source, /ep-calm-shape-aux4hut6/);
assert.doesNotMatch(source, /https:\/\/ep-[^'"`\s]+\.neon(auth)?\.[^'"`\s]+/);

console.log('PASS wilpayNeonIsolation');
