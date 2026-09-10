import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

const source = await readFile(new URL('../src/lib/wilpayPrivateUploadSession.js', import.meta.url), 'utf8');
assert.match(source, /auditUploadCompleted:\s*completionAuditor/, 'session must forward the completion audit hook');
assert.match(source, /allowedUploadOrigins:\s*configuredUploadOrigins\(\)/, 'session must forward the dedicated storage origin allowlist');
assert.match(source, /optionalFunction\(auditUploadCompleted, 'auditUploadCompleted'\)/, 'session must reject non-function audit hooks before forwarding');

console.log('wilpayPrivateUploadSession PASS');
