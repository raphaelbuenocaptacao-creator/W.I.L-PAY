import assert from 'node:assert/strict';
import { createWilpayUploadGrantServerRuntime } from '../src/lib/wilpayUploadGrantServerRuntime.js';

const nowMs = Date.parse('2026-09-12T09:30:00Z');
const payload = {
  request_id: 'req_runtime_001',
  upload_id: '123e4567-e89b-42d3-a456-426614174000',
  owner_user_id: 'user_123',
  file_id: 'file_456',
  loan_id: 'loan_789',
  document_type: 'document',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_123/documents/file_456',
  content_type: 'application/pdf',
  size_bytes: 1024,
  checksum_sha256: 'c'.repeat(64)
};

const calls = [];
const runtime = createWilpayUploadGrantServerRuntime({
  query: async (sql, params) => {
    calls.push(['issue', sql, params]);
    return { rows: [{ issued: true }] };
  },
  consumeGrantNonce: async (nonce) => {
    calls.push(['consume', nonce]);
    return true;
  },
  signPrivateUpload: async (authorized) => {
    calls.push(['sign', authorized]);
    return {
      request_id: authorized.request_id,
      upload_id: authorized.upload_id,
      bucket: authorized.bucket,
      object_key: authorized.object_key,
      content_type: authorized.content_type,
      checksum_sha256: authorized.checksum_sha256,
      method: 'PUT',
      upload_url: 'https://storage.example.invalid/upload/opaque',
      expires_at: new Date(nowMs + 5 * 60 * 1000).toISOString()
    };
  },
  now: () => nowMs
});

const grant = await runtime(payload, { authenticatedUserId: 'user_123' });
assert.deepEqual(calls.map(([name]) => name), ['issue', 'consume', 'sign']);
assert.equal(grant.upload_id, payload.upload_id);
assert.equal(grant.object_key, payload.object_key);
assert.equal('secret' in grant, false);
assert.match(calls[0][1], /wilpay_issue_upload_grant_nonce/i);
assert.equal(calls[0][2][1], payload.upload_id);

await assert.rejects(
  async () => createWilpayUploadGrantServerRuntime({
    consumeGrantNonce: async () => true,
    signPrivateUpload: async () => ({})
  }),
  /database query function is required/i
);

let consumed = 0;
let signed = 0;
const failClosed = createWilpayUploadGrantServerRuntime({
  query: async () => ({ rows: [{ issued: false }] }),
  consumeGrantNonce: async () => {
    consumed += 1;
    return true;
  },
  signPrivateUpload: async () => {
    signed += 1;
    return {};
  },
  now: () => nowMs
});

await assert.rejects(
  failClosed(payload, { authenticatedUserId: 'user_123' }),
  /nonce could not be persisted/i
);
assert.equal(consumed, 0, 'nonce consumer must not run when persistence fails');
assert.equal(signed, 0, 'storage signer must not run when persistence fails');

console.log('PASS wilpayUploadGrantServerRuntime');
