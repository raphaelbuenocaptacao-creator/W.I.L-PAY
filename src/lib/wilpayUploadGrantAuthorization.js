import { assertWilpayUploadGrantServerPolicy } from './wilpayUploadGrantServerPolicy.js';

/**
 * Backend-only authorization gate for private upload grants.
 *
 * The caller must provide an atomic consumeGrantNonce adapter backed by the
 * dedicated W.I.L Pay database (for example wilpay_consume_upload_grant).
 * This module never signs URLs and never handles provider credentials.
 */
export async function authorizeWilpayUploadGrant(
  payload,
  { authenticatedUserId, consumeGrantNonce } = {}
) {
  if (typeof consumeGrantNonce !== 'function') {
    throw new Error('Atomic upload grant nonce consumer is required');
  }

  const normalized = assertWilpayUploadGrantServerPolicy(payload, {
    authenticatedUserId
  });

  const consumed = await consumeGrantNonce({
    request_id: normalized.request_id,
    owner_user_id: normalized.owner_user_id,
    file_id: normalized.file_id,
    object_key: normalized.object_key
  });

  if (consumed !== true) {
    throw new Error('Upload grant nonce is invalid, expired, or already consumed');
  }

  return normalized;
}
