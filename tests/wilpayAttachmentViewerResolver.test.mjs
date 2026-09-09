import assert from 'node:assert/strict';
import { resolveWilpayAttachmentViewer } from '../src/lib/wilpayAttachmentViewerResolver.js';

const legacy = await resolveWilpayAttachmentViewer({
  record: {
    doc_type: 'DOCUMENTO_FOTO',
    mime_type: 'image/jpeg',
    data_url: 'data:image/jpeg;base64,aGVsbG8='
  }
});
assert.equal(legacy.mode, 'legacy');
assert.equal(legacy.mime_type, 'image/jpeg');
assert.match(legacy.source, /^data:image\/jpeg;base64,/);

let viewerGrantCalls = 0;
const privateResult = await resolveWilpayAttachmentViewer({
  record: {
    file_id: 'file-123',
    auth_uid: 'u1',
    object_key: 'wilpay/production/u1/documents/file-123',
    mime_type: 'image/jpeg'
  },
  requestViewerGrant: async ({ file_id, object_key, owner_user_id }) => {
    viewerGrantCalls += 1;
    assert.equal(file_id, 'file-123');
    assert.equal(owner_user_id, 'u1');
    assert.equal(object_key, 'wilpay/production/u1/documents/file-123');
    return {
      signed_url: 'https://storage.wilpay.example/private/file-123.jpg?signature=redacted',
      expires_at: '2029-01-01T00:04:00.000Z'
    };
  },
  now: Date.parse('2029-01-01T00:00:00.000Z')
});
assert.equal(privateResult.mode, 'private');
assert.equal(privateResult.file_id, 'file-123');
assert.equal(viewerGrantCalls, 1);
assert.ok(!('data_url' in privateResult));

await assert.rejects(
  resolveWilpayAttachmentViewer({
    record: { file_id: 'file-only', mime_type: 'image/jpeg' },
    requestViewerGrant: async () => { throw new Error('must not run'); }
  }),
  /Incomplete private attachment metadata/
);

await assert.rejects(
  resolveWilpayAttachmentViewer({
    record: { mime_type: 'text/html', data_url: 'data:text/html;base64,PGgxPk5vPC9oMT4=' }
  }),
  /Invalid legacy viewer source|Unsupported legacy viewer MIME type/
);

console.log('wilpayAttachmentViewerResolver: PASS');
