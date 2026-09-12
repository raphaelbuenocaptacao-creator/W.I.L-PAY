import assert from 'node:assert/strict';
import { createWilpayStorageVerificationRuntime } from '../src/lib/wilpayStorageVerificationRuntime.js';

const trustedMetadata = {
  owner_user_id: 'user_1',
  loan_id: 'loan_1',
  document_type: 'document',
  upload_id: '4f4f5bf1-90d2-46d8-b2d4-66dc9c0e5321',
  storage_provider: 'private-provider',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_1/documents/file_1',
  size_bytes: 1024,
  checksum_sha256: 'a'.repeat(64),
  uploaded_at: '2026-09-11T16:00:00.000Z'
};

const calls = [];
let statRequest;
const verifyStorageObject = createWilpayStorageVerificationRuntime({
  statObject: async (request) => {
    statRequest = request;
    return {
      exists: true,
      size_bytes: trustedMetadata.size_bytes,
      checksum_sha256: trustedMetadata.checksum_sha256
    };
  },
  query: async (sql, params) => {
    calls.push({ sql, params });
    if (/^SELECT\b/i.test(sql.trim())) {
      return { rowCount: 1, rows: [trustedMetadata] };
    }
    if (/^UPDATE\b/i.test(sql.trim())) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error('unexpected query');
  },
  now: () => new Date('2026-09-11T16:07:00.000Z')
});

const result = await verifyStorageObject({ file_id: 'file_1' });
assert.equal(result.updated, true);
assert.equal(result.file_id, 'file_1');
assert.equal(calls.length, 2);
assert.match(calls[0].sql, /^SELECT\b/i);
assert.match(calls[0].sql, /owner_user_id/i);
assert.match(calls[0].sql, /loan_id/i);
assert.match(calls[0].sql, /document_type/i);
assert.match(calls[0].sql, /upload_id/i);
assert.match(calls[0].sql, /FROM wilpay\.file_metadata/i);
assert.match(calls[0].sql, /status = 'active'/i);
assert.match(calls[0].sql, /storage_verified_at IS NULL/i);
assert.deepEqual(calls[0].params, ['file_1']);
assert.deepEqual(statRequest, {
  storage_provider: trustedMetadata.storage_provider,
  bucket: trustedMetadata.bucket,
  object_key: trustedMetadata.object_key
});
assert.match(calls[1].sql, /^UPDATE\b/i);
assert.match(calls[1].sql, /storage_provider = \$6/i);
assert.match(calls[1].sql, /bucket = \$7/i);
assert.match(calls[1].sql, /object_key = \$8/i);
assert.match(calls[1].sql, /size_bytes = \$9/i);
assert.match(calls[1].sql, /uploaded_at = \$10::timestamptz/i);
assert.match(calls[1].sql, /owner_user_id = \$11/i);
assert.match(calls[1].sql, /loan_id = \$12/i);
assert.match(calls[1].sql, /document_type = \$13/i);
assert.match(calls[1].sql, /upload_id = \$14::uuid/i);
assert.deepEqual(calls[1].params, [
  'file_1',
  trustedMetadata.checksum_sha256,
  '2026-09-11T16:07:00.000Z',
  trustedMetadata.size_bytes,
  trustedMetadata.checksum_sha256,
  trustedMetadata.storage_provider,
  trustedMetadata.bucket,
  trustedMetadata.object_key,
  trustedMetadata.size_bytes,
  trustedMetadata.uploaded_at,
  trustedMetadata.owner_user_id,
  trustedMetadata.loan_id,
  trustedMetadata.document_type,
  trustedMetadata.upload_id
]);

await assert.rejects(
  () => verifyStorageObject({ file_id: 'file_1', metadata: trustedMetadata }),
  /request must contain only file_id/i
);

console.log('W.I.L Pay storage verification runtime trust tests passed');
