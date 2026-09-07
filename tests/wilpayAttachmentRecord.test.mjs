import assert from 'node:assert/strict';
import { buildWilpayAttachmentRecord } from '../src/lib/wilpayAttachmentRecord.js';

const record = buildWilpayAttachmentRecord({
  authUid: 'user-1',
  loanId: 'loan-1',
  docType: 'DOCUMENTO_FOTO',
  file: { name: 'doc.jpg', type: 'image/jpeg', size: 12345, data_url: 'data:image/jpeg;base64,ignored' },
  upload: {
    file_id: 'file-1',
    bucket: 'wilpay-private',
    object_key: 'users/user-1/loans/loan-1/file-1.jpg',
    checksum_sha256: 'A'.repeat(64)
  },
  storageProvider: 'private-storage',
  createdAt: '2026-09-07T17:00:00.000Z'
});

assert.equal(record.record_type, 'ATTACHMENT');
assert.equal(record.file_id, 'file-1');
assert.equal(record.mime_type, 'image/jpeg');
assert.equal(record.checksum_sha256, 'a'.repeat(64));
assert.equal(record.size, 12345);
assert.equal('data_url' in record, false);
assert.equal('signed_url' in record, false);
assert.equal('upload_url' in record, false);
assert.equal('file' in record, false);
assert.equal('content' in record, false);
assert.throws(() => buildWilpayAttachmentRecord({
  authUid: 'user-1', loanId: 'loan-1', docType: 'DOCUMENTO_FOTO',
  file: { name: 'x.jpg', type: 'image/jpeg', size: 0 }, upload: {}
}), /upload\.file_id is required/);

console.log('wilpayAttachmentRecord: PASS');
