import assert from 'node:assert/strict';
import { createWilpayViewerGrantRequester } from '../src/lib/wilpayViewerGrantClient.js';

const metadata = Object.freeze({
  file_id: 'file-123',
  object_key: 'wilpay/production/user_1/documents/file-123',
  owner_user_id: 'user_1',
  mime_type: 'application/pdf'
});

let fetchCalls = 0;
let release;
const gate = new Promise(resolve => { release = resolve; });

const request = createWilpayViewerGrantRequester({
  endpoint: 'https://storage.example.test/viewer-grant',
  getAccessToken: async () => 'test-value',
  fetchImpl: async () => {
    fetchCalls += 1;
    await gate;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        request_id: `request-${fetchCalls}`,
        file_id: metadata.file_id,
        object_key: metadata.object_key,
        owner_user_id: metadata.owner_user_id,
        signed_url: 'https://objects.example.test/file',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        mime_type: metadata.mime_type
      })
    };
  }
});

const first = request(metadata);
const second = request({ ...metadata });
for (let i = 0; i < 8 && fetchCalls === 0; i += 1) await Promise.resolve();
assert.equal(fetchCalls, 1, 'same concurrent attachment request must issue one backend call');
release();
const [grantA, grantB] = await Promise.all([first, second]);
assert.deepEqual(grantA, grantB);
assert.equal(fetchCalls, 1);

await request(metadata);
assert.equal(fetchCalls, 2, 'completed grants must not be retained for reuse');

console.log('wilpayViewerGrantCoalescing PASS');
