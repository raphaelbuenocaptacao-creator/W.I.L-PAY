import assert from 'node:assert/strict';
import {
  assertWilpayFileMetadata,
  buildWilpayObjectKey,
  buildWilpayFileMetadata,
  prepareWilpayPrivateUpload,
  sha256WilpayFile,
  validateWilpayUpload
} from '../src/lib/wilpayStorage.js';

const sampleFile = { size: 2048, type: 'application/pdf' };
const checksum = 'a'.repeat(64);

assert.equal(
  buildWilpayObjectKey({
    userId: 'user_123',
    loanId: 'loan_456',
    kind: 'document',
    fileId: 'file_789',
    mimeType: 'application/pdf'
  }),
  'wilpay/users/user_123/loans/loan_456/document/file_789.pdf'
);

const metadata = buildWilpayFileMetadata({
  userId: 'user_123',
  loanId: 'loan_456',
  kind: 'proof',
  fileId: 'file_789',
  file: sampleFile,
  checksumSha256: checksum,
  storageProvider: 'private_storage',
  createdAt: '2026-09-06T00:00:00.000Z'
});

assert.equal(metadata.storage_scope, 'wilpay-private');
assert.equal(metadata.visibility, 'private');
assert.equal(metadata.storage_provider, 'private_storage');
assert.equal(metadata.bucket, 'wilpay-private-documents');
assert.equal(metadata.document_type, 'proof');
assert.equal(metadata.content_type, 'application/pdf');
assert.equal(metadata.size_bytes, 2048);
assert.equal(metadata.checksum_sha256, checksum);
assert.equal(metadata.created_at, '2026-09-06T00:00:00.000Z');
assert.equal(metadata.object_key, 'wilpay/users/user_123/loans/loan_456/proof/file_789.pdf');
assert.equal(assertWilpayFileMetadata(metadata), true);

const fileBytes = new TextEncoder().encode('wilpay-private-upload');
const readableFile = {
  size: fileBytes.byteLength,
  type: 'application/pdf',
  async arrayBuffer() {
    return fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength);
  }
};
const expectedHash = '242578b9349fa2134eaf70a11c434ad5a10da94d5d5ccba6bdb3d26d07586454';
assert.equal(await sha256WilpayFile(readableFile), expectedHash);

const prepared = await prepareWilpayPrivateUpload({
  userId: 'user_123',
  loanId: 'loan_456',
  kind: 'document',
  fileId: 'file_hash',
  file: readableFile,
  storageProvider: 'private_storage',
  createdAt: '2026-09-06T00:00:00.000Z'
});
assert.equal(prepared.file, readableFile);
assert.equal(prepared.metadata.checksum_sha256, expectedHash);
assert.equal(prepared.metadata.object_key, 'wilpay/users/user_123/loans/loan_456/document/file_hash.pdf');
assert.equal(Object.isFrozen(prepared), true);
assert.equal(Object.isFrozen(prepared.metadata), true);
assert.equal('data_url' in prepared.metadata, false);

assert.throws(() => validateWilpayUpload({ size: 10, type: 'text/html' }), /type/i);
assert.throws(() => buildWilpayObjectKey({ userId: '../escape', loanId: 'loan', kind: 'document', fileId: 'file', mimeType: 'application/pdf' }), /userId/);
assert.throws(() => buildWilpayObjectKey({ userId: 'user', loanId: 'loan', kind: 'unknown', fileId: 'file', mimeType: 'application/pdf' }), /kind/);
assert.throws(() => buildWilpayFileMetadata({ userId: 'user', loanId: 'loan', kind: 'document', fileId: 'file', file: sampleFile, checksumSha256: checksum }), /storageProvider/i);
assert.throws(() => buildWilpayFileMetadata({ userId: 'user', loanId: 'loan', kind: 'document', fileId: 'file', file: sampleFile, storageProvider: 'private_storage' }), /required/i);
assert.throws(() => buildWilpayFileMetadata({ userId: 'user', loanId: 'loan', kind: 'document', fileId: 'file', file: sampleFile, checksumSha256: 'abc123', storageProvider: 'private_storage' }), /checksum/i);
assert.throws(() => assertWilpayFileMetadata({ ...metadata, checksum_sha256: null }), /required/i);
assert.throws(() => assertWilpayFileMetadata({ ...metadata, storage_scope: 'captapro-private' }), /private storage/i);
assert.throws(() => assertWilpayFileMetadata({ ...metadata, bucket: 'captapro-documents' }), /bucket/i);
assert.throws(() => assertWilpayFileMetadata({ ...metadata, object_key: 'wilpay/users/other/loans/loan_456/proof/file_789.pdf' }), /object_key/i);
await assert.rejects(() => sha256WilpayFile({ ...readableFile, arrayBuffer: undefined }), /readable/i);

console.log('wilpayStorage tests passed');
