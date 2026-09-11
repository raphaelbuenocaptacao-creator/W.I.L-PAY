import assert from 'node:assert/strict';
import * as gatewayModule from '../src/lib/wilpayAuditedAttachmentGateway.js';

const { createWilpayAuditedAttachmentGateway } = gatewayModule;

assert.equal(
  typeof gatewayModule.createWilpayExclusiveAttachmentRuntime,
  'function',
  'exclusive attachment runtime must derive trusted readiness at the server composition boundary'
);

const dbCalls = [];
let gatewayInput;
let gatewayCalls = 0;
const trustedRuntimeStatus = () => Object.freeze({
  ready: false,
  status: 'BLOCKED_EXTERNAL_BINDING',
  endpoint_configured: false,
  upload_origins_configured: false
});

const runtime = createWilpayAuditedAttachmentGateway({
  query: async (sql, params) => {
    dbCalls.push({ sql, params });
    return { rowCount: 1 };
  },
  runtimeStatus: trustedRuntimeStatus,
  persistAttachment: async (input) => {
    gatewayCalls += 1;
    gatewayInput = input;
    return { mode: 'private', result: { ok: true } };
  }
});

const result = await runtime.persistAttachment({
  authUid: 'user-456',
  loanId: 'loan-789',
  docType: 'document'
});

assert.equal(result.mode, 'private');
assert.equal(gatewayCalls, 1);
assert.equal(typeof gatewayInput.auditUploadCompleted, 'function');
assert.equal(gatewayInput.runtimeStatus, trustedRuntimeStatus, 'trusted runtime status must be injected by server composition');
assert.equal(Object.hasOwn(runtime, 'query'), false, 'query must never be exposed by the runtime');
assert.equal(Object.hasOwn(runtime, 'runtimeStatus'), false, 'runtime status capability must never be exposed by the runtime');

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

for (const capability of [
  'query',
  'auditUploadCompleted',
  'runtimeStatus',
  'persistPrivate',
  'legacyPersist',
  'persistAttachment',
  'binding',
  'observedDatabaseIdentity',
  'observedStorageIdentity',
  'transportStatus'
]) {
  await assert.rejects(
    () => runtime.persistAttachment({
      authUid: 'user-456',
      loanId: 'loan-789',
      docType: 'document',
      [capability]: async () => ({})
    }),
    /forbidden server capability fields/
  );
}
assert.equal(gatewayCalls, 1, 'capability injection must be rejected before persistence');

assert.throws(
  () => createWilpayAuditedAttachmentGateway({
    runtimeStatus: trustedRuntimeStatus,
    persistAttachment: async () => ({})
  }),
  /Exclusive W\.I\.L Pay audit query function is required/
);

assert.throws(
  () => createWilpayAuditedAttachmentGateway({
    query: async () => ({}),
    runtimeStatus: trustedRuntimeStatus,
    persistAttachment: null
  }),
  /persistAttachment is required/
);

assert.throws(
  () => createWilpayAuditedAttachmentGateway({
    query: async () => ({}),
    persistAttachment: async () => ({})
  }),
  /runtimeStatus is required/
);

console.log('PASS wilpayAuditedAttachmentGateway');
