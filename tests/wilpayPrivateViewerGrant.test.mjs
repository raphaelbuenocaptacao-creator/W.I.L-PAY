import assert from 'node:assert/strict';
import { resolveWilpayPrivateViewerSource, stripEphemeralViewerFields, WILPAY_MAX_VIEWER_GRANT_TTL_MS } from '../src/lib/wilpayPrivateViewerGrant.js';

const now = Date.now();
const future = new Date(now + 60_000).toISOString();
const metadata = {
  file_id: 'file-123',
  object_key: 'wilpay/users/u1/loans/l1/document/file-123.pdf',
  mime_type: 'application/pdf'
};

let requestPayload = null;
const resolved = await resolveWilpayPrivateViewerSource({
  metadata,
  now,
  requestViewerGrant: async (payload) => {
    requestPayload = payload;
    return {
      signed_url: 'https://storage.example.test/private/file-123.pdf?sig=temporary',
      expires_at: future
    };
  }
});

assert.deepEqual(requestPayload, {
  file_id: metadata.file_id,
  object_key: metadata.object_key
});
assert.equal(resolved.file_id, metadata.file_id);
assert.equal(resolved.mime_type, 'application/pdf');
assert.match(resolved.source, /^https:\/\//);
assert.equal(WILPAY_MAX_VIEWER_GRANT_TTL_MS, 5 * 60 * 1000);

await assert.rejects(
  resolveWilpayPrivateViewerSource({
    metadata,
    now,
    requestViewerGrant: async () => ({
      signed_url: 'https://storage.example.test/private/file-123.pdf',
      expires_at: new Date(now - 1000).toISOString()
    })
  }),
  /Expired or invalid private viewer grant/
);

await assert.rejects(
  resolveWilpayPrivateViewerSource({
    metadata,
    now,
    requestViewerGrant: async () => ({
      signed_url: 'https://storage.example.test/private/file-123.pdf?sig=too-long',
      expires_at: new Date(now + WILPAY_MAX_VIEWER_GRANT_TTL_MS + 1000).toISOString()
    })
  }),
  /Private viewer grant lifetime exceeds policy/
);

assert.deepEqual(
  stripEphemeralViewerFields({
    ...metadata,
    signed_url: 'secret-temporary-url',
    viewer_url: 'secret-temporary-url',
    upload_url: 'secret-temporary-url',
    url: 'secret-temporary-url',
    data_url: 'data:application/pdf;base64,private-binary',
    blob_url: 'blob:https://app.example.test/private',
    object_url: 'blob:https://app.example.test/object',
    preview_url: 'https://storage.example.test/private/preview?sig=temporary',
    checksum_sha256: 'abc'
  }),
  { ...metadata, checksum_sha256: 'abc' }
);

console.log('wilpayPrivateViewerGrant PASS');
