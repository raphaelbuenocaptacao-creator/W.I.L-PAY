import assert from 'node:assert/strict';
import { createWilpayUploadGrantRequester } from '../src/lib/wilpayUploadGrantClient.js';

const checksum = 'a'.repeat(64);
const payload = {
  file_id: 'file-1',
  owner_user_id: 'u1',
  loan_id: 'l1',
  document_type: 'document',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/u1/documents/file-1',
  content_type: 'application/pdf',
  size_bytes: 1024,
  checksum_sha256: checksum
};

const calls = [];
const requester = createWilpayUploadGrantRequester({
  endpoint: 'https://api.wilpay.example/private-upload-grant',
  getAccessToken: async () => 'test-access-token',
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async json() { return { method: 'PUT', upload_url: 'https://storage.wilpay.example/object' }; } };
  }
});

const grant = await requester(payload);
assert.equal(grant.method, 'PUT');
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://api.wilpay.example/private-upload-grant');
assert.equal(calls[0].options.method, 'POST');
assert.equal(calls[0].options.credentials, 'omit');
assert.equal(calls[0].options.cache, 'no-store');
assert.equal(calls[0].options.redirect, 'error');
assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
assert.equal(calls[0].options.headers.Authorization, 'Bearer test-access-token');
assert.equal(calls[0].options.body, JSON.stringify(payload));

assert.throws(
  () => createWilpayUploadGrantRequester({ endpoint: 'http://api.wilpay.example/grant', getAccessToken: async () => 'x', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
  /must use HTTPS/
);

let blockedFetches = 0;
const failClosedRequester = createWilpayUploadGrantRequester({
  endpoint: 'https://api.wilpay.example/grant',
  getAccessToken: async () => 'token',
  fetchImpl: async () => {
    blockedFetches += 1;
    return { ok: true, json: async () => ({}) };
  }
});

await assert.rejects(
  failClosedRequester({ ...payload, object_key: 'wilpay/users/u1/loans/l1/document/file-1.pdf' }),
  /object_key does not match owner\/category\/file scope/
);
await assert.rejects(
  failClosedRequester({ ...payload, object_key: 'wilpay/production/other/documents/file-1' }),
  /object_key does not match owner\/category\/file scope/
);
await assert.rejects(
  failClosedRequester({ ...payload, document_type: 'unknown' }),
  /Invalid document_type/
);
assert.equal(blockedFetches, 0, 'invalid scope must be rejected before contacting the grant backend');

await assert.rejects(
  createWilpayUploadGrantRequester({
    endpoint: 'https://api.wilpay.example/grant',
    getAccessToken: async () => '',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  })(payload),
  /access token is required/
);

await assert.rejects(
  createWilpayUploadGrantRequester({
    endpoint: 'https://api.wilpay.example/grant',
    getAccessToken: async () => 'token',
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) })
  })(payload),
  /failed \(403\)/
);

console.log('wilpayUploadGrantClient.test.mjs PASS');
