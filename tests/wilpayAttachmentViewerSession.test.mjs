import assert from 'node:assert/strict';
import {
  resolveWilpayAttachmentForCurrentSession,
  openWilpayAttachmentForCurrentSession
} from '../src/lib/wilpayAttachmentViewerSession.js';

const now = Date.parse('2026-09-08T12:00:00.000Z');
const legacyRecord = {
  data_url: 'data:image/jpeg;base64,AA==',
  mime_type: 'image/jpeg'
};

const legacy = await resolveWilpayAttachmentForCurrentSession(legacyRecord, { now });
assert.equal(legacy.mode, 'legacy');
assert.match(legacy.source, /^data:image\/jpeg;base64,/);

let grantRequest = null;
const privateRecord = {
  record_type: 'ATTACHMENT',
  auth_uid: 'user_test_123',
  file_id: 'file_test_123',
  object_key: 'wilpay/users/u1/loans/l1/comprovante.jpg',
  mime_type: 'image/jpeg'
};
const privateResolved = await resolveWilpayAttachmentForCurrentSession(privateRecord, {
  now,
  requestViewerGrant: async metadata => {
    grantRequest = metadata;
    return {
      signed_url: 'https://storage.example.test/private/comprovante.jpg?sig=short-lived',
      expires_at: '2026-09-08T12:05:00.000Z'
    };
  }
});
assert.equal(privateResolved.mode, 'private');
assert.deepEqual(grantRequest, {
  file_id: privateRecord.file_id,
  object_key: privateRecord.object_key
});
assert.equal(privateResolved.file_id, privateRecord.file_id);

let orphanGrantCalled = false;
await assert.rejects(
  resolveWilpayAttachmentForCurrentSession({
    record_type: 'ATTACHMENT',
    file_id: 'file_orphan',
    object_key: 'wilpay/users/unknown/loans/l1/orphan.jpg',
    mime_type: 'image/jpeg'
  }, {
    now,
    requestViewerGrant: async () => {
      orphanGrantCalled = true;
      throw new Error('grant must not be requested');
    }
  }),
  /private attachment owner is required/
);
assert.equal(orphanGrantCalled, false);

let invalidGrantCalled = false;
await assert.rejects(
  resolveWilpayAttachmentForCurrentSession({
    record_type: 'LOAN',
    auth_uid: 'user_test_123',
    file_id: 'file_must_not_open',
    object_key: 'wilpay/users/u1/loans/l1/not-an-attachment',
    mime_type: 'image/jpeg'
  }, {
    now,
    requestViewerGrant: async () => {
      invalidGrantCalled = true;
      throw new Error('grant must not be requested');
    }
  }),
  /record is not an attachment/
);
assert.equal(invalidGrantCalled, false);

let openedArgs = null;
let openedWindow = null;
const opened = await openWilpayAttachmentForCurrentSession(legacyRecord, {
  now,
  openWindow: (...args) => {
    openedArgs = args;
    openedWindow = { opener: 'unsafe' };
    return openedWindow;
  }
});
assert.equal(opened.mode, 'legacy');
assert.equal(openedArgs[1], '_blank');
assert.equal(openedArgs[2], 'noopener,noreferrer');
assert.equal(openedWindow.opener, null);

console.log('PASS wilpayAttachmentViewerSession');
