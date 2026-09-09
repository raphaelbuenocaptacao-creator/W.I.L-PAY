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

function defaultRequestId() {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') throw new Error('Secure request id generator is unavailable');
  return randomUUID.call(globalThis.crypto);
}

function safeAudit(onAudit, event) {
  if (typeof onAudit !== 'function') return;
  try {
    onAudit(Object.freeze({
      event: 'wilpay.storage.upload_grant',
      ...event
    }));
  } catch {
    // Audit sinks are observational only; never expose or retry sensitive request data here.
  }
}

function auditContext(payload) {
  return Object.freeze({
    document_type: payload.document_type,
    content_type: String(payload.content_type).toLowerCase(),
    size_bytes: Number(payload.size_bytes)
  });
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

function assertWilpayUploadGrantResponse(grant, payload, requestId) {
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
    throw new Error('Upload grant response is invalid');
  }
  if (grant.request_id != null && safeId(grant.request_id, 'upload grant request_id') !== requestId) {
    throw new Error('Upload grant response request_id mismatch');
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
  return ttlMs;
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
  fetchImpl = fetch,
  onAudit,
  createRequestId = defaultRequestId
} = {}) {
  const url = parseGrantEndpoint(endpoint);
  if (typeof getAccessToken !== 'function') throw new Error('getAccessToken is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');
  if (onAudit != null && typeof onAudit !== 'function') throw new Error('onAudit must be a function');
  if (typeof createRequestId !== 'function') throw new Error('createRequestId must be a function');

  return async function requestWilpayUploadGrant(payload) {
    assertWilpayUploadGrantPayload(payload);
    const context = auditContext(payload);
    safeAudit(onAudit, { phase: 'request', outcome: 'accepted', ...context });

    const requestId = safeId(await createRequestId(), 'upload request_id');
    const accessToken = requiredText(await getAccessToken(), 'W.I.L Pay access token');
    const requestPayload = Object.freeze({ ...payload, request_id: requestId });
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-WILPay-Request-ID': requestId
      },
      body: JSON.stringify(requestPayload),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });

    if (!response?.ok) {
      safeAudit(onAudit, {
        phase: 'response',
        outcome: 'rejected',
        http_status: Number.isInteger(response?.status) ? response.status : null,
        ...context
      });
      throw new Error(`Upload grant request failed (${response?.status ?? 'unknown'})`);
    }

    const grant = await response.json();
    const ttlMs = assertWilpayUploadGrantResponse(grant, payload, requestId);
    safeAudit(onAudit, {
      phase: 'response',
      outcome: 'issued',
      ttl_seconds: Math.floor(ttlMs / 1000),
      ...context
    });
    return grant;
  };
}
