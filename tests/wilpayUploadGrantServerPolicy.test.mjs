import assert from 'node:assert/strict';
import { assertWilpayUploadGrantServerPolicy } from '../src/lib/wilpayUploadGrantServerPolicy.js';
import { WILPAY_STORAGE_LIMITS } from '../src/lib/wilpayStorage.js';

const checksum = 'a'.repeat(64);
const base = {
  request_id: 'req_123',
  file_id: 'file_123',
  owner_user_id: 'user_123',
  loan_id: 'loan_123',
  document_type: 'selfie',
  bucket: WILPAY_STORAGE_LIMITS.bucket,
  object_key: `${WILPAY_STORAGE_LIMITS.rootPrefix}/user_123/selfies/file_123`,
  content_type: 'image/jpeg',
  size_bytes: 10 * 1024 * 1024,
  checksum_sha256: checksum
};

const accepted = assertWilpayUploadGrantServerPolicy(base, { authenticatedUserId: 'user_123' });
assert.equal(accepted.owner_user_id, 'user_123');
assert.equal(accepted.size_bytes, 10 * 1024 * 1024);

assert.throws(
  () => assertWilpayUploadGrantServerPolicy(base, { authenticatedUserId: 'other_user' }),
  /authenticated user/
);

assert.throws(
  () => assertWilpayUploadGrantServerPolicy({ ...base, size_bytes: (10 * 1024 * 1024) + 1 }, { authenticatedUserId: 'user_123' }),
  /size_bytes/
);

assert.throws(
  () => assertWilpayUploadGrantServerPolicy({ ...base, object_key: `${WILPAY_STORAGE_LIMITS.rootPrefix}/other_user/selfies/file_123` }, { authenticatedUserId: 'user_123' }),
  /object_key/
);

assert.throws(
  () => assertWilpayUploadGrantServerPolicy({ ...base, bucket: 'captapro-files' }, { authenticatedUserId: 'user_123' }),
  /private bucket/
);

assert.throws(
  () => assertWilpayUploadGrantServerPolicy({ ...base, upload_url: 'https://example.test/upload' }, { authenticatedUserId: 'user_123' }),
  /Forbidden upload grant field/
);

assert.throws(
  () => assertWilpayUploadGrantServerPolicy({ ...base, request_id: '' }, { authenticatedUserId: 'user_123' }),
  /request_id/
);

const guarantee = {
  ...base,
  document_type: 'guarantee',
  object_key: `${WILPAY_STORAGE_LIMITS.rootPrefix}/user_123/guarantees/file_123`,
  size_bytes: 20 * 1024 * 1024
};
assert.doesNotThrow(() => assertWilpayUploadGrantServerPolicy(guarantee, { authenticatedUserId: 'user_123' }));

console.log('PASS wilpayUploadGrantServerPolicy');
