import assert from 'node:assert/strict';
import {
  persistWilpayPrivateAttachmentWithSession,
  wilpayPrivateUploadRuntimeStatus
} from '../src/lib/wilpayPrivateUploadSession.js';

const status = wilpayPrivateUploadRuntimeStatus();
assert.equal(status.ready, false);
assert.equal(status.endpoint_configured, false);
assert.equal(status.upload_origins_configured, false);

let tokenCalls = 0;
await assert.rejects(
  () => persistWilpayPrivateAttachmentWithSession({
    neon: { from() { throw new Error('database must not be reached'); } },
    getAccessToken: async () => {
      tokenCalls += 1;
      return 'must-not-be-used';
    },
    authUid: 'user-1',
    loanId: 'loan-1',
    docType: 'DOCUMENTO_FOTO',
    file: { name: 'doc.jpg', type: 'image/jpeg', size: 1, async arrayBuffer() { return new Uint8Array([1]).buffer; } }
  }),
  /private upload grant endpoint is not configured/
);
assert.equal(tokenCalls, 0, 'token provider must not run while dedicated storage is unconfigured');

console.log('wilpayPrivateUploadSession PASS');
