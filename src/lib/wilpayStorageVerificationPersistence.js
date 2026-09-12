const SHA256_HEX = /^[a-f0-9]{64}$/;

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requiredChecksum(value, label) {
  const checksum = requiredText(value, label).toLowerCase();
  if (!SHA256_HEX.test(checksum)) throw new Error(`${label} must be a SHA-256 hex digest`);
  return checksum;
}

function requiredPositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return normalized;
}

function requiredTimestamp(value, label) {
  const text = requiredText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be a valid timestamp`);
  return new Date(text).toISOString();
}

/**
 * Creates a server-only optimistic persistence adapter for object verification evidence.
 *
 * `query` must be bound to the exclusive W.I.L Pay database connection. This adapter
 * accepts no credentials and persists only verification metadata. The UPDATE is
 * intentionally conditional so a concurrent lifecycle, upload-version, object-identity,
 * ownership/loan binding, size or checksum change cannot cause stale verification
 * evidence to be persisted.
 */
export function createWilpayStorageVerificationPersistence({ query } = {}) {
  if (typeof query !== 'function') {
    throw new Error('W.I.L Pay verification database query function is required');
  }

  return async function persistWilpayStorageVerification(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('W.I.L Pay verification persistence payload is required');
    }

    const fileId = requiredText(raw.file_id, 'verification file_id');
    const expectedChecksum = requiredChecksum(
      raw.expected_checksum_sha256,
      'verification expected_checksum_sha256'
    );
    const expectedProvider = requiredText(raw.expected_storage_provider, 'verification expected_storage_provider');
    const expectedBucket = requiredText(raw.expected_bucket, 'verification expected_bucket');
    const expectedObjectKey = requiredText(raw.expected_object_key, 'verification expected_object_key');
    const expectedSize = requiredPositiveInteger(raw.expected_size_bytes, 'verification expected_size_bytes');
    const expectedUploadedAt = requiredTimestamp(raw.expected_uploaded_at, 'verification expected_uploaded_at');
    const expectedOwnerUserId = requiredText(raw.expected_owner_user_id, 'verification expected_owner_user_id');
    const expectedLoanId = requiredText(raw.expected_loan_id, 'verification expected_loan_id');
    const expectedDocumentType = requiredText(raw.expected_document_type, 'verification expected_document_type');

    const evidence = raw.evidence;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      throw new Error('verification evidence is required');
    }

    const verifiedAt = requiredTimestamp(evidence.storage_verified_at, 'evidence.storage_verified_at');
    const verifiedSize = requiredPositiveInteger(
      evidence.storage_verified_size_bytes,
      'evidence.storage_verified_size_bytes'
    );
    const verifiedChecksum = requiredChecksum(
      evidence.storage_verified_checksum_sha256,
      'evidence.storage_verified_checksum_sha256'
    );

    if (verifiedChecksum !== expectedChecksum) {
      throw new Error('verification evidence checksum does not match expected checksum');
    }
    if (verifiedSize !== expectedSize) {
      throw new Error('verification evidence size does not match expected size');
    }

    const sql = `UPDATE wilpay.file_metadata
      SET storage_verified_at = $3::timestamptz,
          storage_verified_size_bytes = $4,
          storage_verified_checksum_sha256 = $5
      WHERE file_id = $1
        AND status = 'active'
        AND checksum_sha256 = $2
        AND storage_verified_at IS NULL
        AND storage_provider = $6
        AND bucket = $7
        AND object_key = $8
        AND size_bytes = $9
        AND uploaded_at = $10::timestamptz
        AND owner_user_id = $11
        AND loan_id = $12
        AND document_type = $13`;

    const params = Object.freeze([
      fileId,
      expectedChecksum,
      verifiedAt,
      verifiedSize,
      verifiedChecksum,
      expectedProvider,
      expectedBucket,
      expectedObjectKey,
      expectedSize,
      expectedUploadedAt,
      expectedOwnerUserId,
      expectedLoanId,
      expectedDocumentType
    ]);

    const result = await query(sql, params);
    if (!result || result.rowCount !== 1) {
      throw new Error('W.I.L Pay verification persistence conflict');
    }

    return Object.freeze({
      updated: true,
      file_id: fileId
    });
  };
}
