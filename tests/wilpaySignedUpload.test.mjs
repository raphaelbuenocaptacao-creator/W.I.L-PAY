import assert from 'node:assert/strict';
import {
  assertWilpaySignedUploadGrant,
  assertWilpayUploadContent,
  buildWilpaySignedUploadRequest,
  uploadWilpayPrivateFile
} from '../src/lib/wilpaySignedUpload.js';

const bytes = new TextEncoder().encode('test');
const checksum = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const file = {
  size: bytes.byteLength,
  type: 'application/pdf',
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
};

const metadata = {
  file_id: 'file_1',
  owner_user_id: 'user_1',
  loan_id: 'loan_1',
  document_type: 'receipt',
  kind: 'receipt',
  storage_provider: 'private_storage',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_1/receipts/file_1',
  content_type: 'application/pdf',
  mime_type: 'application/pdf',
  size_bytes: bytes.byteLength,
  checksum_sha256: checksum,
  created_at: '2026-09-06T00:00:00.000Z',
  storage_scope: 'wilpay-private',
  visibility: 'private'
};

const legacyMetadata = {
  ...metadata,
  object_key: 'wilpay/users/user_1/loans/loan_1/receipt/file_1.pdf'
};

const grant = {
  ...metadata,
  method: 'PUT',
  upload_url: 'https://storage.example.test/signed-upload',
  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
};
const uploadPolicy = {
  allowedUploadOrigins: ['https://storage.example.test']
};

assert.equal(assertWilpaySignedUploadGrant(grant, metadata, uploadPolicy), true);
assert.deepEqual(buildWilpaySignedUploadRequest(metadata), {
  file_id: metadata.file_id,
  owner_user_id: metadata.owner_user_id,
  loan_id: metadata.loan_id,
  document_type: metadata.document_type,
  bucket: metadata.bucket,
  object_key: metadata.object_key,
  content_type: metadata.content_type,
  size_bytes: metadata.size_bytes,
  checksum_sha256: metadata.checksum_sha256
});
assert.equal('upload_url' in buildWilpaySignedUploadRequest(metadata), false);

assert.throws(() => buildWilpaySignedUploadRequest(legacyMetadata), /production private storage namespace/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, ...legacyMetadata }, legacyMetadata, uploadPolicy), /production private storage namespace/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, bucket: 'captapro-private' }, metadata, uploadPolicy), /bucket mismatch/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, object_key: 'wilpay/production/other/receipts/file_1' }, metadata, uploadPolicy), /object key mismatch/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, upload_url: 'http://storage.example.test/upload' }, metadata, uploadPolicy), /HTTPS/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, upload_url: 'https://user:secret@storage.example.test/upload' }, metadata, uploadPolicy), /credentials/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, upload_url: 'https://external.example.test/upload' }, metadata, uploadPolicy), /origin is not allowed/i);
assert.throws(() => assertWilpaySignedUploadGrant(grant, metadata, { allowedUploadOrigins: [] }), /origin is not configured/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, expires_at: new Date(Date.now() + 11 * 60 * 1000).toISOString() }, metadata, uploadPolicy), /expiry/i);

assert.equal(await assertWilpayUploadContent(file, metadata), true);
await assert.rejects(
  () => assertWilpayUploadContent({ ...file, size: file.size + 1 }, metadata),
  /size mismatch/i
);
await assert.rejects(
  () => assertWilpayUploadContent({ ...file, type: 'image/png' }, metadata),
  /content type mismatch/i
);
const tamperedBytes = new TextEncoder().encode('evil');
await assert.rejects(
  () => assertWilpayUploadContent({
    size: tamperedBytes.byteLength,
    type: 'application/pdf',
    arrayBuffer: async () => tamperedBytes.buffer.slice(tamperedBytes.byteOffset, tamperedBytes.byteOffset + tamperedBytes.byteLength)
  }, metadata),
  /checksum mismatch/i
);

let request;
const result = await uploadWilpayPrivateFile({
  file,
  metadata,
  grant,
  allowedUploadOrigins: uploadPolicy.allowedUploadOrigins,
  fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200 };
  }
});
assert.equal(request.url, grant.upload_url);
assert.equal(request.options.method, 'PUT');
assert.equal(request.options.credentials, 'omit');
assert.equal(request.options.cache, 'no-store');
assert.equal(request.options.referrerPolicy, 'no-referrer');
assert.equal(result.object_key, metadata.object_key);

console.log('wilpaySignedUpload tests passed');
