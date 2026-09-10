import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { uploadWilpayFileToPrivateStorage } = await import('../src/lib/wilpayPrivateUploadFlow.js');

function fakeFile(bytes, type = 'image/jpeg') {
  const body = Uint8Array.from(bytes);
  return {
    size: body.byteLength,
    type,
    async arrayBuffer() {
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    }
  };
}

const file = fakeFile([1, 2, 3, 4]);
const calls = [];
let persistedPayload = null;
let auditedPayload = null;

const result = await uploadWilpayFileToPrivateStorage({
  userId: 'user_123',
  loanId: 'loan_456',
  kind: 'document',
  fileId: 'file_789',
  file,
  storageProvider: 'private_storage',
  requestUploadGrant: async request => {
    calls.push('grant');
    return {
      ...request,
      request_id: 'test_private_flow_success_1',
      method: 'PUT',
      upload_url: 'https://storage.example.com/upload/object',
      expires_at: new Date(Date.now() + 60_000).toISOString()
    };
  },
  persistFileMetadata: async metadata => {
    calls.push('persist');
    persistedPayload = metadata;
    return { ok: true };
  },
  auditUploadCompleted: async event => {
    calls.push('audit');
    auditedPayload = event;
  },
  allowedUploadOrigins: ['https://storage.example.com'],
  fetchImpl: async () => {
    calls.push('upload');
    return { ok: true, status: 200 };
  }
});

assert.deepEqual(calls, ['grant', 'upload', 'persist', 'audit']);
assert.equal(result.file_id, 'file_789');
assert.equal(persistedPayload.file_id, 'file_789');
assert.equal(auditedPayload.event_type, 'private_upload_completed');
assert.equal(auditedPayload.file_id, 'file_789');
assert.equal(auditedPayload.request_id, 'test_private_flow_success_1');
assert.equal(auditedPayload.checksum_sha256, result.checksum_sha256);
for (const payload of [persistedPayload, auditedPayload]) {
  for (const key of ['file', 'blob', 'bytes', 'buffer', 'base64', 'content', 'data_url', 'upload_url', 'signed_url']) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, `metadata leaked ${key}`);
  }
}

const failedCalls = [];
await assert.rejects(
  uploadWilpayFileToPrivateStorage({
    userId: 'user_123',
    loanId: 'loan_456',
    kind: 'selfie',
    fileId: 'file_fail',
    file,
    storageProvider: 'private_storage',
    requestUploadGrant: async request => ({
      ...request,
      request_id: 'test_private_flow_failure_1',
      method: 'PUT',
      upload_url: 'https://storage.example.com/upload/fail',
      expires_at: new Date(Date.now() + 60_000).toISOString()
    }),
    persistFileMetadata: async () => {
      failedCalls.push('persist');
    },
    auditUploadCompleted: async () => {
      failedCalls.push('audit');
    },
    allowedUploadOrigins: ['https://storage.example.com'],
    fetchImpl: async () => ({ ok: false, status: 500 })
  }),
  /Private upload failed/
);
assert.deepEqual(failedCalls, [], 'metadata and audit must not run when object upload fails');

const persistFailureCalls = [];
await assert.rejects(
  uploadWilpayFileToPrivateStorage({
    userId: 'user_123',
    loanId: 'loan_456',
    kind: 'document',
    fileId: 'file_persist_fail',
    file,
    storageProvider: 'private_storage',
    requestUploadGrant: async request => ({
      ...request,
      request_id: 'test_private_flow_persist_failure_1',
      method: 'PUT',
      upload_url: 'https://storage.example.com/upload/persist-fail',
      expires_at: new Date(Date.now() + 60_000).toISOString()
    }),
    persistFileMetadata: async () => {
      persistFailureCalls.push('persist');
      throw new Error('metadata persistence failed');
    },
    auditUploadCompleted: async () => {
      persistFailureCalls.push('audit');
    },
    allowedUploadOrigins: ['https://storage.example.com'],
    fetchImpl: async () => ({ ok: true, status: 200 })
  }),
  /metadata persistence failed/
);
assert.deepEqual(persistFailureCalls, ['persist'], 'completion audit must not run before metadata persistence succeeds');

console.log('wilpayPrivateUploadFlow: PASS');
