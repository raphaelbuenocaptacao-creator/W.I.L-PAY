import assert from 'node:assert/strict';
import { createWilpayViewerGrantRequester } from '../src/lib/wilpayViewerGrantClient.js';

async function run() {
  assert.throws(
    () => createWilpayViewerGrantRequester({ endpoint: 'http://example.com/view', getAccessToken: async () => 'token' }),
    /must use HTTPS/
  );

  let seen;
  const request = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            signed_url: 'https://private-storage.example/object?signature=temporary',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            mime_type: 'application/pdf'
          };
        }
      };
    }
  });

  const grant = await request({ file_id: 'file-123', object_key: 'clients/user/loan/document.pdf', ignored: 'nope' });
  assert.equal(grant.mime_type, 'application/pdf');
  assert.equal(seen.url, 'https://storage.wilpay.example/viewer-grant');
  assert.equal(seen.options.method, 'POST');
  assert.equal(seen.options.cache, 'no-store');
  assert.equal(seen.options.redirect, 'error');
  assert.equal(seen.options.credentials, 'omit');
  assert.equal(seen.options.referrerPolicy, 'no-referrer');
  assert.equal(seen.options.headers.Authorization, 'Bearer session-token');
  assert.deepEqual(JSON.parse(seen.options.body), {
    file_id: 'file-123',
    object_key: 'clients/user/loan/document.pdf'
  });
  assert.ok(!seen.options.body.includes('session-token'));

  await assert.rejects(
    () => request({ file_id: '', object_key: 'x' }),
    /file_id is required/
  );

  const denied = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) })
  });
  await assert.rejects(
    () => denied({ file_id: 'file-123', object_key: 'clients/user/loan/document.pdf' }),
    /Viewer grant request failed \(403\)/
  );

  console.log('wilpayViewerGrantClient PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
