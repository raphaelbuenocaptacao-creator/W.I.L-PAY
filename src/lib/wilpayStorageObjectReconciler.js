const SHA256_HEX = /^[a-f0-9]{64}$/;

function requiredString(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizeChecksum(value, label) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!SHA256_HEX.test(normalized)) throw new Error(`${label} must be a SHA-256 hex digest`);
  return normalized;
}

function normalizePositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new Error(`${label} must be a positive integer`);
  return normalized;
}

function normalizeTimestamp(value, label) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
}

export function reconcileWilpayStorageObject({ metadata, observedObject, verifiedAt = new Date() }) {
  if (!metadata || typeof metadata !== 'object') throw new Error('metadata is required');
  if (!observedObject || typeof observedObject !== 'object') throw new Error('observedObject is required');

  const expected = {
    storageProvider: requiredString(metadata.storage_provider, 'metadata.storage_provider'),
    bucket: requiredString(metadata.bucket, 'metadata.bucket'),
    objectKey: requiredString(metadata.object_key, 'metadata.object_key'),
    sizeBytes: normalizePositiveInteger(metadata.size_bytes, 'metadata.size_bytes'),
    checksumSha256: normalizeChecksum(metadata.checksum_sha256, 'metadata.checksum_sha256')
  };

  const observed = {
    exists: observedObject.exists === true,
    storageProvider: requiredString(observedObject.storage_provider, 'observedObject.storage_provider'),
    bucket: requiredString(observedObject.bucket, 'observedObject.bucket'),
    objectKey: requiredString(observedObject.object_key, 'observedObject.object_key'),
    sizeBytes: normalizePositiveInteger(observedObject.size_bytes, 'observedObject.size_bytes'),
    checksumSha256: normalizeChecksum(observedObject.checksum_sha256, 'observedObject.checksum_sha256')
  };

  if (
    !observed.exists ||
    observed.storageProvider !== expected.storageProvider ||
    observed.bucket !== expected.bucket ||
    observed.objectKey !== expected.objectKey ||
    observed.sizeBytes !== expected.sizeBytes ||
    observed.checksumSha256 !== expected.checksumSha256
  ) {
    throw new Error('Storage object reconciliation failed');
  }

  const verifiedDate = normalizeTimestamp(verifiedAt, 'verifiedAt');
  if (metadata.uploaded_at != null) {
    const uploadedDate = normalizeTimestamp(metadata.uploaded_at, 'metadata.uploaded_at');
    if (verifiedDate < uploadedDate) throw new Error('verifiedAt must not precede uploaded_at');
  }

  return Object.freeze({
    storage_verified_at: verifiedDate.toISOString(),
    storage_verified_size_bytes: observed.sizeBytes,
    storage_verified_checksum_sha256: observed.checksumSha256
  });
}
