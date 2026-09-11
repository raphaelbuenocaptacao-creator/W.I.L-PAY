import { reconcileWilpayStorageObjectFromStat } from './wilpayStorageObjectStatAdapter.js';
import { createWilpayStorageVerificationPersistence } from './wilpayStorageVerificationPersistence.js';

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

/**
 * Composes the trusted W.I.L Pay verification path:
 * storage stat -> object reconciliation -> guarded database persistence.
 *
 * This module is server-only. Callers provide trusted infrastructure adapters;
 * request payloads never provide a prebuilt verification evidence object.
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
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('W.I.L Pay storage verification request is required');
    }

    const fileId = requiredText(raw.file_id, 'verification file_id');
    const metadata = raw.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('verification metadata is required');
    }

    const evidence = await reconcileWilpayStorageObjectFromStat({
      metadata,
      statObject,
      verifiedAt: now()
    });

    return persistVerification({
      file_id: fileId,
      expected_checksum_sha256: metadata.checksum_sha256,
      evidence
    });
  };
}
