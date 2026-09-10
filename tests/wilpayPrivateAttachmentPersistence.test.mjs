import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { persistWilpayPrivateAttachment, wilpayStorageKindForDocType } from '../src/lib/wilpayPrivateAttachmentPersistence.js';

globalThis.crypto ??= webcrypto;

assert.equal(wilpayStorageKindForDocType('DOCUMENTO_FOTO'), 'document');
assert.equal(wilpayStorageKindForDocType('SELFIE_DOCUMENTO'), 'selfie');
assert.equal(wilpayStorageKindForDocType('COMPROVANTE_PAGAMENTO'), 'receipt');
assert.throws(() => wilpayStorageKindForDocType('OUTRO'), /Unsupported/);

const bytes = new TextEncoder().encode('wilpay-private-document');
const file = {
  name: 'documento.jpg',
  type: 'image/jpeg',
  size: bytes.byteLength,
  async arrayBuffer() {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
};

let inserted = null;
const neon = {
  from(table) {
    assert.equal(table, 'wilpay_loans');
    return {
      insert(record) {
        inserted = record;
        return {
          async select() {
            return { data: [{ id: 77, ...record }], error: null };
          }
        };
      }
    };
  }
};

const result = await persistWilpayPrivateAttachment({
  neon,
  authUid: 'user_123',
  loanId: 'loan_456',
  docType: 'DOCUMENTO_FOTO',
  file,
  storageProvider: 'private',
  createdAt: '2026-09-07T18:00:00.000Z',
  randomUUID: () => 'file_789',
  allowedUploadOrigins: ['https://storage.example.test'],
  requestUploadGrant: async request => ({
    ...request,
    request_id: 'test_private_attachment_persistence_1',
    method: 'PUT',
    upload_url: 'https://storage.example.test/private-upload',
    expires_at: new Date(Date.now() + 60_000).toISOString()
  }),
  fetchImpl: async (_url, options) => {
    assert.equal(options.method, 'PUT');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    return { ok: true, status: 200 };
  }
});

assert.equal(result.file_id, 'file_789');
assert.equal(inserted.record_type, 'ATTACHMENT');
assert.equal(inserted.doc_type, 'DOCUMENTO_FOTO');
assert.equal(inserted.file_id, 'file_789');
assert.equal(inserted.storage_provider, 'private');
assert.equal(inserted.bucket, 'wilpay-private-documents');
assert.equal(inserted.object_key, 'wilpay/production/user_123/documents/file_789');
assert.equal(inserted.object_key.includes('loan_456'), false, 'loan_id must stay in metadata, not the physical object key');
assert.match(inserted.checksum_sha256, /^[a-f0-9]{64}$/);

for (const forbidden of ['data_url', 'base64', 'file', 'blob', 'buffer', 'content', 'signed_url', 'upload_url']) {
  assert.equal(Object.prototype.hasOwnProperty.call(inserted, forbidden), false, `${forbidden} must not reach Neon`);
}

console.log('wilpayPrivateAttachmentPersistence: PASS');
