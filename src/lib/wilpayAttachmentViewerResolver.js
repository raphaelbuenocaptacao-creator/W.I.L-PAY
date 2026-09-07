import { resolveWilpayPrivateViewerSource } from './wilpayPrivateViewerGrant.js';
import { isWilpayViewerSource, mimeFromViewerSource } from './wilpayViewerSource.js';

function legacyViewerSource(record) {
  const source = String(record?.data_url || '').trim();
  if (!source) return null;
  const mimeType = mimeFromViewerSource(source, record?.mime_type);
  if (!isWilpayViewerSource(source, { privateFile: false })) {
    throw new Error('Invalid legacy viewer source');
  }
  if (!mimeType) throw new Error('Unsupported legacy viewer MIME type');
  return Object.freeze({
    mode: 'legacy',
    source,
    mime_type: mimeType,
    file_id: record?.file_id || null,
    expires_at: null
  });
}

export async function resolveWilpayAttachmentViewer({
  record,
  requestViewerGrant,
  now = Date.now()
}) {
  if (!record || typeof record !== 'object') throw new Error('record is required');

  // Metadata-only records are always resolved through a short-lived private grant.
  if (record.file_id || record.object_key) {
    if (!record.file_id || !record.object_key) {
      throw new Error('Incomplete private attachment metadata');
    }
    const resolved = await resolveWilpayPrivateViewerSource({
      metadata: record,
      requestViewerGrant,
      now
    });
    return Object.freeze({ mode: 'private', ...resolved });
  }

  // Legacy data URLs stay readable during migration, but only after the same
  // source/MIME validation used by the viewer security layer.
  const legacy = legacyViewerSource(record);
  if (legacy) return legacy;

  throw new Error('Attachment has no viewable source');
}
