import { isWilpayViewerSource, mimeFromViewerSource } from './wilpayViewerSource.js';

function assertFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
}

function assertPrivateFileMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('metadata is required');
  if (!metadata.file_id) throw new Error('metadata.file_id is required');
  if (!metadata.object_key) throw new Error('metadata.object_key is required');
  if (!metadata.mime_type) throw new Error('metadata.mime_type is required');
  return metadata;
}

export async function resolveWilpayPrivateViewerSource({
  metadata,
  requestViewerGrant,
  now = Date.now()
}) {
  assertFunction(requestViewerGrant, 'requestViewerGrant');
  const safeMetadata = assertPrivateFileMetadata(metadata);

  const grant = await requestViewerGrant({
    file_id: safeMetadata.file_id,
    object_key: safeMetadata.object_key
  });

  const url = String(grant?.url || grant?.signed_url || '').trim();
  const expiresAt = grant?.expires_at ? Date.parse(grant.expires_at) : NaN;
  const mimeType = mimeFromViewerSource(url, safeMetadata.mime_type);

  if (!isWilpayViewerSource(url, { privateFile: true })) {
    throw new Error('Invalid private viewer URL');
  }
  if (!mimeType) throw new Error('Unsupported private viewer MIME type');
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error('Expired or invalid private viewer grant');
  }

  return Object.freeze({
    source: url,
    mime_type: mimeType,
    expires_at: new Date(expiresAt).toISOString(),
    file_id: safeMetadata.file_id
  });
}

export function stripEphemeralViewerFields(record = {}) {
  const { signed_url, viewer_url, upload_url, url, ...metadataOnly } = record;
  return metadataOnly;
}
