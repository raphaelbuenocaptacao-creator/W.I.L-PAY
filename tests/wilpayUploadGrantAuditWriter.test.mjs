import assert from 'node:assert/strict';
import { createWilpayUploadGrantAuditWriter } from '../src/lib/wilpayUploadGrantAuditWriter.js';

const baseEvent = {
  event_type: 'private_upload_grant_issued',
  request_id: 'req_audit_001',
  owner_user_id: 'user_123',
  file_id: 'file_456',
  loan_id: 'loan_789',
  document_type: 'document',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_123/documents/file_456',
  content_type: 'application/pdf',
  size_bytes: 2048,
  checksum_sha256: 'c'.repeat(64),
  expires_at: '2026-09-10T12:05:00.000Z',
  occurred_at: '2026-09-10T12:00:00.000Z'
};

let inserted = null;
const writer = createWilpayUploadGrantAuditWriter({
  insertAuditRow: async (row) => {
    inserted = row;
  }
});

const row = await writer(baseEvent);
assert.equal(row.action, 'grant_requested');
assert.equal(row.file_id, baseEvent.file_id);
assert.equal(row.actor_user_id, baseEvent.owner_user_id);
assert.equal(row.request_id, baseEvent.request_id);
assert.equal(row.details.phase, 'issued');
assert.equal(row.details.document_type, baseEvent.document_type);
assert.equal(row.details.size_bytes, baseEvent.size_bytes);
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
  writer({ ...baseEvent, metadata: { token: 'should-never-persist' } }),
  /forbidden sensitive fields/i
);

await assert.rejects(
  writer({ ...baseEvent, event_type: 'unexpected_event' }),
  /unsupported/i
);

await assert.rejects(
  writer({ ...baseEvent, checksum_sha256: 'not-a-checksum' }),
  /checksum/i
);

assert.throws(
  () => createWilpayUploadGrantAuditWriter(),
  /insert function is required/i
);

console.log('PASS wilpayUploadGrantAuditWriter');
