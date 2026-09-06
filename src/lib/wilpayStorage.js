const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const STORAGE_SCOPE = 'wilpay-private';
const STORAGE_BUCKET = 'wilpay-private-documents';
const ALLOWED_KINDS = new Set(['document', 'selfie', 'receipt', 'guarantee', 'history']);
const KIND_ALIASES = Object.freeze({
  proof: 'receipt',
  collateral: 'guarantee'
});
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

function normalizeKind(kind) {
  const safeKind = safeSegment(kind, 'kind');
  const canonicalKind = KIND_ALIASES[safeKind] ?? safeKind;
  if (!ALLOWED_KINDS.has(canonicalKind)) throw new Error('Invalid kind');
  return canonicalKind;
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

function normalizeCreatedAt(createdAt) {
  const date = createdAt == null ? new Date() : new Date(createdAt);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid createdAt');
  return date.toISOString();
}

export function validateWilpayUpload(file, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!file || typeof file !== 'object') throw new Error('File is required');
  const size = Number(file.size);
  const mimeType = String(file.type || '').toLowerCase();
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes) throw new Error('File size is not allowed');
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('File type is not allowed');
  return { size, mimeType, extension: extensionForMime(mimeType) };
}

export async function sha256WilpayFile(file) {
  validateWilpayUpload(file);
  if (typeof file.arrayBuffer !== 'function') throw new Error('File content is not readable');
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 is unavailable');
  const bytes = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareWilpayPrivateUpload({
  userId,
  loanId,
  kind,
  fileId,
  file,
  storageProvider,
  createdAt
}) {
  const checksumSha256 = await sha256WilpayFile(file);
  const metadata = buildWilpayFileMetadata({
    userId,
    loanId,
    kind,
    fileId,
    file,
    checksumSha256,
    storageProvider,
    createdAt
  });
  assertWilpayFileMetadata(metadata);
  return Object.freeze({
    file,
    metadata: Object.freeze(metadata)
  });
}

export function buildWilpayObjectKey({ userId, loanId, kind, fileId, mimeType }) {
  const safeUserId = safeSegment(userId, 'userId');
  const safeLoanId = safeSegment(loanId, 'loanId');
  const safeFileId = safeSegment(fileId, 'fileId');
  const canonicalKind = normalizeKind(kind);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('Invalid mimeType');
  return `wilpay/users/${safeUserId}/loans/${safeLoanId}/${canonicalKind}/${safeFileId}.${extensionForMime(mimeType)}`;
}

export function buildWilpayFileMetadata({
  userId,
  loanId,
  kind,
  fileId,
  file,
  checksumSha256,
  storageProvider,
  createdAt
}) {
  const { size, mimeType } = validateWilpayUpload(file);
  const safeProvider = safeSegment(storageProvider, 'storageProvider');
  const canonicalKind = normalizeKind(kind);
  const objectKey = buildWilpayObjectKey({ userId, loanId, kind: canonicalKind, fileId, mimeType });
  return {
    file_id: safeSegment(fileId, 'fileId'),
    owner_user_id: safeSegment(userId, 'userId'),
    loan_id: safeSegment(loanId, 'loanId'),
    document_type: canonicalKind,
    kind: canonicalKind,
    storage_provider: safeProvider,
    bucket: STORAGE_BUCKET,
    object_key: objectKey,
    content_type: mimeType,
    mime_type: mimeType,
    size_bytes: size,
    checksum_sha256: normalizeChecksum(checksumSha256, { required: true }),
    created_at: normalizeCreatedAt(createdAt),
    storage_scope: STORAGE_SCOPE,
    visibility: 'private'
  };
}

export function assertWilpayFileMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Metadata is required');
  if (metadata.storage_scope !== STORAGE_SCOPE || metadata.visibility !== 'private') {
    throw new Error('Metadata must remain in W.I.L Pay private storage');
  }
  if (metadata.bucket !== STORAGE_BUCKET) throw new Error('Metadata bucket must remain W.I.L Pay private');
  safeSegment(metadata.storage_provider, 'storageProvider');
  const documentType = metadata.document_type ?? metadata.kind;
  const canonicalDocumentType = normalizeKind(documentType);
  if (documentType !== canonicalDocumentType) {
    throw new Error('Metadata document_type must use the canonical W.I.L Pay storage type');
  }
  const expectedKey = buildWilpayObjectKey({
    userId: metadata.owner_user_id,
    loanId: metadata.loan_id,
    kind: canonicalDocumentType,
    fileId: metadata.file_id,
    mimeType: metadata.content_type ?? metadata.mime_type
  });
  if (metadata.object_key !== expectedKey) throw new Error('Metadata object_key does not match owner/loan scope');
  const size = Number(metadata.size_bytes);
  if (!Number.isFinite(size) || size <= 0 || size > DEFAULT_MAX_BYTES) throw new Error('Metadata size is not allowed');
  normalizeChecksum(metadata.checksum_sha256, { required: true });
  normalizeCreatedAt(metadata.created_at);
  return true;
}

export const WILPAY_STORAGE_LIMITS = Object.freeze({
  maxBytesPerFile: DEFAULT_MAX_BYTES,
  bucket: STORAGE_BUCKET,
  allowedKinds: Object.freeze([...ALLOWED_KINDS]),
  allowedMimeTypes: Object.freeze([...ALLOWED_MIME_TYPES])
});

export const WILPAY_REQUIRED_FILE_METADATA = Object.freeze([
  'file_id',
  'owner_user_id',
  'loan_id',
  'document_type',
  'storage_provider',
  'bucket',
  'object_key',
  'content_type',
  'size_bytes',
  'checksum_sha256',
  'created_at'
]);