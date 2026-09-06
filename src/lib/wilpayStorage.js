const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const STORAGE_SCOPE = 'wilpay-private';
const ALLOWED_KINDS = new Set(['document', 'selfie', 'proof', 'collateral', 'history']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function safeSegment(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > 128) throw new Error(`Invalid ${label}`);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized) || normalized === '.' || normalized === '..') {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function extensionForMime(mimeType) {
  return ({
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  })[mimeType];
}

function normalizeChecksum(checksumSha256, { required = false } = {}) {
  if (checksumSha256 == null || checksumSha256 === '') {
    if (required) throw new Error('checksumSha256 is required for new private uploads');
    return null;
  }
  const normalized = String(checksumSha256).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error('Invalid checksumSha256');
  return normalized;
}

export function validateWilpayUpload(file, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!file || typeof file !== 'object') throw new Error('File is required');
  const size = Number(file.size);
  const mimeType = String(file.type || '').toLowerCase();
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes) throw new Error('File size is not allowed');
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('File type is not allowed');
  return { size, mimeType, extension: extensionForMime(mimeType) };
}

export function buildWilpayObjectKey({ userId, loanId, kind, fileId, mimeType }) {
  const safeUserId = safeSegment(userId, 'userId');
  const safeLoanId = safeSegment(loanId, 'loanId');
  const safeFileId = safeSegment(fileId, 'fileId');
  const safeKind = safeSegment(kind, 'kind');
  if (!ALLOWED_KINDS.has(safeKind)) throw new Error('Invalid kind');
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('Invalid mimeType');
  return `wilpay/users/${safeUserId}/loans/${safeLoanId}/${safeKind}/${safeFileId}.${extensionForMime(mimeType)}`;
}

export function buildWilpayFileMetadata({ userId, loanId, kind, fileId, file, checksumSha256 }) {
  const { size, mimeType } = validateWilpayUpload(file);
  const objectKey = buildWilpayObjectKey({ userId, loanId, kind, fileId, mimeType });
  return {
    file_id: safeSegment(fileId, 'fileId'),
    owner_user_id: safeSegment(userId, 'userId'),
    loan_id: safeSegment(loanId, 'loanId'),
    kind,
    object_key: objectKey,
    mime_type: mimeType,
    size_bytes: size,
    checksum_sha256: normalizeChecksum(checksumSha256, { required: true }),
    storage_scope: STORAGE_SCOPE,
    visibility: 'private'
  };
}

export function assertWilpayFileMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Metadata is required');
  if (metadata.storage_scope !== STORAGE_SCOPE || metadata.visibility !== 'private') {
    throw new Error('Metadata must remain in W.I.L Pay private storage');
  }
  const expectedKey = buildWilpayObjectKey({
    userId: metadata.owner_user_id,
    loanId: metadata.loan_id,
    kind: metadata.kind,
    fileId: metadata.file_id,
    mimeType: metadata.mime_type
  });
  if (metadata.object_key !== expectedKey) throw new Error('Metadata object_key does not match owner/loan scope');
  const size = Number(metadata.size_bytes);
  if (!Number.isFinite(size) || size <= 0 || size > DEFAULT_MAX_BYTES) throw new Error('Metadata size is not allowed');
  normalizeChecksum(metadata.checksum_sha256, { required: true });
  return true;
}

export const WILPAY_STORAGE_LIMITS = Object.freeze({
  maxBytesPerFile: DEFAULT_MAX_BYTES,
  allowedKinds: Object.freeze([...ALLOWED_KINDS]),
  allowedMimeTypes: Object.freeze([...ALLOWED_MIME_TYPES])
});
