import assert from 'node:assert/strict';
import { reconcileWilpayStorageObject } from '../src/lib/wilpayStorageObjectReconciler.js';
import { reconcileWilpayStorageObjectFromStat } from '../src/lib/wilpayStorageObjectStatAdapter.js';
import { createWilpayStorageVerificationPersistence } from '../src/lib/wilpayStorageVerificationPersistence.js';

const metadata = {
  storage_provider: 'private-provider',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_1/documents/file_1',
  size_bytes: 1024,
  checksum_sha256: 'a'.repeat(64),
  uploaded_at: '2026-09-11T16:00:00.000Z'
};

const evidence = reconcileWilpayStorageObject({
  metadata,
  observedObject: {
    exists: true,
    storage_provider: metadata.storage_provider,
    bucket: metadata.bucket,
    object_key: metadata.object_key,
    size_bytes: metadata.size_bytes,
    checksum_sha256: metadata.checksum_sha256
  },
  verifiedAt: '2026-09-11T16:05:00.000Z'
});

assert.deepEqual(evidence, {
  storage_verified_at: '2026-09-11T16:05:00.000Z',
  storage_verified_size_bytes: 1024,
  storage_verified_checksum_sha256: 'a'.repeat(64)
});

for (const observedObject of [
  { ...metadata, exists: false },
  { exists: true, storage_provider: 'other', bucket: metadata.bucket, object_key: metadata.object_key, size_bytes: 1024, checksum_sha256: 'a'.repeat(64) },
  { exists: true, storage_provider: metadata.storage_provider, bucket: 'other', object_key: metadata.object_key, size_bytes: 1024, checksum_sha256: 'a'.repeat(64) },
  { exists: true, storage_provider: metadata.storage_provider, bucket: metadata.bucket, object_key: 'wilpay/production/user_1/documents/other', size_bytes: 1024, checksum_sha256: 'a'.repeat(64) },
  { exists: true, storage_provider: metadata.storage_provider, bucket: metadata.bucket, object_key: metadata.object_key, size_bytes: 999, checksum_sha256: 'a'.repeat(64) },
  { exists: true, storage_provider: metadata.storage_provider, bucket: metadata.bucket, object_key: metadata.object_key, size_bytes: 1024, checksum_sha256: 'b'.repeat(64) }
]) {
  assert.throws(
    () => reconcileWilpayStorageObject({ metadata, observedObject, verifiedAt: '2026-09-11T16:05:00.000Z' }),
    /Storage object reconciliation failed/
  );
}

assert.throws(
  () => reconcileWilpayStorageObject({
    metadata,
    observedObject: {
      exists: true,
      storage_provider: metadata.storage_provider,
      bucket: metadata.bucket,
      object_key: metadata.object_key,
      size_bytes: 1024,
      checksum_sha256: 'a'.repeat(64)
    },
    verifiedAt: '2026-09-11T15:59:59.000Z'
  }),
  /verifiedAt must not precede uploaded_at/
);

let statRequest;
const statEvidence = await reconcileWilpayStorageObjectFromStat({
  metadata,
  statObject: async (request) => {
    statRequest = request;
    return {
      exists: true,
      size_bytes: 1024,
      checksum_sha256: 'a'.repeat(64)
    };
  },
  verifiedAt: '2026-09-11T16:06:00.000Z'
});

assert.deepEqual(statRequest, {
  storage_provider: metadata.storage_provider,
  bucket: metadata.bucket,
  object_key: metadata.object_key
});
assert.deepEqual(statEvidence, {
  storage_verified_at: '2026-09-11T16:06:00.000Z',
  storage_verified_size_bytes: 1024,
  storage_verified_checksum_sha256: 'a'.repeat(64)
});

await assert.rejects(
  () => reconcileWilpayStorageObjectFromStat({
    metadata,
    statObject: async () => ({ exists: true, size_bytes: 999, checksum_sha256: 'a'.repeat(64) }),
    verifiedAt: '2026-09-11T16:06:00.000Z'
  }),
  /Storage object reconciliation failed/
);

let persistenceCall;
const persistVerification = createWilpayStorageVerificationPersistence({
  query: async (sql, params) => {
    persistenceCall = { sql, params };
    return { rowCount: 1 };
  }
});

const persistencePayload = {
  file_id: 'file_1',
  expected_checksum_sha256: metadata.checksum_sha256,
  expected_storage_provider: metadata.storage_provider,
  expected_bucket: metadata.bucket,
  expected_object_key: metadata.object_key,
  expected_size_bytes: metadata.size_bytes,
  expected_uploaded_at: metadata.uploaded_at,
  evidence: statEvidence
};

const persisted = await persistVerification(persistencePayload);

assert.equal(persisted.updated, true);
assert.equal(persisted.file_id, 'file_1');
assert.match(persistenceCall.sql, /UPDATE wilpay\.file_metadata/i);
assert.match(persistenceCall.sql, /WHERE file_id = \$1/i);
assert.match(persistenceCall.sql, /status = 'active'/i);
assert.match(persistenceCall.sql, /checksum_sha256 = \$2/i);
assert.match(persistenceCall.sql, /storage_verified_at IS NULL/i);
assert.match(persistenceCall.sql, /storage_provider = \$6/i);
assert.match(persistenceCall.sql, /bucket = \$7/i);
assert.match(persistenceCall.sql, /object_key = \$8/i);
assert.match(persistenceCall.sql, /size_bytes = \$9/i);
assert.match(persistenceCall.sql, /uploaded_at = \$10::timestamptz/i);
assert.deepEqual(persistenceCall.params, [
  'file_1',
  metadata.checksum_sha256,
  statEvidence.storage_verified_at,
  statEvidence.storage_verified_size_bytes,
  statEvidence.storage_verified_checksum_sha256,
  metadata.storage_provider,
  metadata.bucket,
  metadata.object_key,
  metadata.size_bytes,
  metadata.uploaded_at
]);

const persistConflict = createWilpayStorageVerificationPersistence({
  query: async () => ({ rowCount: 0 })
});
await assert.rejects(
  () => persistConflict(persistencePayload),
  /verification persistence conflict/i
);

console.log('W.I.L Pay storage object reconciler tests passed');
