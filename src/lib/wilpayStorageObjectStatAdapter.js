import { reconcileWilpayStorageObject } from './wilpayStorageObjectReconciler.js';

function requiredString(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export async function reconcileWilpayStorageObjectFromStat({
  metadata,
  statObject,
  verifiedAt = new Date()
}) {
  if (!metadata || typeof metadata !== 'object') throw new Error('metadata is required');
  if (typeof statObject !== 'function') throw new Error('statObject must be a function');

  const location = Object.freeze({
    storage_provider: requiredString(metadata.storage_provider, 'metadata.storage_provider'),
    bucket: requiredString(metadata.bucket, 'metadata.bucket'),
    object_key: requiredString(metadata.object_key, 'metadata.object_key')
  });

  const stat = await statObject(location);
  if (!stat || typeof stat !== 'object' || stat.exists !== true) {
    throw new Error('Storage object reconciliation failed');
  }

  return reconcileWilpayStorageObject({
    metadata,
    observedObject: {
      exists: true,
      storage_provider: location.storage_provider,
      bucket: location.bucket,
      object_key: location.object_key,
      size_bytes: stat.size_bytes,
      checksum_sha256: stat.checksum_sha256
    },
    verifiedAt
  });
}
