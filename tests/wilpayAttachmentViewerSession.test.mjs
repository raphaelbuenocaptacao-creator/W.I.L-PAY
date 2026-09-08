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
