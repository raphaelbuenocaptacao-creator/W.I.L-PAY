import assert from 'node:assert/strict';
import { reconcileWilpayStorageObject } from '../src/lib/wilpayStorageObjectReconciler.js';

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

console.log('W.I.L Pay storage object reconciler tests passed');
