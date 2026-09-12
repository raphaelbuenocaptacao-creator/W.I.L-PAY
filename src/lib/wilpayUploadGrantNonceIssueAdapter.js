const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function extractIssued(result) {
  const row = Array.isArray(result)
    ? result[0]
    : Array.isArray(result?.rows)
      ? result.rows[0]
      : null;

  return row?.issued === true;
}

/**
 * Server-only adapter for the dedicated W.I.L Pay database.
 *
 * `query` must execute parameterized SQL against the exclusive W.I.L Pay Neon
 * project. Credentials and connection strings stay outside this module.
 * Conflicts or unexpected database result shapes fail closed by returning false.
 */
export function createWilpayUploadGrantNonceIssueAdapter({ query } = {}) {
  if (typeof query !== 'function') {
    throw new Error('W.I.L Pay nonce issue database query function is required');
  }

  return async function issueWilpayUploadGrantNonce(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('W.I.L Pay upload grant nonce request is required');
    }

    const requestId = requiredText(raw.request_id, 'nonce request_id');
    const uploadId = requiredText(raw.upload_id, 'nonce upload_id');
    const ownerUserId = requiredText(raw.owner_user_id, 'nonce owner_user_id');
    const fileId = requiredText(raw.file_id, 'nonce file_id');
    const objectKey = requiredText(raw.object_key, 'nonce object_key');
    const expiresAt = requiredText(raw.expires_at, 'nonce expires_at');

    if (!UUID_V4.test(uploadId)) throw new Error('Invalid nonce upload_id');
    if (!Number.isFinite(Date.parse(expiresAt))) throw new Error('Invalid nonce expires_at');

    const sql = `SELECT wilpay_issue_upload_grant_nonce(
      $1,
      $2::uuid,
      $3,
      $4,
      $5,
      $6::timestamptz
    ) AS issued`;

    const params = Object.freeze([
      requestId,
      uploadId,
      ownerUserId,
      fileId,
      objectKey,
      expiresAt
    ]);

    const result = await query(sql, params);
    return extractIssued(result);
  };
}
