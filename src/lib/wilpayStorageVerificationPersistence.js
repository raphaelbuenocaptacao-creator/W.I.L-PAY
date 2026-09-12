const SHA256_HEX = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function optionalOwnershipSnapshot(raw) {
  const values = [raw.expected_owner_user_id, raw.expected_loan_id, raw.expected_document_type];
  const supplied = values.filter(value => value != null).length;
  if (supplied === 0) return null;
  if (supplied !== values.length) {
    throw new Error('verification ownership snapshot must include owner_user_id, loan_id and document_type');
  }
  return Object.freeze({
    ownerUserId: requiredText(raw.expected_owner_user_id, 'verification expected_owner_user_id'),
    loanId: requiredText(raw.expected_loan_id, 'verification expected_loan_id'),
    documentType: requiredText(raw.expected_document_type, 'verification expected_document_type')
  });
}

function uploadIdentitySnapshot(raw) {
  if (!Object.prototype.hasOwnProperty.call(raw, 'expected_upload_id')) {
    return Object.freeze({ supplied: false, uploadId: null });
  }

  if (raw.expected_upload_id == null) {
    return Object.freeze({ supplied: true, uploadId: null });
  }

  const uploadId = requiredText(raw.expected_upload_id, 'verification expected_upload_id');
  if (!UUID.test(uploadId)) {
    throw new Error('verification expected_upload_id must be a UUID');
  }

  return Object.freeze({ supplied: true, uploadId: uploadId.toLowerCase() });
}

/**
 * Creates a server-only optimistic persistence adapter for object verification evidence.
 *
 * `query` must be bound to the exclusive W.I.L Pay database connection. This adapter
 * accepts no credentials and persists only verification metadata. The UPDATE is
 * intentionally conditional so a concurrent lifecycle, upload-version, object-identity,
 * ownership/loan binding, immutable upload identity, size or checksum change cannot cause
 * stale verification evidence to be persisted. The trusted runtime always supplies both
 * ownership and upload-identity snapshots; optional legacy direct callers remain supported.
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
    const ownershipSnapshot = optionalOwnershipSnapshot(raw);
    const uploadSnapshot = uploadIdentitySnapshot(raw);

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

    let sql = `UPDATE wilpay.file_metadata
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
        AND uploaded_at = $10::timestamptz`;

    const params = [
      fileId,
      expectedChecksum,
      verifiedAt,
      verifiedSize,
      verifiedChecksum,
      expectedProvider,
      expectedBucket,
      expectedObjectKey,
      expectedSize,
      expectedUploadedAt
    ];

    if (ownershipSnapshot) {
      sql += `
        AND owner_user_id = $11
        AND loan_id = $12
        AND document_type = $13`;
      params.push(
        ownershipSnapshot.ownerUserId,
        ownershipSnapshot.loanId,
        ownershipSnapshot.documentType
      );
    }

    if (uploadSnapshot.supplied) {
      if (uploadSnapshot.uploadId === null) {
        sql += '\n        AND upload_id IS NULL';
      } else {
        const uploadParam = params.length + 1;
        sql += `\n        AND upload_id = $${uploadParam}::uuid`;
        params.push(uploadSnapshot.uploadId);
      }
    }

    const result = await query(sql, Object.freeze(params));
    if (!result || result.rowCount !== 1) {
      throw new Error('W.I.L Pay verification persistence conflict');
    }

    return Object.freeze({
      updated: true,
      file_id: fileId
    });
  };
}
