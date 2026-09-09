import assert from 'node:assert/strict';
import { createWilpayViewerGrantRequester } from '../src/lib/wilpayViewerGrantClient.js';

async function run() {
  assert.throws(
    () => createWilpayViewerGrantRequester({ endpoint: 'http://example.com/view', getAccessToken: async () => 'token' }),
    /must use HTTPS/
  );

  let seen;
  const audit = [];
  const productionKey = 'wilpay/production/user_1/documents/file-123';
  const productionMetadata = Object.freeze({
    file_id: 'file-123',
    object_key: productionKey,
    owner_user_id: 'user_1',
    mime_type: 'application/pdf'
  });
  const request = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_1',
    onAudit: event => audit.push(event),
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            file_id: 'file-123',
            object_key: productionKey,
            owner_user_id: 'user_1',
            request_id: 'req_1',
            signed_url: 'https://private-storage.example/object?signature=temporary',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            mime_type: 'application/pdf'
          };
        }
      };
    }
  });

  const grant = await request({ ...productionMetadata, ignored: 'nope' });
  assert.equal(grant.mime_type, 'application/pdf');
  assert.equal(seen.url, 'https://storage.wilpay.example/viewer-grant');
  assert.equal(seen.options.method, 'POST');
  assert.equal(seen.options.cache, 'no-store');
  assert.equal(seen.options.redirect, 'error');
  assert.equal(seen.options.credentials, 'omit');
  assert.equal(seen.options.referrerPolicy, 'no-referrer');
  assert.equal(seen.options.headers.Authorization, 'Bearer session-token');
  assert.equal(seen.options.headers['X-WILPay-Request-ID'], 'req_1');
  assert.deepEqual(JSON.parse(seen.options.body), {
    file_id: 'file-123',
    object_key: productionKey,
    owner_user_id: 'user_1',
    mime_type: 'application/pdf',
    request_id: 'req_1'
  });
  assert.ok(!seen.options.body.includes('session-token'));

  assert.deepEqual(audit, [
    {
      event: 'wilpay.storage.viewer_grant',
      phase: 'request',
      outcome: 'accepted',
      namespace: 'production',
      category: 'documents'
    },
    {
      event: 'wilpay.storage.viewer_grant',
      phase: 'response',
      outcome: 'issued',
      namespace: 'production',
      category: 'documents'
    }
  ]);
  const serializedAudit = JSON.stringify(audit);
  for (const sensitive of [
    'session-token',
    'req_1',
    'request_id',
    'user_1',
    'file-123',
    productionKey,
    'private-storage.example',
    'signature=temporary',
    'signed_url',
    'object_key',
    'owner_user_id',
    'auth_uid',
    'file_id'
  ]) {
    assert.equal(serializedAudit.includes(sensitive), false, `audit leaked ${sensitive}`);
  }

  let outOfScopeCalls = 0;
  const failClosed = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_failclosed',
    fetchImpl: async () => {
      outOfScopeCalls += 1;
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });

  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: 'other-app/users/user_1/file-123', owner_user_id: 'user_1', mime_type: 'application/pdf' }),
    /outside W\.I\.L Pay private scope/
  );
  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: 'wilpay/production/user_1/documents/file-999', owner_user_id: 'user_1', mime_type: 'application/pdf' }),
    /does not match file_id/
  );
  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: 'wilpay/production/user_1/unknown/file-123', owner_user_id: 'user_1', mime_type: 'application/pdf' }),
    /category is invalid/
  );
  await assert.rejects(
    () => failClosed({ ...productionMetadata, owner_user_id: 'user_2' }),
    /owner does not match attachment owner/
  );
  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: productionKey, mime_type: 'application/pdf' }),
    /owner_user_id is required/
  );
  await assert.rejects(
    () => failClosed({ file_id: 'file-123', object_key: productionKey, owner_user_id: 'user_1' }),
    /attachment mime_type is required/
  );
  await assert.rejects(
    () => failClosed({ ...productionMetadata, mime_type: 'text/html' }),
    /attachment mime_type is not allowed/
  );
  assert.equal(outOfScopeCalls, 0);

  const legacyKey = 'wilpay/users/user_1/loans/loan_1/document/file-123.pdf';
  let legacyBody;
  const legacy = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_legacy',
    fetchImpl: async (_url, options) => {
      legacyBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ signed_url: 'https://private-storage.example/legacy', expires_at: new Date(Date.now() + 60_000).toISOString() })
      };
    }
  });
  await legacy({ file_id: 'file-123', object_key: legacyKey, owner_user_id: 'user_1' });
  assert.deepEqual(legacyBody, {
    file_id: 'file-123',
    object_key: legacyKey,
    owner_user_id: 'user_1',
    request_id: 'req_legacy'
  });

  const tampered = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_tampered',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        file_id: 'file-999',
        object_key: productionKey,
        owner_user_id: 'user_1',
        signed_url: 'https://private-storage.example/object',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        mime_type: 'application/pdf'
      })
    })
  });
  await assert.rejects(
    () => tampered(productionMetadata),
    /file_id does not match request/
  );

  const tamperedOwner = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_owner',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        file_id: 'file-123',
        object_key: productionKey,
        owner_user_id: 'user_2',
        signed_url: 'https://private-storage.example/object',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        mime_type: 'application/pdf'
      })
    })
  });
  await assert.rejects(
    () => tamperedOwner(productionMetadata),
    /owner_user_id does not match request/
  );

  const tamperedRequestId = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_expected',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: 'req_other',
        signed_url: 'https://private-storage.example/object',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        mime_type: 'application/pdf'
      })
    })
  });
  await assert.rejects(
    () => tamperedRequestId(productionMetadata),
    /request_id does not match request/
  );

  await assert.rejects(
    () => request({ file_id: '', object_key: 'x', owner_user_id: 'user_1', mime_type: 'application/pdf' }),
    /file_id is required/
  );

  const deniedAudit = [];
  const denied = createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_denied',
    onAudit: event => deniedAudit.push(event),
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) })
  });
  await assert.rejects(
    () => denied(productionMetadata),
    /Viewer grant request failed \(403\)/
  );
  assert.equal(deniedAudit.at(-1)?.outcome, 'rejected');
  assert.equal(deniedAudit.at(-1)?.http_status, 403);
  assert.equal(JSON.stringify(deniedAudit).includes('session-token'), false);
  assert.equal(JSON.stringify(deniedAudit).includes(productionKey), false);
  assert.equal(JSON.stringify(deniedAudit).includes('req_denied'), false);

  const requesterForGrant = (grantBody) => createWilpayViewerGrantRequester({
    endpoint: 'https://storage.wilpay.example/viewer-grant',
    getAccessToken: async () => 'session-token',
    createRequestId: () => 'req_generic',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => grantBody })
  });

  await assert.rejects(
    () => requesterForGrant({
      signed_url: 'http://private-storage.example/object',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      mime_type: 'application/pdf'
    })(productionMetadata),
    /signed URL must use HTTPS/
  );

  await assert.rejects(
    () => requesterForGrant({
      signed_url: 'https://private-storage.example/object',
      expires_at: new Date(Date.now() - 1_000).toISOString(),
      mime_type: 'application/pdf'
    })(productionMetadata),
    /expired or has invalid expires_at/
  );

  await assert.rejects(
    () => requesterForGrant({
      signed_url: 'https://private-storage.example/object',
      expires_at: new Date(Date.now() + 6 * 60_000).toISOString(),
      mime_type: 'application/pdf'
    })(productionMetadata),
    /lifetime exceeds policy/
  );

  await assert.rejects(
    () => requesterForGrant({
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      mime_type: 'application/pdf'
    })(productionMetadata),
    /signed URL/
  );

  await assert.rejects(
    () => requesterForGrant({
      signed_url: 'https://private-storage.example/object',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      mime_type: 'image/png'
    })(productionMetadata),
    /mime_type does not match attachment metadata/
  );

  await assert.rejects(
    () => requesterForGrant({
      signed_url: 'https://private-storage.example/object',
      expires_at: new Date(Date.now() + 60_000).toISOString()
    })(productionMetadata),
    /Viewer grant mime_type is required/
  );

  console.log('wilpayViewerGrantClient PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
