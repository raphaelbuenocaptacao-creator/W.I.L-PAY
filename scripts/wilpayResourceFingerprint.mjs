import { createHash } from 'node:crypto';

function requireIdentity(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`W.I.L Pay fingerprint requires complete exclusive resource binding: missing ${label}`);
  }
  return value.trim();
}

export function computeWilpayResourceFingerprint(binding) {
  if (!binding || typeof binding !== 'object') {
    throw new TypeError('W.I.L Pay fingerprint requires an infrastructure binding object');
  }

  const isolation = binding.isolation ?? {};
  const databaseLock = isolation.database_identity_lock ?? {};
  const storageLayout = isolation.storage_layout ?? {};

  const identity = {
    fingerprint_version: 1,
    project: requireIdentity(binding.project, 'project'),
    environment: requireIdentity(binding.environment, 'environment'),
    database: {
      provider: requireIdentity(isolation.database_provider, 'database_provider'),
      org_id: requireIdentity(isolation.database_org_id, 'database_org_id'),
      project_id: requireIdentity(isolation.database_project_id, 'database_project_id'),
      project_name: requireIdentity(databaseLock.project_name, 'database_identity_lock.project_name'),
      region_id: requireIdentity(databaseLock.region_id, 'database_identity_lock.region_id'),
      branch_name: requireIdentity(databaseLock.branch_name, 'database_identity_lock.branch_name'),
      database_name: requireIdentity(databaseLock.database_name, 'database_identity_lock.database_name'),
      role_name: requireIdentity(databaseLock.role_name, 'database_identity_lock.role_name')
    },
    storage: {
      provider: requireIdentity(isolation.storage_provider, 'storage_provider'),
      resource_id: requireIdentity(isolation.storage_resource_id, 'storage_resource_id'),
      provider_binding: requireIdentity(isolation.storage_provider_binding, 'storage_provider_binding'),
      bucket: requireIdentity(isolation.storage_bucket, 'storage_bucket'),
      root_prefix: requireIdentity(storageLayout.root_prefix, 'storage_layout.root_prefix')
    }
  };

  return createHash('sha256')
    .update(JSON.stringify(identity), 'utf8')
    .digest('hex');
}
