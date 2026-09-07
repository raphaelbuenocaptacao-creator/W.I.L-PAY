import assert from 'node:assert/strict';
import { createWilpayUploadGrantRequester } from '../src/lib/wilpayUploadGrantClient.js';

const calls = [];
const requester = createWilpayUploadGrantRequester({
  endpoint: 'https://api.wilpay.example/private-upload-grant',
  getAccessToken: async () => 'test-access-token',
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async json() { return { method: 'PUT', upload_url: 'https://storage.wilpay.example/object' }; } };
  }
});

const payload = { file_id: 'file-1', object_key: 'users/u1/loans/l1/document/file-1.jpg' };
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

await assert.rejects(
  createWilpayUploadGrantRequester({
    endpoint: 'https://api.wilpay.example/grant',
    getAccessToken: async () => '',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  })({ file_id: 'file-2' }),
  /access token is required/
);

await assert.rejects(
  createWilpayUploadGrantRequester({
    endpoint: 'https://api.wilpay.example/grant',
    getAccessToken: async () => 'token',
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) })
  })({ file_id: 'file-3' }),
  /failed \(403\)/
);

console.log('wilpayUploadGrantClient.test.mjs PASS');
