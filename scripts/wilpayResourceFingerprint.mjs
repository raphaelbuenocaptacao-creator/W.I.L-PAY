import { createHash } from 'node:crypto';
import { validateWilpayRestoreEvidenceReference } from './wilpayRestoreEvidence.mjs';

function requireIdentity(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`W.I.L Pay fingerprint requires complete exclusive resource binding: missing ${label}`);
  }
  return value.trim();
}

function restorePolicyLock(isolation) {
  const configured = isolation.storage_restore_policy_lock ?? {};
  const policy = {
    policy_id: requireIdentity(configured.policy_id ?? 'wilpay-private-restore-v1', 'storage_restore_policy_lock.policy_id'),
    max_restore_drill_age_days: Number.isInteger(configured.max_restore_drill_age_days)
      ? configured.max_restore_drill_age_days
      : 30,
    restore_to_isolated_prefix_required: configured.restore_to_isolated_prefix_required ?? true,
    destructive_restore_overwrite_forbidden: configured.destructive_restore_overwrite_forbidden ?? true
  };

  if (configured.evidence_ref_scheme !== undefined) {
    const scheme = requireIdentity(configured.evidence_ref_scheme, 'storage_restore_policy_lock.evidence_ref_scheme');
    if (scheme !== 'sha256') {
      throw new Error('W.I.L Pay fingerprint only accepts sha256 restore evidence references');
    }
    policy.evidence_ref_scheme = scheme;
  }

  return policy;
}

export function computeWilpayResourceFingerprint(binding) {
  if (!binding || typeof binding !== 'object') {
    throw new TypeError('W.I.L Pay fingerprint requires an infrastructure binding object');
  }

  const isolation = binding.isolation ?? {};
  const databaseLock = isolation.database_identity_lock ?? {};
  const storageLayout = isolation.storage_layout ?? {};
  const restorePolicy = restorePolicyLock(isolation);
  validateWilpayRestoreEvidenceReference(isolation, restorePolicy);

  const identity = {
    fingerprint_version: 3,
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
      endpoint_origin: requireIdentity(isolation.storage_endpoint_origin, 'storage_endpoint_origin'),
      bucket: requireIdentity(isolation.storage_bucket, 'storage_bucket'),
      root_prefix: requireIdentity(storageLayout.root_prefix, 'storage_layout.root_prefix'),
      restore_policy: restorePolicy
    }
  };

  return createHash('sha256')
    .update(JSON.stringify(identity), 'utf8')
    .digest('hex');
}
