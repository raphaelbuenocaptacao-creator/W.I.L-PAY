import assert from 'node:assert/strict';
import {
  assertWilpayFileMetadata,
  buildWilpayObjectKey,
  buildWilpayFileMetadata,
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
  checksumSha256: checksum
});

assert.equal(metadata.storage_scope, 'wilpay-private');
assert.equal(metadata.visibility, 'private');
assert.equal(metadata.size_bytes, 2048);
assert.equal(metadata.checksum_sha256, checksum);
assert.equal(metadata.object_key, 'wilpay/users/user_123/loans/loan_456/proof/file_789.pdf');
assert.equal(assertWilpayFileMetadata(metadata), true);

assert.throws(() => validateWilpayUpload({ size: 10, type: 'text/html' }), /type/i);
assert.throws(() => buildWilpayObjectKey({ userId: '../escape', loanId: 'loan', kind: 'document', fileId: 'file', mimeType: 'application/pdf' }), /userId/);
assert.throws(() => buildWilpayObjectKey({ userId: 'user', loanId: 'loan', kind: 'unknown', fileId: 'file', mimeType: 'application/pdf' }), /kind/);
assert.throws(() => buildWilpayFileMetadata({ userId: 'user', loanId: 'loan', kind: 'document', fileId: 'file', file: sampleFile, checksumSha256: 'abc123' }), /checksum/i);
assert.throws(() => assertWilpayFileMetadata({ ...metadata, storage_scope: 'captapro-private' }), /private storage/i);
assert.throws(() => assertWilpayFileMetadata({ ...metadata, object_key: 'wilpay/users/other/loans/loan_456/proof/file_789.pdf' }), /object_key/i);

console.log('wilpayStorage tests passed');
