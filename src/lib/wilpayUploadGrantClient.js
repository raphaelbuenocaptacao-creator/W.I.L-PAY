import { WILPAY_STORAGE_LIMITS } from './wilpayStorage.js';

const HTTPS_PROTOCOL = 'https:';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const MAX_GRANT_TTL_MS = 10 * 60 * 1000;
const DOCUMENT_CATEGORY = Object.freeze({
  document: 'documents',
  selfie: 'selfies',
  receipt: 'receipts',
  guarantee: 'guarantees',
  history: 'history'
});

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

function assertWilpayUploadGrantPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Upload grant payload is required');
  }

  const fileId = safeId(payload.file_id, 'file_id');
  const ownerUserId = safeId(payload.owner_user_id, 'owner_user_id');
  safeId(payload.loan_id, 'loan_id');
  const documentType = requiredText(payload.document_type, 'document_type');
  const category = DOCUMENT_CATEGORY[documentType];
  if (!category) throw new Error('Invalid document_type');

  if (requiredText(payload.bucket, 'bucket') !== WILPAY_STORAGE_LIMITS.bucket) {
    throw new Error('Upload grant payload must use the W.I.L Pay private bucket');
  }

  const expectedObjectKey = `${WILPAY_STORAGE_LIMITS.rootPrefix}/${ownerUserId}/${category}/${fileId}`;
  if (requiredText(payload.object_key, 'object_key') !== expectedObjectKey) {
    throw new Error('Upload grant payload object_key does not match owner/category/file scope');
  }

  const contentType = requiredText(payload.content_type, 'content_type').toLowerCase();
  if (!WILPAY_STORAGE_LIMITS.allowedMimeTypes.includes(contentType)) {
    throw new Error('Invalid content_type');
  }

  const sizeBytes = Number(payload.size_bytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > WILPAY_STORAGE_LIMITS.maxBytesPerFile) {
    throw new Error('Invalid size_bytes');
  }

  const checksum = requiredText(payload.checksum_sha256, 'checksum_sha256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid checksum_sha256');

  return true;
}

function assertGrantUploadUrl(value) {
  let url;
  try {
    url = new URL(requiredText(value, 'upload_url'));
  } catch {
    throw new Error('Invalid upload grant upload_url');
  }
  if (url.username || url.password || url.hash) throw new Error('Invalid upload grant upload_url');
  if (url.protocol !== HTTPS_PROTOCOL && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('Upload grant upload_url must use HTTPS');
  }
  return true;
}

function assertWilpayUploadGrantResponse(grant, payload) {
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
    throw new Error('Upload grant response is invalid');
  }
  if (grant.method !== 'PUT') throw new Error('Upload grant response must use PUT');
  if (grant.bucket !== payload.bucket) throw new Error('Upload grant response bucket mismatch');
  if (grant.object_key !== payload.object_key) throw new Error('Upload grant response object_key mismatch');
  if (String(grant.content_type || '').toLowerCase() !== String(payload.content_type || '').toLowerCase()) {
    throw new Error('Upload grant response content_type mismatch');
  }
  if (String(grant.checksum_sha256 || '').toLowerCase() !== String(payload.checksum_sha256 || '').toLowerCase()) {
    throw new Error('Upload grant response checksum mismatch');
  }
  assertGrantUploadUrl(grant.upload_url);

  const expiresAt = new Date(grant.expires_at);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('Invalid upload grant response expiry');
  const ttlMs = expiresAt.getTime() - Date.now();
  if (ttlMs <= 0 || ttlMs > MAX_GRANT_TTL_MS) throw new Error('Upload grant response expiry is not allowed');
  return true;
}

function parseGrantEndpoint(value) {
  let url;
  try {
    url = new URL(requiredText(value, 'W.I.L Pay upload grant endpoint'));
  } catch {
    throw new Error('Invalid W.I.L Pay upload grant endpoint');
  }
  if (url.username || url.password || url.hash) throw new Error('Invalid W.I.L Pay upload grant endpoint');
  if (url.protocol !== HTTPS_PROTOCOL && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('W.I.L Pay upload grant endpoint must use HTTPS');
  }
  return url;
}

export function configuredWilpayUploadGrantEndpoint() {
  return String(import.meta.env?.VITE_WILPAY_UPLOAD_GRANT_ENDPOINT || '').trim() || null;
}

export function isWilpayPrivateUploadConfigured() {
  const endpoint = configuredWilpayUploadGrantEndpoint();
  if (!endpoint) return false;
  parseGrantEndpoint(endpoint);
  return true;
}

export function createWilpayUploadGrantRequester({
  endpoint = configuredWilpayUploadGrantEndpoint(),
  getAccessToken,
  fetchImpl = fetch
} = {}) {
  const url = parseGrantEndpoint(endpoint);
  if (typeof getAccessToken !== 'function') throw new Error('getAccessToken is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');

  return async function requestWilpayUploadGrant(payload) {
    assertWilpayUploadGrantPayload(payload);
    const accessToken = requiredText(await getAccessToken(), 'W.I.L Pay access token');
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });

    if (!response?.ok) throw new Error(`Upload grant request failed (${response?.status ?? 'unknown'})`);
    const grant = await response.json();
    assertWilpayUploadGrantResponse(grant, payload);
    return grant;
  };
}
