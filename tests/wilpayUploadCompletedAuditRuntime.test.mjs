import assert from 'node:assert/strict';
import { createWilpayUploadCompletedAuditRuntime } from '../src/lib/wilpayUploadCompletedAuditRuntime.js';

const calls = [];
const runtime = createWilpayUploadCompletedAuditRuntime({
  query: async (sql, params) => {
    calls.push({ sql, params });
    return { rowCount: 1 };
  }
});

const event = {
  event_type: 'private_upload_completed',
  file_id: 'file-123',
  owner_user_id: 'user-456',
  loan_id: 'loan-789',
  document_type: 'document',
  storage_provider: 'private-storage',
  bucket: 'wilpay-private',
  object_key: 'wilpay/production/user-456/loan-789/document/file-123.pdf',
  content_type: 'application/pdf',
  size_bytes: 4096,
  checksum_sha256: 'a'.repeat(64),
  request_id: 'req-123',
  occurred_at: '2026-09-10T18:00:00.000Z'
};

const row = await runtime.auditUploadCompleted(event);
assert.equal(row.action, 'upload_completed');
assert.equal(calls.length, 1);
assert.match(calls[0].sql, /^INSERT INTO wilpay\.file_audit_log/);
assert.ok(calls[0].sql.includes('$1'));
assert.ok(!calls[0].sql.includes(event.object_key));
assert.equal(calls[0].params[0], event.file_id);
assert.equal(calls[0].params[1], event.owner_user_id);
assert.equal(calls[0].params[2], 'upload_completed');
const details = JSON.parse(calls[0].params[5]);
assert.equal(details.object_key, event.object_key);
assert.equal(details.checksum_sha256, event.checksum_sha256);
assert.ok(!Object.hasOwn(details, 'signed_url'));
assert.ok(!Object.hasOwn(details, 'upload_url'));

await assert.rejects(
  () => runtime.auditUploadCompleted({ ...event, signed_url: 'https://example.invalid/private' }),
  /forbidden sensitive fields/
);
assert.equal(calls.length, 1, 'unsafe event must never reach the database query');

assert.throws(
  () => createWilpayUploadCompletedAuditRuntime(),
  /Exclusive W\.I\.L Pay audit query function is required/
);

console.log('PASS wilpayUploadCompletedAuditRuntime');
