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

console.log('wilpayAttachmentRuntimeGateway tests passed');
