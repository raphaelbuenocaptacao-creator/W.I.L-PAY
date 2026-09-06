import assert from 'node:assert/strict';
import {
  assertWilpaySignedUploadGrant,
  buildWilpaySignedUploadRequest,
  uploadWilpayPrivateFile
} from '../src/lib/wilpaySignedUpload.js';

const metadata = {
  file_id: 'file_1',
  owner_user_id: 'user_1',
  loan_id: 'loan_1',
  document_type: 'proof',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/users/user_1/loans/loan_1/proof/file_1.pdf',
  content_type: 'application/pdf',
  size_bytes: 100,
  checksum_sha256: 'a'.repeat(64)
};

const grant = {
  ...metadata,
  method: 'PUT',
  upload_url: 'https://storage.example.test/signed-upload',
  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
};

assert.equal(assertWilpaySignedUploadGrant(grant, metadata), true);
assert.deepEqual(buildWilpaySignedUploadRequest(metadata), metadata);
assert.equal('upload_url' in buildWilpaySignedUploadRequest(metadata), false);

assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, bucket: 'captapro-private' }, metadata), /bucket mismatch/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, object_key: 'wilpay/users/other/loans/loan_1/proof/file_1.pdf' }, metadata), /object key mismatch/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, upload_url: 'http://storage.example.test/upload' }, metadata), /HTTPS/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, upload_url: 'https://user:secret@storage.example.test/upload' }, metadata), /credentials/i);
assert.throws(() => assertWilpaySignedUploadGrant({ ...grant, expires_at: new Date(Date.now() + 11 * 60 * 1000).toISOString() }, metadata), /expiry/i);

let request;
const result = await uploadWilpayPrivateFile({
  file: { size: 100, type: 'application/pdf' },
  metadata,
  grant,
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
