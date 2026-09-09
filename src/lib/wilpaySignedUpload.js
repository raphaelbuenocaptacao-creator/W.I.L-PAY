import { assertWilpayFileMetadata, sha256WilpayFile, WILPAY_STORAGE_LIMITS } from './wilpayStorage.js';

const HTTPS_PROTOCOL = 'https:';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function configuredUploadOrigins() {
  const raw = import.meta.env?.VITE_WILPAY_STORAGE_UPLOAD_ORIGINS;
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function normalizeAllowedUploadOrigins(values) {
  const list = values ?? configuredUploadOrigins();
  if (!Array.isArray(list)) throw new Error('Allowed upload origins must be a list');
  return new Set(list.map(value => {
    let url;
    try {
      url = new URL(String(value || ''));
    } catch {
      throw new Error('Invalid allowed upload origin');
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Invalid allowed upload origin');
    }
    if (url.protocol !== HTTPS_PROTOCOL && !LOCAL_HOSTS.has(url.hostname)) {
      throw new Error('Allowed upload origin must use HTTPS');
    }
    return url.origin;
  }));
}

function parseUploadUrl(value, allowedUploadOrigins) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('Invalid signed upload URL');
  }
  if (url.username || url.password) throw new Error('Signed upload URL must not contain credentials');
  if (url.protocol !== HTTPS_PROTOCOL && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('Signed upload URL must use HTTPS');
  }
  const allowedOrigins = normalizeAllowedUploadOrigins(allowedUploadOrigins);
  if (allowedOrigins.size === 0) {
    throw new Error('W.I.L Pay private storage upload origin is not configured');
  }
  if (!allowedOrigins.has(url.origin)) {
    throw new Error('Signed upload URL origin is not allowed for W.I.L Pay private storage');
  }
  return url;
}

function assertWilpayNewUploadNamespace(metadata) {
  const objectKey = String(metadata?.object_key || '');
  const requiredPrefix = `${WILPAY_STORAGE_LIMITS.rootPrefix}/`;
  if (!objectKey.startsWith(requiredPrefix)) {
    throw new Error('New W.I.L Pay uploads must use the production private storage namespace');
  }
  return true;
}

export function assertWilpaySignedUploadGrant(grant, metadata, { allowedUploadOrigins } = {}) {
  if (!grant || typeof grant !== 'object') throw new Error('Upload grant is required');
  if (!metadata || typeof metadata !== 'object') throw new Error('Metadata is required');
  assertWilpayFileMetadata(metadata);
  assertWilpayNewUploadNamespace(metadata);
  if (grant.bucket !== metadata.bucket) throw new Error('Upload grant bucket mismatch');
  if (grant.object_key !== metadata.object_key) throw new Error('Upload grant object key mismatch');
  if (grant.content_type !== metadata.content_type) throw new Error('Upload grant content type mismatch');
  if (grant.checksum_sha256 !== metadata.checksum_sha256) throw new Error('Upload grant checksum mismatch');
  if (grant.method !== 'PUT') throw new Error('Upload grant must use PUT');
  parseUploadUrl(grant.upload_url, allowedUploadOrigins);
  const expiresAt = new Date(grant.expires_at);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('Invalid upload grant expiry');
  const ttlMs = expiresAt.getTime() - Date.now();
  if (ttlMs <= 0 || ttlMs > 10 * 60 * 1000) throw new Error('Upload grant expiry is not allowed');
  return true;
}

export function buildWilpaySignedUploadRequest(metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Metadata is required');
  assertWilpayFileMetadata(metadata);
  assertWilpayNewUploadNamespace(metadata);
  return Object.freeze({
    file_id: metadata.file_id,
    owner_user_id: metadata.owner_user_id,
    loan_id: metadata.loan_id,
    document_type: metadata.document_type,
    bucket: metadata.bucket,
    object_key: metadata.object_key,
    content_type: metadata.content_type,
    size_bytes: metadata.size_bytes,
    checksum_sha256: metadata.checksum_sha256
  });
}

export async function assertWilpayUploadContent(file, metadata) {
  if (!file || typeof file !== 'object') throw new Error('File is required');
  assertWilpayFileMetadata(metadata);
  assertWilpayNewUploadNamespace(metadata);
  if (Number(file.size) !== Number(metadata.size_bytes)) throw new Error('Upload file size mismatch');
  if (String(file.type || '').toLowerCase() !== String(metadata.content_type || '').toLowerCase()) {
    throw new Error('Upload file content type mismatch');
  }
  const checksum = await sha256WilpayFile(file);
  if (checksum !== metadata.checksum_sha256) throw new Error('Upload file checksum mismatch');
  return true;
}

export async function uploadWilpayPrivateFile({
  file,
  metadata,
  grant,
  allowedUploadOrigins,
  fetchImpl = fetch
}) {
  assertWilpaySignedUploadGrant(grant, metadata, { allowedUploadOrigins });
  await assertWilpayUploadContent(file, metadata);
  const response = await fetchImpl(grant.upload_url, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': metadata.content_type
    },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer'
  });
  if (!response?.ok) throw new Error(`Private upload failed (${response?.status ?? 'unknown'})`);
  return Object.freeze({
    file_id: metadata.file_id,
    bucket: metadata.bucket,
    object_key: metadata.object_key,
    checksum_sha256: metadata.checksum_sha256
  });
}
