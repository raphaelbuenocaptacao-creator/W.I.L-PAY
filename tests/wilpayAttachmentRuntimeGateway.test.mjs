import assert from 'node:assert/strict';
import { persistWilpayAttachmentForRuntime } from '../src/lib/wilpayAttachmentRuntimeGateway.js';

let legacyCalls = 0;
const legacy = await persistWilpayAttachmentForRuntime({
  neon: {},
  getAccessToken: async () => 'unused',
  authUid: 'user-1',
  loanId: 'loan-1',
  docType: 'DOCUMENTO_FOTO',
  file: {},
  runtimeStatus: () => ({
    ready: false,
    endpoint_configured: false,
    upload_origins_configured: false
  }),
  legacyPersist: async () => {
    legacyCalls += 1;
    return { ok: true };
  }
});
assert.equal(legacy.mode, 'legacy');
assert.equal(legacyCalls, 1);

for (const partial of [
  { ready: false, endpoint_configured: true, upload_origins_configured: false },
  { ready: false, endpoint_configured: false, upload_origins_configured: true }
]) {
  let called = false;
  await assert.rejects(
    persistWilpayAttachmentForRuntime({
      neon: {},
      getAccessToken: async () => 'unused',
      authUid: 'user-1',
      loanId: 'loan-1',
      docType: 'DOCUMENTO_FOTO',
      file: {},
      runtimeStatus: () => partial,
      legacyPersist: async () => {
        called = true;
      }
    }),
    /private storage configuration is incomplete/
  );
  assert.equal(called, false, 'partial private config must not fall back to legacy persistence');
}

await assert.rejects(
  persistWilpayAttachmentForRuntime({
    neon: {},
    getAccessToken: async () => 'unused',
    authUid: 'user-1',
    loanId: 'loan-1',
    docType: 'DOCUMENTO_FOTO',
    file: {},
    runtimeStatus: () => ({
      ready: false,
      endpoint_configured: false,
      upload_origins_configured: false
    })
  }),
  /legacyPersist is required/
);

const completionAudit = async () => ({ ok: true });
let privateArgs;
const privateResult = await persistWilpayAttachmentForRuntime({
  neon: { kind: 'metadata-only-client' },
  getAccessToken: async () => 'access-token',
  auditUploadCompleted: completionAudit,
  authUid: 'user-private',
  loanId: 'loan-private',
  docType: 'COMPROVANTE_RENDA',
  file: { name: 'comprovante.pdf' },
  runtimeStatus: () => ({
    ready: true,
    endpoint_configured: true,
    upload_origins_configured: true
  }),
  persistPrivate: async args => {
    privateArgs = args;
    return { file_id: 'file-private' };
  }
});

assert.equal(privateResult.mode, 'private');
assert.deepEqual(privateResult.result, { file_id: 'file-private' });
assert.equal(privateArgs.auditUploadCompleted, completionAudit);
assert.equal(privateArgs.authUid, 'user-private');
assert.equal(privateArgs.loanId, 'loan-private');
assert.equal(privateArgs.docType, 'COMPROVANTE_RENDA');
assert.equal(privateArgs.file.name, 'comprovante.pdf');

let malformedPrivateCalled = false;
await assert.rejects(
  persistWilpayAttachmentForRuntime({
    neon: {},
    getAccessToken: async () => 'unused',
    auditUploadCompleted: 'not-a-function',
    authUid: 'user-private',
    loanId: 'loan-private',
    docType: 'DOCUMENTO_FOTO',
    file: {},
    runtimeStatus: () => ({
      ready: true,
      endpoint_configured: true,
      upload_origins_configured: true
    }),
    persistPrivate: async () => {
      malformedPrivateCalled = true;
    }
  }),
  /auditUploadCompleted must be a function/
);
assert.equal(malformedPrivateCalled, false, 'invalid audit hooks must fail before private persistence');

console.log('wilpayAttachmentRuntimeGateway tests passed');
