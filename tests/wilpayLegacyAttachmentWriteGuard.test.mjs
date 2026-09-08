import assert from 'node:assert/strict';
import { installWilpayLegacyAttachmentWriteGuard } from '../src/lib/wilpayLegacyAttachmentWriteGuard.js';

function fakeNeon() {
  const inserts = [];
  return {
    inserts,
    from(table) {
      return {
        insert(payload) {
          inserts.push({ table, payload });
          return {
            select() { return this; },
            then(resolve, reject) {
              return Promise.resolve({ data: [payload], error: null }).then(resolve, reject);
            }
          };
        }
      };
    }
  };
}

const legacyStatus = () => ({ ready: false, endpoint_configured: false, upload_origins_configured: false });
const partialStatus = () => ({ ready: false, endpoint_configured: true, upload_origins_configured: false });
const privateStatus = () => ({ ready: true, endpoint_configured: true, upload_origins_configured: true });
const attachment = {
  record_type: 'ATTACHMENT',
  auth_uid: 'user-1',
  loan_id: 'loan-1',
  doc_type: 'DOCUMENTO_FOTO',
  file_name: 'documento.jpg',
  mime_type: 'image/jpeg',
  size: 2,
  data_url: 'data:image/jpeg;base64,AA==',
  created_at: '2026-09-08T00:00:00.000Z'
};

{
  const neon = fakeNeon();
  installWilpayLegacyAttachmentWriteGuard(neon, legacyStatus);
  const result = await neon.from('wilpay_loans').insert(attachment).select();
  assert.equal(result.error, null);
  assert.equal(neon.inserts.length, 1, 'legacy bridge must still work before private rollout starts');
}

{
  const neon = fakeNeon();
  installWilpayLegacyAttachmentWriteGuard(neon, partialStatus);
  const result = await neon.from('wilpay_loans').insert(attachment).select();
  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'WILPAY_PRIVATE_STORAGE_REQUIRED');
  assert.equal(neon.inserts.length, 0, 'partial rollout must never persist binary in AUREON');
}

{
  const neon = fakeNeon();
  const routed = [];
  const persistAttachment = async input => {
    routed.push(input);
    return {
      data: [{ record_type: 'ATTACHMENT', object_key: 'wilpay/users/user-1/loans/loan-1/document.jpg' }],
      error: null,
      storage_mode: 'private'
    };
  };

  installWilpayLegacyAttachmentWriteGuard(neon, privateStatus, persistAttachment);
  const result = await neon.from('wilpay_loans').insert(attachment).select();

  assert.equal(result.error, null);
  assert.equal(result.storage_mode, 'private');
  assert.equal(routed.length, 1, 'ready private rollout must route through the Storage-first adapter');
  assert.equal(routed[0].authUid, attachment.auth_uid);
  assert.equal(routed[0].loanId, attachment.loan_id);
  assert.equal(routed[0].docType, attachment.doc_type);
  assert.equal(routed[0].file.data_url, attachment.data_url);
  assert.equal(typeof routed[0].runtimeStatus, 'function');
  assert.equal(neon.inserts.length, 0, 'routed binary attachment must never reach the legacy AUREON table');
}

{
  const neon = fakeNeon();
  const routed = [];
  installWilpayLegacyAttachmentWriteGuard(neon, privateStatus, async input => {
    routed.push(input);
    return { data: [{ record_type: 'ATTACHMENT', file_id: 'receipt-1' }], error: null, storage_mode: 'private' };
  });
  const receipt = {
    ...attachment,
    doc_type: 'COMPROVANTE_PAGAMENTO',
    file_name: 'comprovante.jpg'
  };
  const result = await neon.from('wilpay_loans').insert(receipt).select();
  assert.equal(result.error, null);
  assert.equal(result.storage_mode, 'private');
  assert.equal(routed.length, 1, 'ADM payout receipt must use the same private Storage route');
  assert.equal(routed[0].docType, 'COMPROVANTE_PAGAMENTO');
  assert.equal(neon.inserts.length, 0, 'payout receipt binary must not reach AUREON when private Storage is ready');
}

{
  const neon = fakeNeon();
  let calls = 0;
  installWilpayLegacyAttachmentWriteGuard(neon, privateStatus, async () => { calls += 1; return { data: [], error: null }; });
  const unsupported = { ...attachment, doc_type: 'ARQUIVO_DESCONHECIDO' };
  const result = await neon.from('wilpay_loans').insert(unsupported).select();
  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'WILPAY_PRIVATE_STORAGE_REQUIRED');
  assert.equal(calls, 0, 'unsupported attachment types must fail closed before private persistence');
  assert.equal(neon.inserts.length, 0, 'unsupported binary must never reach AUREON');
}

{
  const neon = fakeNeon();
  let calls = 0;
  installWilpayLegacyAttachmentWriteGuard(neon, privateStatus, async () => { calls += 1; return { data: [], error: null }; });
  const metadataOnly = { record_type: 'ATTACHMENT', object_key: 'wilpay/users/u/loans/1/document.jpg' };
  const result = await neon.from('wilpay_loans').insert(metadataOnly).select();
  assert.equal(result.error, null);
  assert.equal(neon.inserts.length, 1, 'metadata-only records remain allowed');
  assert.equal(calls, 0, 'metadata-only persistence must not be rerouted');
}

console.log('PASS wilpayLegacyAttachmentWriteGuard');
