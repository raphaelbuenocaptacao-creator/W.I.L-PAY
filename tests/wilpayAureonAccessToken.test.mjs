import assert from 'node:assert/strict';
import { getWilpayAureonAccessToken } from '../src/lib/wilpayAureonAccessToken.js';

const storage = value => ({ getItem: key => key === 'wilpay_aureon_access' ? value : null });

const token = await getWilpayAureonAccessToken({
  auth: { getSession: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  storage: storage('session-token')
});
assert.equal(token, 'session-token');

await assert.rejects(
  () => getWilpayAureonAccessToken({
    auth: { getSession: async () => ({ data: { user: null }, error: null }) },
    storage: storage('session-token')
  }),
  /authenticated session is required/
);

await assert.rejects(
  () => getWilpayAureonAccessToken({
    auth: { getSession: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    storage: storage('')
  }),
  /access token is unavailable/
);

const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/lib/wilpayAureonAccessToken.js', import.meta.url), 'utf8'));
assert.doesNotMatch(source, /console\.(log|debug|info|warn|error)\s*\(/i);
assert.doesNotMatch(source, /service_role|secret|password/i);

console.log('wilpay Aureon access token provider: PASS');
