import assert from 'node:assert/strict';
import * as issuerModule from '../src/lib/wilpayUploadGrantIssuer.js';

assert.equal(
  typeof issuerModule.issueWilpayPersistedSignedUploadGrant,
  'function',
  'secure grant runtime must exist before backend integration'
);

const nowMs = Date.parse('2026-09-12T07:30:00Z');
const payload = {
  request_id: 'req_issue_nonce_001',
  upload_id: '123e4567-e89b-42d3-a456-426614174000',
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

const order = [];
const grant = await issuerModule.issueWilpayPersistedSignedUploadGrant(payload, {
  authenticatedUserId: 'user_123',
  issueGrantNonce: async (nonce) => {
    order.push('issue');
    assert.equal(nonce.request_id, payload.request_id);
    assert.equal(nonce.upload_id, payload.upload_id);
    assert.equal(nonce.owner_user_id, payload.owner_user_id);
    assert.equal(nonce.file_id, payload.file_id);
    assert.equal(nonce.object_key, payload.object_key);
    assert.equal(nonce.expires_at, new Date(nowMs + 10 * 60 * 1000).toISOString());
    return true;
  },
  consumeGrantNonce: async () => {
    order.push('consume');
    return true;
  },
  signPrivateUpload: async (authorized) => {
    order.push('sign');
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

assert.deepEqual(order, ['issue', 'consume', 'sign']);
assert.equal(grant.upload_id, payload.upload_id);

let consumeCalls = 0;
let signCalls = 0;
await assert.rejects(
  issuerModule.issueWilpayPersistedSignedUploadGrant(payload, {
    authenticatedUserId: 'user_123',
    issueGrantNonce: async () => false,
    consumeGrantNonce: async () => {
      consumeCalls += 1;
      return true;
    },
    signPrivateUpload: async () => {
      signCalls += 1;
      return {};
    },
    now: () => nowMs
  }),
  /could not be persisted/i
);
assert.equal(consumeCalls, 0, 'nonce consumption must not run when issuance persistence fails');
assert.equal(signCalls, 0, 'signer must not run when nonce issuance persistence fails');

console.log('PASS wilpayUploadGrantNonceIssuanceRuntime');
