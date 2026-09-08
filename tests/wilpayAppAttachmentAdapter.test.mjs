import assert from 'node:assert/strict';
import { persistWilpayAppAttachment } from '../src/lib/wilpayAppAttachmentAdapter.js';

const compacted = {
  name: 'documento.jpg',
  type: 'image/jpeg',
  size: 3,
  data_url: 'data:image/jpeg;base64,AQID'
};

function fakeNeon() {
  const inserted = [];
  return {
    inserted,
    from(table) {
      assert.equal(table, 'wilpay_loans');
      return {
        insert(record) {
          inserted.push(record);
          return {
            select: async () => ({ data: [{ id: 1, ...record }], error: null })
          };
        }
      };
    }
  };
}

{
  const neon = fakeNeon();
  const result = await persistWilpayAppAttachment({
    neon,
    getAccessToken: async () => 'unused',
    authUid: 'user-1',
    loanId: 'loan-1',
    docType: 'DOCUMENTO_FOTO',
    file: compacted,
    createdAt: '2026-09-08T02:00:00.000Z',
    runtimeStatus: () => ({ ready: false, endpoint_configured: false, upload_origins_configured: false })
  });
  assert.equal(result.error, null);
  assert.equal(neon.inserted.length, 1);
  assert.equal(neon.inserted[0].data_url, compacted.data_url);
}

{
  const neon = fakeNeon();
  await assert.rejects(
    persistWilpayAppAttachment({
      neon,
      getAccessToken: async () => 'unused',
      authUid: 'user-1',
      loanId: 'loan-1',
      docType: 'DOCUMENTO_FOTO',
      file: compacted,
      runtimeStatus: () => ({ ready: false, endpoint_configured: true, upload_origins_configured: false })
    }),
    /private storage configuration is incomplete/
  );
  assert.equal(neon.inserted.length, 0, 'partial private-storage config must not fall back to legacy persistence');
}

console.log('wilpayAppAttachmentAdapter tests passed');
