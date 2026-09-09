import assert from 'node:assert/strict';
import { createWilpayViewerGrantRequester } from '../src/lib/wilpayViewerGrantClient.js';

async function run() {
  assert.throws(
    () => createWilpayViewerGrantRequester({ endpoint: 'http://example.com/view', getAccessToken: async () => 'token' }),
    /must use HTTPS/
  );

  let seen;
  const productionKey = 'wilpay/production/user_1/documents/file-123';
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
            file_id: 'file-123',
            object_key: productionKey,
            signed_url: 'https://private-storage.example/object?signature=temporary',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            mime_type: 'application/pdf'
          };
        }
      };
    }
  });

  const grant = await request({ file_id: 'file-123', object_key: productionKey, ignored: 'nope' });
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
    object_key: productionKey
  });
  assert.ok(!seen.options.body.includes('session-token'));

  let outOfScopeCalls = 0;
  const failClosed = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    fetchImpl: async () => {
      outOfScopeCalls += 1;
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });

  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: 'other-app/users/user_1/file-123' }),
    /outside W\.I\.L Pay private scope/
  );
  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: 'wilpay/production/user_1/documents/file-999' }),
    /does not match file_id/
  );
  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: 'wilpay/production/user_1/unknown/file-123' }),
    /category is invalid/
  );
  assert.equal(outOfScopeCalls, 0);

  const legacyKey = 'wilpay/users/user_1/loans/loan_1/document/file-123.pdf';
  const legacy = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ signed_url: 'https://private-storage.example/legacy', expires_at: new Date(Date.now() + 60_000).toISOString() })
    })
  });
  await legacy({ file_id: 'file-123', object_key: legacyKey });

  const tampered = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        file_id: 'file-999',
        object_key: productionKey,
        signed_url: 'https://private-storage.example/object',
        expires_at: new Date(Date.now() + 60_000).toISOString()
      })
    })
  });
  await assert.rejects(
    () => tampered({ file_id: 'file-123', object_key: productionKey }),
    /file_id does not match request/
  );

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
    () => denied({ file_id: 'file-123', object_key: productionKey }),
    /Viewer grant request failed \(403\)/
  );

  console.log('wilpayViewerGrantClient PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
