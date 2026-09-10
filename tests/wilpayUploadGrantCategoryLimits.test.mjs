import assert from 'node:assert/strict';
import { createWilpayUploadGrantRequester } from '../src/lib/wilpayUploadGrantClient.js';

const checksum = 'a'.repeat(64);
const requestId = 'category-limit-request';
let fetchCalls = 0;

const requester = createWilpayUploadGrantRequester({
  endpoint: 'https://api.wilpay.example/private-upload-grant',
  getAccessToken: async () => 'test-token',
  createRequestId: () => requestId,
  fetchImpl: async (_url, options) => {
    fetchCalls += 1;
    const body = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          request_id: requestId,
          method: 'PUT',
          bucket: body.bucket,
          object_key: body.object_key,
          content_type: body.content_type,
          checksum_sha256: body.checksum_sha256,
          upload_url: 'https://storage.wilpay.example/object',
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        };
      }
    };
  }
});

function payloadFor(documentType, category, sizeBytes) {
  return {
    file_id: 'file1',
    owner_user_id: 'user1',
    loan_id: 'loan1',
    document_type: documentType,
    bucket: 'wilpay-private-documents',
    object_key: `wilpay/production/user1/${category}/file1`,
    content_type: 'application/pdf',
    size_bytes: sizeBytes,
    checksum_sha256: checksum
  };
}

await assert.rejects(
  requester(payloadFor('selfie', 'selfies', 10 * 1024 * 1024 + 1)),
  /size_bytes for document_type/,
  'selfies above 10 MiB must be rejected before the grant backend'
);
await assert.rejects(
  requester(payloadFor('receipt', 'receipts', 10 * 1024 * 1024 + 1)),
  /size_bytes for document_type/,
  'receipts above 10 MiB must be rejected before the grant backend'
);
await assert.rejects(
  requester(payloadFor('document', 'documents', 15 * 1024 * 1024 + 1)),
  /size_bytes for document_type/,
  'documents above 15 MiB must be rejected before the grant backend'
);
await assert.rejects(
  requester(payloadFor('history', 'history', 15 * 1024 * 1024 + 1)),
  /size_bytes for document_type/,
  'history files above 15 MiB must be rejected before the grant backend'
);
assert.equal(fetchCalls, 0, 'oversized category payloads must not contact the grant backend');

const grant = await requester(payloadFor('guarantee', 'guarantees', 20 * 1024 * 1024));
assert.equal(grant.method, 'PUT');
assert.equal(fetchCalls, 1, 'a guarantee at the 20 MiB limit should reach the grant backend');

console.log('wilpayUploadGrantCategoryLimits.test.mjs PASS');
