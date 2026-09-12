import { WILPAY_STORAGE_LIMITS } from './wilpayStorage.js';

const DOCUMENT_CATEGORY = Object.freeze({
  document: 'documents',
  selfie: 'selfies',
  receipt: 'receipts',
  guarantee: 'guarantees',
  history: 'history'
});

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function safeId(value, label) {
  const text = requiredText(value, label);
  if (text.length > 128 || !/^[A-Za-z0-9_-]+$/.test(text) || text === '.' || text === '..') {
    throw new Error(`Invalid ${label}`);
  }
  return text;
}

function uploadId(value) {
  const normalized = requiredText(value, 'upload_id').toLowerCase();
  if (!UUID_V4_PATTERN.test(normalized)) throw new Error('Invalid upload_id');
  return normalized;
}

function normalizedMime(value) {
  return requiredText(value, 'content_type').toLowerCase();
}

export function assertWilpayUploadGrantServerPolicy(payload, { authenticatedUserId } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Upload grant payload is required');
  }

  const requestId = safeId(payload.request_id, 'request_id');
  const immutableUploadId = uploadId(payload.upload_id);
  const ownerUserId = safeId(payload.owner_user_id, 'owner_user_id');
  const authUserId = safeId(authenticatedUserId, 'authenticated_user_id');
  if (ownerUserId !== authUserId) throw new Error('Upload owner does not match authenticated user');

  const fileId = safeId(payload.file_id, 'file_id');
  safeId(payload.loan_id, 'loan_id');

  const documentType = requiredText(payload.document_type, 'document_type');
  const category = DOCUMENT_CATEGORY[documentType];
  if (!category) throw new Error('Invalid document_type');

  if (requiredText(payload.bucket, 'bucket') !== WILPAY_STORAGE_LIMITS.bucket) {
    throw new Error('Upload must use the W.I.L Pay private bucket');
  }

  const expectedObjectKey = `${WILPAY_STORAGE_LIMITS.rootPrefix}/${ownerUserId}/${category}/${fileId}`;
  if (requiredText(payload.object_key, 'object_key') !== expectedObjectKey) {
    throw new Error('Upload object_key does not match authenticated owner/category/file scope');
  }

  const contentType = normalizedMime(payload.content_type);
  if (!WILPAY_STORAGE_LIMITS.allowedMimeTypes.includes(contentType)) {
    throw new Error('Invalid content_type');
  }

  const sizeBytes = Number(payload.size_bytes);
  const maxBytes = Number(WILPAY_STORAGE_LIMITS.maxBytesByKind?.[documentType]);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('Missing W.I.L Pay category size policy');
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw new Error('Invalid size_bytes for document_type');
  }

  const checksum = requiredText(payload.checksum_sha256, 'checksum_sha256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid checksum_sha256');

  for (const forbidden of ['upload_url', 'signed_url', 'service_role', 'token', 'secret', 'file_data', 'base64', 'blob']) {
    if (payload[forbidden] != null) throw new Error(`Forbidden upload grant field: ${forbidden}`);
  }

  return Object.freeze({
    request_id: requestId,
    upload_id: immutableUploadId,
    owner_user_id: ownerUserId,
    file_id: fileId,
    loan_id: String(payload.loan_id),
    document_type: documentType,
    bucket: WILPAY_STORAGE_LIMITS.bucket,
    object_key: expectedObjectKey,
    content_type: contentType,
    size_bytes: sizeBytes,
    checksum_sha256: checksum
  });
}
