import assert from 'node:assert/strict';
import { reconcileWilpayStorageObject } from '../src/lib/wilpayStorageObjectReconciler.js';
import { reconcileWilpayStorageObjectFromStat } from '../src/lib/wilpayStorageObjectStatAdapter.js';
import { createWilpayStorageVerificationPersistence } from '../src/lib/wilpayStorageVerificationPersistence.js';
import { createWilpayStorageVerificationRuntime } from '../src/lib/wilpayStorageVerificationRuntime.js';

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

const persisted = await persistVerification({
  file_id: 'file_1',
  expected_checksum_sha256: metadata.checksum_sha256,
  evidence: statEvidence
});

assert.equal(persisted.updated, true);
assert.equal(persisted.file_id, 'file_1');
assert.match(persistenceCall.sql, /UPDATE wilpay\.file_metadata/i);
assert.match(persistenceCall.sql, /WHERE file_id = \$1/i);
assert.match(persistenceCall.sql, /status = 'active'/i);
assert.match(persistenceCall.sql, /checksum_sha256 = \$2/i);
assert.match(persistenceCall.sql, /storage_verified_at IS NULL/i);
assert.deepEqual(persistenceCall.params, [
  'file_1',
  metadata.checksum_sha256,
  statEvidence.storage_verified_at,
  statEvidence.storage_verified_size_bytes,
  statEvidence.storage_verified_checksum_sha256
]);

const persistConflict = createWilpayStorageVerificationPersistence({
  query: async () => ({ rowCount: 0 })
});
await assert.rejects(
  () => persistConflict({
    file_id: 'file_1',
    expected_checksum_sha256: metadata.checksum_sha256,
    evidence: statEvidence
  }),
  /verification persistence conflict/i
);

let runtimeStatRequest;
let runtimeQueryCall;
const verifyStorageObject = createWilpayStorageVerificationRuntime({
  statObject: async (request) => {
    runtimeStatRequest = request;
    return {
      exists: true,
      size_bytes: metadata.size_bytes,
      checksum_sha256: metadata.checksum_sha256
    };
  },
  query: async (sql, params) => {
    runtimeQueryCall = { sql, params };
    return { rowCount: 1 };
  },
  now: () => new Date('2026-09-11T16:07:00.000Z')
});

const runtimeResult = await verifyStorageObject({
  file_id: 'file_1',
  metadata
});

assert.deepEqual(runtimeStatRequest, {
  storage_provider: metadata.storage_provider,
  bucket: metadata.bucket,
  object_key: metadata.object_key
});
assert.equal(runtimeResult.updated, true);
assert.equal(runtimeResult.file_id, 'file_1');
assert.deepEqual(runtimeQueryCall.params, [
  'file_1',
  metadata.checksum_sha256,
  '2026-09-11T16:07:00.000Z',
  metadata.size_bytes,
  metadata.checksum_sha256
]);

let blockedPersistenceCalled = false;
const verifyMismatchedStorageObject = createWilpayStorageVerificationRuntime({
  statObject: async () => ({
    exists: true,
    size_bytes: metadata.size_bytes + 1,
    checksum_sha256: metadata.checksum_sha256
  }),
  query: async () => {
    blockedPersistenceCalled = true;
    return { rowCount: 1 };
  },
  now: () => new Date('2026-09-11T16:07:00.000Z')
});

await assert.rejects(
  () => verifyMismatchedStorageObject({ file_id: 'file_1', metadata }),
  /Storage object reconciliation failed/
);
assert.equal(blockedPersistenceCalled, false);

console.log('W.I.L Pay storage object reconciler tests passed');
