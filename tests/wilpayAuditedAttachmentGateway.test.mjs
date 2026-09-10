import assert from 'node:assert/strict';
import { createWilpayAuditedAttachmentGateway } from '../src/lib/wilpayAuditedAttachmentGateway.js';

const dbCalls = [];
let gatewayInput;

const runtime = createWilpayAuditedAttachmentGateway({
  query: async (sql, params) => {
    dbCalls.push({ sql, params });
    return { rowCount: 1 };
  },
  persistAttachment: async (input) => {
    gatewayInput = input;
    return { mode: 'private', result: { ok: true } };
  }
});

const attackerAuditor = async () => {
  throw new Error('request auditor must never be used');
};

const result = await runtime.persistAttachment({
  authUid: 'user-456',
  loanId: 'loan-789',
  docType: 'document',
  auditUploadCompleted: attackerAuditor
});

assert.equal(result.mode, 'private');
assert.equal(typeof gatewayInput.auditUploadCompleted, 'function');
assert.notEqual(gatewayInput.auditUploadCompleted, attackerAuditor);
assert.equal(Object.hasOwn(runtime, 'query'), false, 'query must never be exposed by the runtime');

await gatewayInput.auditUploadCompleted({
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
  occurred_at: '2026-09-10T20:00:00.000Z'
});

assert.equal(dbCalls.length, 1);
assert.match(dbCalls[0].sql, /^INSERT INTO wilpay\.file_audit_log/);
assert.ok(!dbCalls[0].sql.includes('file-123.pdf'));

await assert.rejects(
  () => gatewayInput.auditUploadCompleted({
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
    occurred_at: '2026-09-10T20:00:00.000Z',
    signed_url: 'https://example.invalid/private'
  }),
  /forbidden sensitive fields/
);
assert.equal(dbCalls.length, 1, 'unsafe audit payload must not reach the database');

assert.throws(
  () => createWilpayAuditedAttachmentGateway({ persistAttachment: async () => ({}) }),
  /Exclusive W\.I\.L Pay audit query function is required/
);

assert.throws(
  () => createWilpayAuditedAttachmentGateway({ query: async () => ({}), persistAttachment: null }),
  /persistAttachment is required/
);

console.log('PASS wilpayAuditedAttachmentGateway');
