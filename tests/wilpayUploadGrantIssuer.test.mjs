import assert from 'node:assert/strict';
import { issueWilpaySignedUploadGrant } from '../src/lib/wilpayUploadGrantIssuer.js';

const nowMs = Date.parse('2026-09-10T10:00:00Z');
const payload = {
  request_id: 'req_issue_001',
  owner_user_id: 'user_123',
  file_id: 'file_456',
  loan_id: 'loan_789',
  document_type: 'document',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_123/documents/file_456',
  content_type: 'application/pdf',
  size_bytes: 1024,
  checksum_sha256: 'b'.repeat(64)
};

let order = [];
const grant = await issueWilpaySignedUploadGrant(payload, {
  authenticatedUserId: 'user_123',
  consumeGrantNonce: async () => {
    order.push('consume');
    return true;
  },
  signPrivateUpload: async (authorized) => {
    order.push('sign');
    return {
      request_id: authorized.request_id,
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

assert.deepEqual(order, ['consume', 'sign']);
assert.equal(grant.request_id, payload.request_id);
assert.equal(grant.object_key, payload.object_key);
assert.equal('secret' in grant, false);

let signCalls = 0;
await assert.rejects(
  issueWilpaySignedUploadGrant(payload, {
    authenticatedUserId: 'user_123',
    consumeGrantNonce: async () => false,
    signPrivateUpload: async () => {
      signCalls += 1;
      return {};
    },
    now: () => nowMs
  }),
  /invalid, expired, or already consumed/i
);
assert.equal(signCalls, 0, 'signer must never run when nonce authorization fails');

await assert.rejects(
  issueWilpaySignedUploadGrant(payload, {
    authenticatedUserId: 'user_123',
    consumeGrantNonce: async () => true,
    signPrivateUpload: async (authorized) => ({
      request_id: authorized.request_id,
      bucket: authorized.bucket,
      object_key: 'wilpay/production/user_123/documents/tampered',
      content_type: authorized.content_type,
      checksum_sha256: authorized.checksum_sha256,
      method: 'PUT',
      upload_url: 'https://storage.example.invalid/upload/opaque',
      expires_at: new Date(nowMs + 5 * 60 * 1000).toISOString()
    }),
    now: () => nowMs
  }),
  /object_key mismatch/i
);

await assert.rejects(
  issueWilpaySignedUploadGrant(payload, {
    authenticatedUserId: 'user_123',
    consumeGrantNonce: async () => true,
    signPrivateUpload: async (authorized) => ({
      request_id: authorized.request_id,
      bucket: authorized.bucket,
      object_key: authorized.object_key,
      content_type: authorized.content_type,
      checksum_sha256: authorized.checksum_sha256,
      method: 'PUT',
      upload_url: 'https://storage.example.invalid/upload/opaque',
      expires_at: new Date(nowMs + 11 * 60 * 1000).toISOString()
    }),
    now: () => nowMs
  }),
  /expiry is not allowed/i
);

console.log('PASS wilpayUploadGrantIssuer');
