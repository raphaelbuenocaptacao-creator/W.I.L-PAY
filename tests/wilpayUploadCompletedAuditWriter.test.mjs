import assert from 'node:assert/strict';
import { createWilpayUploadCompletedAuditWriter } from '../src/lib/wilpayUploadCompletedAuditWriter.js';

const baseEvent = {
  event_type: 'private_upload_completed',
  request_id: 'req_complete_001',
  owner_user_id: 'user_123',
  file_id: 'file_456',
  loan_id: 'loan_789',
  document_type: 'document',
  storage_provider: 'private_storage',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_123/documents/file_456',
  content_type: 'application/pdf',
  size_bytes: 4096,
  checksum_sha256: 'd'.repeat(64),
  occurred_at: '2026-09-10T14:00:00.000Z'
};

let inserted = null;
const writer = createWilpayUploadCompletedAuditWriter({
  insertAuditRow: async row => {
    inserted = row;
  }
});

const row = await writer(baseEvent);
assert.equal(row.action, 'upload_completed');
assert.equal(row.file_id, baseEvent.file_id);
assert.equal(row.actor_user_id, baseEvent.owner_user_id);
assert.equal(row.request_id, baseEvent.request_id);
assert.equal(row.details.phase, 'completed');
assert.equal(row.details.loan_id, baseEvent.loan_id);
assert.equal(row.details.object_key, baseEvent.object_key);
assert.equal(row.details.checksum_sha256, baseEvent.checksum_sha256);
assert.deepEqual(row, inserted);
assert.equal(Object.isFrozen(row), true);
assert.equal(Object.isFrozen(row.details), true);

const serialized = JSON.stringify(row);
for (const forbidden of ['upload_url', 'signed_url', 'service_role', 'token', 'secret', 'file_data', 'file_bytes', 'base64', 'blob']) {
  assert.equal(serialized.includes(`\"${forbidden}\"`), false, `audit row must not include ${forbidden}`);
}

await assert.rejects(
  writer({ ...baseEvent, signed_url: 'https://storage.example.invalid/private' }),
  /forbidden sensitive fields/i
);

await assert.rejects(
  writer({ ...baseEvent, metadata: { token: 'never-persist' } }),
  /forbidden sensitive fields/i
);

await assert.rejects(
  writer({ ...baseEvent, event_type: 'unexpected_event' }),
  /unsupported/i
);

await assert.rejects(
  writer({ ...baseEvent, checksum_sha256: 'invalid' }),
  /checksum/i
);

await assert.rejects(
  writer({ ...baseEvent, size_bytes: 0 }),
  /size_bytes/i
);

assert.throws(
  () => createWilpayUploadCompletedAuditWriter(),
  /insert function is required/i
);

console.log('PASS wilpayUploadCompletedAuditWriter');
