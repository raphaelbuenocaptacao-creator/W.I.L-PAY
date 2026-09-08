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

{
  const neon = fakeNeon();
  installWilpayLegacyAttachmentWriteGuard(neon, legacyStatus);
  const result = await neon.from('wilpay_loans').insert({
    record_type: 'ATTACHMENT',
    data_url: 'data:image/jpeg;base64,AA=='
  }).select();
  assert.equal(result.error, null);
  assert.equal(neon.inserts.length, 1, 'legacy bridge must still work before private rollout starts');
}

for (const runtimeStatus of [partialStatus, privateStatus]) {
  const neon = fakeNeon();
  installWilpayLegacyAttachmentWriteGuard(neon, runtimeStatus);
  const result = await neon.from('wilpay_loans').insert({
    record_type: 'ATTACHMENT',
    data_url: 'data:image/jpeg;base64,AA=='
  }).select();
  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'WILPAY_PRIVATE_STORAGE_REQUIRED');
  assert.equal(neon.inserts.length, 0, 'binary attachment must never reach AUREON after rollout starts');
}

{
  const neon = fakeNeon();
  installWilpayLegacyAttachmentWriteGuard(neon, privateStatus);
  const metadataOnly = { record_type: 'ATTACHMENT', object_key: 'wilpay/users/u/loans/1/document.jpg' };
  const result = await neon.from('wilpay_loans').insert(metadataOnly).select();
  assert.equal(result.error, null);
  assert.equal(neon.inserts.length, 1, 'metadata-only records remain allowed');
}

console.log('PASS wilpayLegacyAttachmentWriteGuard');
