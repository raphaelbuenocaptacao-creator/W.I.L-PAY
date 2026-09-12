import { reconcileWilpayStorageObjectFromStat } from './wilpayStorageObjectStatAdapter.js';
import { createWilpayStorageVerificationPersistence } from './wilpayStorageVerificationPersistence.js';

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function assertFileIdOnlyRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('W.I.L Pay storage verification request is required');
  }

  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== 'file_id') {
    throw new Error('W.I.L Pay storage verification request must contain only file_id');
  }

  return requiredText(raw.file_id, 'verification file_id');
}

async function loadTrustedMetadata(query, fileId) {
  const sql = `SELECT owner_user_id,
      loan_id,
      document_type,
      storage_provider,
      bucket,
      object_key,
      size_bytes,
      checksum_sha256,
      uploaded_at
    FROM wilpay.file_metadata
    WHERE file_id = $1
      AND status = 'active'
      AND storage_verified_at IS NULL
    LIMIT 1`;

  const result = await query(sql, Object.freeze([fileId]));
  if (!result || result.rowCount !== 1 || !Array.isArray(result.rows) || result.rows.length !== 1) {
    throw new Error('W.I.L Pay verification metadata is unavailable or no longer eligible');
  }

  const metadata = result.rows[0];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('W.I.L Pay verification metadata is invalid');
  }

  return Object.freeze({
    owner_user_id: requiredText(metadata.owner_user_id, 'verification metadata owner_user_id'),
    loan_id: requiredText(metadata.loan_id, 'verification metadata loan_id'),
    document_type: requiredText(metadata.document_type, 'verification metadata document_type'),
    storage_provider: metadata.storage_provider,
    bucket: metadata.bucket,
    object_key: metadata.object_key,
    size_bytes: metadata.size_bytes,
    checksum_sha256: metadata.checksum_sha256,
    uploaded_at: metadata.uploaded_at
  });
}

/**
 * Composes the trusted W.I.L Pay verification path:
 * database-owned metadata -> storage stat -> object reconciliation -> guarded persistence.
 *
 * This module is server-only. The caller supplies only file_id; object identity,
 * ownership/loan binding, checksum, size and upload time are loaded from the exclusive
 * W.I.L Pay database and re-checked when evidence is persisted.
 */
export function createWilpayStorageVerificationRuntime({ statObject, query, now = () => new Date() } = {}) {
  if (typeof statObject !== 'function') {
    throw new Error('W.I.L Pay storage stat function is required');
  }
  if (typeof query !== 'function') {
    throw new Error('W.I.L Pay verification database query function is required');
  }
  if (typeof now !== 'function') {
    throw new Error('W.I.L Pay verification clock is required');
  }

  const persistVerification = createWilpayStorageVerificationPersistence({ query });

  return async function verifyWilpayStorageObject(raw) {
    const fileId = assertFileIdOnlyRequest(raw);
    const metadata = await loadTrustedMetadata(query, fileId);

    const evidence = await reconcileWilpayStorageObjectFromStat({
      metadata,
      statObject,
      verifiedAt: now()
    });

    return persistVerification({
      file_id: fileId,
      expected_checksum_sha256: metadata.checksum_sha256,
      expected_storage_provider: metadata.storage_provider,
      expected_bucket: metadata.bucket,
      expected_object_key: metadata.object_key,
      expected_size_bytes: metadata.size_bytes,
      expected_uploaded_at: metadata.uploaded_at,
      expected_owner_user_id: metadata.owner_user_id,
      expected_loan_id: metadata.loan_id,
      expected_document_type: metadata.document_type,
      evidence
    });
  };
}
