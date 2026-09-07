import { prepareWilpayPrivateUpload } from './wilpayStorage.js';
import { buildWilpaySignedUploadRequest, uploadWilpayPrivateFile } from './wilpaySignedUpload.js';

function assertFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
}

function assertMetadataOnlyPayload(metadata) {
  const forbiddenKeys = ['file', 'blob', 'bytes', 'buffer', 'base64', 'content', 'data_url', 'upload_url', 'signed_url'];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new Error(`Metadata payload must not contain ${key}`);
    }
  }
  return true;
}

function decodeBase64(value) {
  if (typeof atob === 'function') {
    const decoded = atob(value);
    return Uint8Array.from(decoded, char => char.charCodeAt(0));
  }
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
  throw new Error('Base64 decoding is unavailable');
}

export function wilpayFileFromCompactedInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Compacted file is required');
  if (typeof input.arrayBuffer === 'function') return input;

  const raw = String(input.data_url || '');
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) throw new Error('Compacted file data URL is invalid');

  const declaredType = String(input.type || '').trim().toLowerCase();
  const embeddedType = String(match[1] || '').trim().toLowerCase();
  if (!declaredType || declaredType !== embeddedType) throw new Error('Compacted file MIME type mismatch');

  const bytes = decodeBase64(match[2]);
  const declaredSize = Number(input.size);
  if (Number.isFinite(declaredSize) && declaredSize > 0 && declaredSize !== bytes.byteLength) {
    throw new Error('Compacted file size mismatch');
  }

  return Object.freeze({
    name: String(input.name || 'wilpay-upload'),
    type: embeddedType,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  });
}

export async function uploadWilpayFileToPrivateStorage({
  userId,
  loanId,
  kind,
  fileId,
  file,
  storageProvider,
  createdAt,
  requestUploadGrant,
  persistFileMetadata,
  allowedUploadOrigins,
  fetchImpl
}) {
  assertFunction(requestUploadGrant, 'requestUploadGrant');
  assertFunction(persistFileMetadata, 'persistFileMetadata');

  const storageFile = wilpayFileFromCompactedInput(file);
  const prepared = await prepareWilpayPrivateUpload({
    userId,
    loanId,
    kind,
    fileId,
    file: storageFile,
    storageProvider,
    createdAt
  });

  const grantRequest = buildWilpaySignedUploadRequest(prepared.metadata);
  const grant = await requestUploadGrant(grantRequest);

  const uploaded = await uploadWilpayPrivateFile({
    file: prepared.file,
    metadata: prepared.metadata,
    grant,
    allowedUploadOrigins,
    fetchImpl
  });

  assertMetadataOnlyPayload(prepared.metadata);

  // Persist metadata only after the object upload succeeds. This keeps Neon/AUREON
  // free of document binaries and avoids marking failed uploads as completed.
  const persisted = await persistFileMetadata({ ...prepared.metadata });

  return Object.freeze({
    file_id: uploaded.file_id,
    bucket: uploaded.bucket,
    object_key: uploaded.object_key,
    checksum_sha256: uploaded.checksum_sha256,
    persisted: persisted ?? null
  });
}

export const WILPAY_FORBIDDEN_DATABASE_FILE_FIELDS = Object.freeze([
  'file',
  'blob',
  'bytes',
  'buffer',
  'base64',
  'content',
  'data_url',
  'upload_url',
  'signed_url'
]);
