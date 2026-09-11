import assert from 'node:assert/strict';
import { createWilpayStorageVerificationRuntime } from '../src/lib/wilpayStorageVerificationRuntime.js';

const trustedMetadata = {
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

await assert.rejects(
  () => verifyStorageObject({ file_id: 'file_1', metadata: trustedMetadata }),
  /request must contain only file_id/i
);

console.log('W.I.L Pay storage verification runtime trust tests passed');
