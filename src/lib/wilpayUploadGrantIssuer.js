import { authorizeWilpayUploadGrant } from './wilpayUploadGrantAuthorization.js';

const MAX_GRANT_TTL_MS = 10 * 60 * 1000;

function requiredSigner(value) {
  if (typeof value !== 'function') throw new Error('Private storage upload signer is required');
  return value;
}

function assertSafeSignedGrant(grant, authorized, nowMs) {
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) {
    throw new Error('Private storage signer returned an invalid grant');
  }

  if (grant.request_id !== authorized.request_id) throw new Error('Signed grant request_id mismatch');
  if (grant.bucket !== authorized.bucket) throw new Error('Signed grant bucket mismatch');
  if (grant.object_key !== authorized.object_key) throw new Error('Signed grant object_key mismatch');
  if (grant.content_type !== authorized.content_type) throw new Error('Signed grant content_type mismatch');
  if (grant.checksum_sha256 !== authorized.checksum_sha256) throw new Error('Signed grant checksum mismatch');
  if (grant.method !== 'PUT') throw new Error('Signed grant must use PUT');

  const expiresAtMs = new Date(grant.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs - nowMs > MAX_GRANT_TTL_MS) {
    throw new Error('Signed grant expiry is not allowed');
  }

  if (typeof grant.upload_url !== 'string' || !grant.upload_url.trim()) {
    throw new Error('Signed grant upload_url is required');
  }

  for (const forbidden of ['service_role', 'token', 'secret', 'file_data', 'base64', 'blob']) {
    if (grant[forbidden] != null) throw new Error(`Forbidden signed grant field: ${forbidden}`);
  }

  return Object.freeze({
    request_id: authorized.request_id,
    bucket: authorized.bucket,
    object_key: authorized.object_key,
    content_type: authorized.content_type,
    checksum_sha256: authorized.checksum_sha256,
    method: 'PUT',
    upload_url: grant.upload_url,
    expires_at: grant.expires_at
  });
}

/**
 * Backend-only orchestration for a private W.I.L Pay upload grant.
 * Authorization and atomic nonce consumption always happen before the signer.
 * Provider credentials remain inside the injected signer and are never returned.
 */
export async function issueWilpaySignedUploadGrant(
  payload,
  { authenticatedUserId, consumeGrantNonce, signPrivateUpload, now = () => Date.now() } = {}
) {
  const signer = requiredSigner(signPrivateUpload);
  const authorized = await authorizeWilpayUploadGrant(payload, {
    authenticatedUserId,
    consumeGrantNonce
  });

  const nowMs = Number(now());
  if (!Number.isFinite(nowMs)) throw new Error('Invalid grant clock');

  const signed = await signer(authorized);
  return assertSafeSignedGrant(signed, authorized, nowMs);
}
