import assert from 'node:assert/strict';
import { authorizeWilpayUploadGrant } from '../src/lib/wilpayUploadGrantAuthorization.js';

const MiB = 1024 * 1024;
const payload = {
  request_id: 'req_authz_001',
  owner_user_id: 'user_123',
  file_id: 'file_456',
  loan_id: 'loan_789',
  document_type: 'guarantee',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_123/guarantees/file_456',
  content_type: 'image/jpeg',
  size_bytes: 20 * MiB,
  checksum_sha256: 'a'.repeat(64)
};

let calls = 0;
let received;
const authorized = await authorizeWilpayUploadGrant(payload, {
  authenticatedUserId: 'user_123',
  consumeGrantNonce: async (scope) => {
    calls += 1;
    received = scope;
    return true;
  }
});

assert.equal(calls, 1);
assert.deepEqual(received, {
  request_id: payload.request_id,
  owner_user_id: payload.owner_user_id,
  file_id: payload.file_id,
  object_key: payload.object_key
});
assert.equal(authorized.object_key, payload.object_key);
assert.equal(authorized.size_bytes, 20 * MiB);

await assert.rejects(
  authorizeWilpayUploadGrant(payload, {
    authenticatedUserId: 'user_123',
    consumeGrantNonce: async () => false
  }),
  /invalid, expired, or already consumed/i
);

await assert.rejects(
  authorizeWilpayUploadGrant(payload, { authenticatedUserId: 'user_123' }),
  /nonce consumer is required/i
);

let unauthorizedConsumeCalls = 0;
await assert.rejects(
  authorizeWilpayUploadGrant(payload, {
    authenticatedUserId: 'another_user',
    consumeGrantNonce: async () => {
      unauthorizedConsumeCalls += 1;
      return true;
    }
  }),
  /owner does not match authenticated user/i
);
assert.equal(unauthorizedConsumeCalls, 0, 'invalid ownership must fail before nonce consumption');

console.log('PASS wilpayUploadGrantAuthorization');
