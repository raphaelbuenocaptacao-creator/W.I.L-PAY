const REQUIRED_UPLOAD_FIELDS = ['file_id', 'bucket', 'object_key', 'checksum_sha256'];
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function positiveSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) throw new Error('file size must be positive');
  return Math.trunc(size);
}

function optionalUploadId(value) {
  if (value == null || value === '') return null;
  const uploadId = requiredText(value, 'upload.upload_id').toLowerCase();
  if (!UUID_V4_PATTERN.test(uploadId)) throw new Error('upload.upload_id must be a UUID v4');
  return uploadId;
}

export function buildWilpayAttachmentRecord({
  authUid,
  loanId,
  docType,
  file,
  upload,
  storageProvider = 'private',
  createdAt = new Date().toISOString()
}) {
  if (!file || typeof file !== 'object') throw new Error('file metadata is required');
  if (!upload || typeof upload !== 'object') throw new Error('private upload result is required');

  for (const key of REQUIRED_UPLOAD_FIELDS) requiredText(upload[key], `upload.${key}`);
  const uploadId = optionalUploadId(upload.upload_id);

  const record = {
    record_type: 'ATTACHMENT',
    auth_uid: requiredText(authUid, 'authUid'),
    loan_id: requiredText(loanId, 'loanId'),
    doc_type: requiredText(docType, 'docType'),
    file_name: requiredText(file.name, 'file.name'),
    mime_type: requiredText(file.type, 'file.type').toLowerCase(),
    size: positiveSize(file.size),
    storage_provider: requiredText(storageProvider, 'storageProvider'),
    file_id: requiredText(upload.file_id, 'upload.file_id'),
    ...(uploadId ? { upload_id: uploadId } : {}),
    bucket: requiredText(upload.bucket, 'upload.bucket'),
    object_key: requiredText(upload.object_key, 'upload.object_key'),
    checksum_sha256: requiredText(upload.checksum_sha256, 'upload.checksum_sha256').toLowerCase(),
    created_at: requiredText(createdAt, 'createdAt')
  };

  const forbidden = ['data_url', 'file', 'blob', 'buffer', 'base64', 'content', 'signed_url', 'upload_url'];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`attachment record must not contain ${key}`);
  }

  return Object.freeze(record);
}

export const WILPAY_ATTACHMENT_REQUIRED_STORAGE_FIELDS = Object.freeze([...REQUIRED_UPLOAD_FIELDS]);
