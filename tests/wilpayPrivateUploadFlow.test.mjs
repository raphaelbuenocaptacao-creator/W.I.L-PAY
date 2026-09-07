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
  allowedUploadOrigins: ['https://storage.example.com'],
  fetchImpl: async () => {
    calls.push('upload');
    return { ok: true, status: 200 };
  }
});

assert.deepEqual(calls, ['grant', 'upload', 'persist']);
assert.equal(result.file_id, 'file_789');
assert.equal(persistedPayload.file_id, 'file_789');
for (const key of ['file', 'blob', 'bytes', 'buffer', 'base64', 'content', 'upload_url', 'signed_url']) {
  assert.equal(Object.prototype.hasOwnProperty.call(persistedPayload, key), false, `metadata leaked ${key}`);
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
      method: 'PUT',
      upload_url: 'https://storage.example.com/upload/fail',
      expires_at: new Date(Date.now() + 60_000).toISOString()
    }),
    persistFileMetadata: async () => {
      failedCalls.push('persist');
    },
    allowedUploadOrigins: ['https://storage.example.com'],
    fetchImpl: async () => ({ ok: false, status: 500 })
  }),
  /Private upload failed/
);
assert.deepEqual(failedCalls, [], 'metadata must not persist when object upload fails');

console.log('wilpayPrivateUploadFlow: PASS');
