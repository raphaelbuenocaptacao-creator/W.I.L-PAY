import { computeWilpayResourceFingerprint } from './wilpayResourceFingerprint.mjs';
import { validateWilpayRestoreEvidenceReference } from './wilpayRestoreEvidence.mjs';

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalHttpsOrigin(value) {
  if (!present(value)) return false;
  const raw = value.trim();
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      raw === parsed.origin
    );
  } catch {
    return false;
  }
}

function allowlisted(list, value) {
  return Array.isArray(list) && present(value) && list.includes(value);
}

function approvalIsComplete(approval) {
  return Boolean(
    approval?.status === 'APPROVED' &&
    present(approval.approved_by) &&
    present(approval.approved_at) &&
    !Number.isNaN(Date.parse(approval.approved_at)) &&
    present(approval.evidence_ref) &&
    present(approval.resource_fingerprint)
  );
}

function databaseIdentityStatus(isolation) {
  const expected = isolation.database_identity_lock ?? {};
  const observed = isolation.database_observed_identity;
  const identityKeys = ['project_name', 'region_id', 'branch_name', 'database_name', 'role_name'];

  if (!observed || typeof observed !== 'object') {
    return 'unverified';
  }

  const complete = identityKeys.every((key) => present(observed[key]) && present(expected[key]));
  if (!complete) {
    return 'unverified';
  }

  const matches = identityKeys.every((key) => observed[key].trim() === expected[key].trim());
  return matches ? 'verified' : 'mismatch';
}

function restorePolicyStatus(isolation, observed) {
  const expected = isolation.storage_restore_policy_lock;
  if (!expected || typeof expected !== 'object') {
    return 'not_required';
  }

  const policy = observed?.restore_policy;
  if (!policy || typeof policy !== 'object') {
    return 'unverified';
  }

  const complete =
    present(expected.policy_id) &&
    present(policy.policy_id) &&
    Number.isInteger(expected.max_restore_drill_age_days) &&
    expected.max_restore_drill_age_days > 0 &&
    Number.isInteger(policy.max_restore_drill_age_days) &&
    policy.max_restore_drill_age_days > 0 &&
    typeof expected.restore_to_isolated_prefix_required === 'boolean' &&
    typeof policy.restore_to_isolated_prefix_required === 'boolean' &&
    typeof expected.destructive_restore_overwrite_forbidden === 'boolean' &&
    typeof policy.destructive_restore_overwrite_forbidden === 'boolean';

  if (!complete) {
    return 'unverified';
  }

  const matches =
    policy.policy_id.trim() === expected.policy_id.trim() &&
    policy.max_restore_drill_age_days === expected.max_restore_drill_age_days &&
    policy.restore_to_isolated_prefix_required === expected.restore_to_isolated_prefix_required &&
    policy.destructive_restore_overwrite_forbidden === expected.destructive_restore_overwrite_forbidden;

  return matches ? 'verified' : 'mismatch';
}

function storageIdentityStatus(isolation, approvedResourceFingerprint) {
  const observed = isolation.storage_observed_identity;
  if (!observed || typeof observed !== 'object') {
    return 'unverified';
  }

  const expected = {
    provider: isolation.storage_provider,
    resource_id: isolation.storage_resource_id,
    provider_binding: isolation.storage_provider_binding,
    endpoint_origin: isolation.storage_endpoint_origin,
    bucket: isolation.storage_bucket,
    root_prefix: isolation.storage_layout?.root_prefix
  };

  const identityKeys = ['provider', 'resource_id', 'provider_binding', 'endpoint_origin', 'bucket', 'root_prefix'];
  const complete = identityKeys.every((key) => present(observed[key]) && present(expected[key]));
  if (!complete) {
    return 'unverified';
  }

  if (!canonicalHttpsOrigin(observed.endpoint_origin)) {
    return 'invalid_origin';
  }

  if (observed.private_access_enforced !== true) {
    return 'private_access_unverified';
  }

  if (observed.versioning_enabled !== true) {
    return 'versioning_unverified';
  }

  if (observed.destructive_lifecycle_disabled !== true) {
    return 'destructive_lifecycle_unverified';
  }

  if (observed.restore_capability_verified !== true) {
    return 'restore_capability_unverified';
  }

  if (observed.restore_drill_verified !== true) {
    return 'restore_drill_unverified';
  }

  if (!present(observed.last_verified_restore_at)) {
    return 'restore_drill_unverified';
  }

  const lastRestoreAt = Date.parse(observed.last_verified_restore_at);
  if (Number.isNaN(lastRestoreAt)) {
    return 'restore_drill_unverified';
  }

  const restorePolicy = restorePolicyStatus(isolation, observed);
  if (restorePolicy === 'not_required' || restorePolicy === 'unverified') {
    return 'restore_policy_unverified';
  }
  if (restorePolicy === 'mismatch') {
    return 'restore_policy_mismatch';
  }

  const restoreEvidence = observed.restore_evidence;
  const canonicalRestoreEvidenceRequired = isolation.storage_restore_policy_lock?.evidence_ref_scheme === 'sha256';
  const canonicalRestoreEvidenceIncomplete =
    canonicalRestoreEvidenceRequired &&
    (!Number.isInteger(restoreEvidence?.schema_version) ||
      !present(restoreEvidence?.result) ||
      !present(restoreEvidence?.execution_id));
  if (
    !restoreEvidence ||
    typeof restoreEvidence !== 'object' ||
    canonicalRestoreEvidenceIncomplete ||
    !present(restoreEvidence.resource_id) ||
    !present(restoreEvidence.resource_fingerprint) ||
    !present(restoreEvidence.verified_at) ||
    Number.isNaN(Date.parse(restoreEvidence.verified_at)) ||
    !present(restoreEvidence.evidence_ref) ||
    !present(approvedResourceFingerprint)
  ) {
    return 'restore_evidence_unverified';
  }

  if (
    restoreEvidence.resource_id.trim() !== expected.resource_id.trim() ||
    restoreEvidence.resource_fingerprint.trim() !== approvedResourceFingerprint.trim() ||
    Date.parse(restoreEvidence.verified_at) !== lastRestoreAt
  ) {
    return 'restore_evidence_mismatch';
  }

  try {
    validateWilpayRestoreEvidenceReference(isolation, isolation.storage_restore_policy_lock);
  } catch {
    return 'restore_evidence_mismatch';
  }

  const maxRestoreDrillAgeMs = isolation.storage_restore_policy_lock.max_restore_drill_age_days * 24 * 60 * 60 * 1000;
  const restoreAgeMs = Date.now() - lastRestoreAt;
  if (restoreAgeMs < 0 || restoreAgeMs > maxRestoreDrillAgeMs) {
    return 'restore_drill_stale';
  }

  const matches = identityKeys.every((key) => observed[key].trim() === expected[key].trim());
  return matches ? 'verified' : 'mismatch';
}

export function evaluateWilpayInfrastructureReadiness(binding) {
  if (!binding || typeof binding !== 'object') {
    throw new TypeError('W.I.L Pay readiness gate requires an infrastructure binding object');
  }

  const isolation = binding.isolation ?? {};
  const approval = binding.readiness?.approval ?? {};
  const reasons = [];

  const databaseComplete = present(isolation.database_project_id) && present(isolation.database_org_id);
  if (!databaseComplete) {
    reasons.push('database_binding_incomplete');
  } else {
    if (
      !allowlisted(isolation.approved_exclusive_database_project_ids, isolation.database_project_id) ||
      !allowlisted(isolation.approved_exclusive_database_org_ids, isolation.database_org_id)
    ) {
      reasons.push('database_binding_not_allowlisted');
    }

    const identityStatus = databaseIdentityStatus(isolation);
    if (identityStatus === 'unverified') {
      reasons.push('database_identity_unverified');
    } else if (identityStatus === 'mismatch') {
      reasons.push('database_identity_mismatch');
    }
  }

  const storageComplete =
    present(isolation.storage_provider) &&
    present(isolation.storage_resource_id) &&
    present(isolation.storage_provider_binding) &&
    present(isolation.storage_endpoint_origin);
  if (!storageComplete) {
    reasons.push('storage_binding_incomplete');
  } else {
    if (!canonicalHttpsOrigin(isolation.storage_endpoint_origin)) {
      reasons.push('storage_endpoint_origin_invalid');
    }

    if (
      !allowlisted(isolation.approved_exclusive_storage_resource_ids, isolation.storage_resource_id) ||
      !allowlisted(isolation.approved_exclusive_storage_bindings, isolation.storage_provider_binding)
    ) {
      reasons.push('storage_binding_not_allowlisted');
    }

    const identityStatus = storageIdentityStatus(isolation, approval.resource_fingerprint);
    if (identityStatus === 'unverified') {
      reasons.push('storage_identity_unverified');
    } else if (identityStatus === 'invalid_origin') {
      reasons.push('storage_observed_endpoint_origin_invalid');
    } else if (identityStatus === 'private_access_unverified') {
      reasons.push('storage_private_access_unverified');
    } else if (identityStatus === 'versioning_unverified') {
      reasons.push('storage_versioning_unverified');
    } else if (identityStatus === 'destructive_lifecycle_unverified') {
      reasons.push('storage_destructive_lifecycle_unverified');
    } else if (identityStatus === 'restore_capability_unverified') {
      reasons.push('storage_restore_capability_unverified');
    } else if (identityStatus === 'restore_drill_unverified') {
      reasons.push('storage_restore_drill_unverified');
    } else if (identityStatus === 'restore_drill_stale') {
      reasons.push('storage_restore_drill_stale');
    } else if (identityStatus === 'restore_policy_unverified') {
      reasons.push('storage_restore_policy_unverified');
    } else if (identityStatus === 'restore_policy_mismatch') {
      reasons.push('storage_restore_policy_mismatch');
    } else if (identityStatus === 'restore_evidence_unverified') {
      reasons.push('storage_restore_evidence_unverified');
    } else if (identityStatus === 'restore_evidence_mismatch') {
      reasons.push('storage_restore_evidence_mismatch');
    } else if (identityStatus === 'mismatch') {
      reasons.push('storage_identity_mismatch');
    }
  }

  const approvalComplete = approvalIsComplete(approval);
  if (!approvalComplete) {
    reasons.push('explicit_approval_missing');
  }

  if (databaseComplete && storageComplete && approvalComplete) {
    let fingerprint;
    try {
      fingerprint = computeWilpayResourceFingerprint(binding);
    } catch {
      reasons.push('resource_identity_incomplete');
    }

    if (fingerprint && approval.resource_fingerprint !== fingerprint) {
      reasons.push('resource_fingerprint_mismatch');
    }
  }

  const ready = reasons.length === 0;
  return {
    ready,
    status: ready ? 'READY' : 'BLOCKED_EXTERNAL_BINDING',
    reasons
  };
}

export function createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity,
  transportStatus = {}
}) {
  if (!binding || typeof binding !== 'object') {
    throw new TypeError('W.I.L Pay private runtime readiness requires an infrastructure binding object');
  }

  const runtimeBinding = {
    ...binding,
    isolation: {
      ...(binding.isolation ?? {}),
      database_observed_identity: observedDatabaseIdentity,
      storage_observed_identity: observedStorageIdentity
    }
  };

  const infrastructure = evaluateWilpayInfrastructureReadiness(runtimeBinding);
  const endpointConfigured = transportStatus?.endpoint_configured === true;
  const uploadOriginsConfigured = transportStatus?.upload_origins_configured === true;
  const reasons = [...infrastructure.reasons];

  if (!endpointConfigured) reasons.push('private_storage_endpoint_not_configured');
  if (!uploadOriginsConfigured) reasons.push('upload_origins_not_configured');

  const ready = infrastructure.ready && endpointConfigured && uploadOriginsConfigured;
  return Object.freeze({
    ready,
    status: ready ? 'READY' : 'BLOCKED_EXTERNAL_BINDING',
    endpoint_configured: endpointConfigured,
    upload_origins_configured: uploadOriginsConfigured,
    reasons: Object.freeze(reasons)
  });
}

const CLIENT_EXPOSED_INFRASTRUCTURE_KEYS = Object.freeze([
  'VITE_WILPAY_NEON_PROJECT_NAME',
  'VITE_WILPAY_NEON_REGION_ID',
  'VITE_WILPAY_NEON_BRANCH_NAME',
  'VITE_WILPAY_NEON_DATABASE_NAME',
  'VITE_WILPAY_NEON_ROLE_NAME',
  'VITE_WILPAY_STORAGE_PROVIDER',
  'VITE_WILPAY_STORAGE_RESOURCE_ID',
  'VITE_WILPAY_STORAGE_PROVIDER_BINDING',
  'VITE_WILPAY_STORAGE_ENDPOINT_ORIGIN',
  'VITE_WILPAY_STORAGE_BUCKET',
  'VITE_WILPAY_STORAGE_ROOT_PREFIX',
  'VITE_WILPAY_STORAGE_PRIVATE_ACCESS_ENFORCED',
  'VITE_WILPAY_STORAGE_VERSIONING_ENABLED',
  'VITE_WILPAY_STORAGE_DESTRUCTIVE_LIFECYCLE_DISABLED',
  'VITE_WILPAY_STORAGE_RESTORE_CAPABILITY_VERIFIED',
  'VITE_WILPAY_STORAGE_RESTORE_DRILL_VERIFIED',
  'VITE_WILPAY_STORAGE_LAST_VERIFIED_RESTORE_AT',
  'VITE_WILPAY_STORAGE_RESTORE_POLICY_ID',
  'VITE_WILPAY_STORAGE_MAX_RESTORE_DRILL_AGE_DAYS',
  'VITE_WILPAY_STORAGE_RESTORE_TO_ISOLATED_PREFIX_REQUIRED',
  'VITE_WILPAY_STORAGE_DESTRUCTIVE_RESTORE_OVERWRITE_FORBIDDEN',
  'VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_SCHEMA_VERSION',
  'VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_RESOURCE_ID',
  'VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_RESOURCE_FINGERPRINT',
  'VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_VERIFIED_AT',
  'VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_RESULT',
  'VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_EXECUTION_ID',
  'VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_REF',
  'VITE_WILPAY_PRIVATE_STORAGE_ENDPOINT_CONFIGURED',
  'VITE_WILPAY_UPLOAD_ORIGINS_CONFIGURED'
]);

function parseServerBooleanFlag(env, key) {
  const raw = env[key];
  if (raw === 'true') return { value: true, valid: true };
  if (raw === 'false') return { value: false, valid: true };
  return { value: false, valid: false };
}

function parseServerPositiveInteger(env, key) {
  const raw = env[key];
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return { value: null, valid: false };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { value: null, valid: false };
  }
  return { value, valid: true };
}

export function createWilpayServerRuntimeReadiness({ binding, env }) {
  const serverEnv = env && typeof env === 'object' && !Array.isArray(env) ? env : {};
  const environmentValid = serverEnv === env;
  const clientExposedInfrastructure = CLIENT_EXPOSED_INFRASTRUCTURE_KEYS.some((key) => present(serverEnv[key]));
  const endpointFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_PRIVATE_STORAGE_ENDPOINT_CONFIGURED');
  const uploadOriginsFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_UPLOAD_ORIGINS_CONFIGURED');
  const privateAccessFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_STORAGE_PRIVATE_ACCESS_ENFORCED');
  const versioningFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_STORAGE_VERSIONING_ENABLED');
  const destructiveLifecycleFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_STORAGE_DESTRUCTIVE_LIFECYCLE_DISABLED');
  const restoreCapabilityFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_STORAGE_RESTORE_CAPABILITY_VERIFIED');
  const restoreDrillFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_STORAGE_RESTORE_DRILL_VERIFIED');
  const restoreIsolatedPrefixFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_STORAGE_RESTORE_TO_ISOLATED_PREFIX_REQUIRED');
  const destructiveRestoreOverwriteFlag = parseServerBooleanFlag(serverEnv, 'WILPAY_SERVER_STORAGE_DESTRUCTIVE_RESTORE_OVERWRITE_FORBIDDEN');
  const restoreDrillAge = parseServerPositiveInteger(serverEnv, 'WILPAY_SERVER_STORAGE_MAX_RESTORE_DRILL_AGE_DAYS');
  const restorePolicyRequired = Boolean(binding?.isolation?.storage_restore_policy_lock);
  const restoreEvidenceSchemaVersion = serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_SCHEMA_VERSION === '1' ? 1 : null;

  const base = createWilpayPrivateRuntimeReadiness({
    binding,
    observedDatabaseIdentity: {
      project_name: serverEnv.WILPAY_SERVER_NEON_PROJECT_NAME,
      region_id: serverEnv.WILPAY_SERVER_NEON_REGION_ID,
      branch_name: serverEnv.WILPAY_SERVER_NEON_BRANCH_NAME,
      database_name: serverEnv.WILPAY_SERVER_NEON_DATABASE_NAME,
      role_name: serverEnv.WILPAY_SERVER_NEON_ROLE_NAME
    },
    observedStorageIdentity: {
      provider: serverEnv.WILPAY_SERVER_STORAGE_PROVIDER,
      resource_id: serverEnv.WILPAY_SERVER_STORAGE_RESOURCE_ID,
      provider_binding: serverEnv.WILPAY_SERVER_STORAGE_PROVIDER_BINDING,
      endpoint_origin: serverEnv.WILPAY_SERVER_STORAGE_ENDPOINT_ORIGIN,
      bucket: serverEnv.WILPAY_SERVER_STORAGE_BUCKET,
      root_prefix: serverEnv.WILPAY_SERVER_STORAGE_ROOT_PREFIX,
      private_access_enforced: privateAccessFlag.value,
      versioning_enabled: versioningFlag.value,
      destructive_lifecycle_disabled: destructiveLifecycleFlag.value,
      restore_capability_verified: restoreCapabilityFlag.value,
      restore_drill_verified: restoreDrillFlag.value,
      last_verified_restore_at: serverEnv.WILPAY_SERVER_STORAGE_LAST_VERIFIED_RESTORE_AT,
      restore_policy: restorePolicyRequired
        ? {
            policy_id: serverEnv.WILPAY_SERVER_STORAGE_RESTORE_POLICY_ID,
            max_restore_drill_age_days: restoreDrillAge.value,
            restore_to_isolated_prefix_required: restoreIsolatedPrefixFlag.value,
            destructive_restore_overwrite_forbidden: destructiveRestoreOverwriteFlag.value
          }
        : undefined,
      restore_evidence: restorePolicyRequired
        ? {
            schema_version: restoreEvidenceSchemaVersion,
            resource_id: serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_ID,
            resource_fingerprint: serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_FINGERPRINT,
            verified_at: serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_VERIFIED_AT,
            result: serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESULT,
            execution_id: serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_EXECUTION_ID,
            evidence_ref: serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_REF
          }
        : undefined
    },
    transportStatus: {
      endpoint_configured: endpointFlag.value,
      upload_origins_configured: uploadOriginsFlag.value
    }
  });

  const reasons = [...base.reasons];
  if (!environmentValid) reasons.push('server_environment_invalid');
  if (clientExposedInfrastructure) reasons.push('client_exposed_infrastructure_configuration');
  if (!endpointFlag.valid || !uploadOriginsFlag.valid) reasons.push('server_transport_flag_invalid');
  if (!privateAccessFlag.valid) reasons.push('server_storage_private_flag_invalid');
  if (!versioningFlag.valid) reasons.push('server_storage_versioning_flag_invalid');
  if (!destructiveLifecycleFlag.valid) reasons.push('server_storage_lifecycle_flag_invalid');
  if (!restoreCapabilityFlag.valid) reasons.push('server_storage_restore_capability_flag_invalid');
  if (!restoreDrillFlag.valid) reasons.push('server_storage_restore_drill_flag_invalid');
  if (
    restorePolicyRequired &&
    (!present(serverEnv.WILPAY_SERVER_STORAGE_RESTORE_POLICY_ID) ||
      !restoreDrillAge.valid ||
      !restoreIsolatedPrefixFlag.valid ||
      !destructiveRestoreOverwriteFlag.valid)
  ) {
    reasons.push('server_storage_restore_policy_invalid');
  }
  if (
    restorePolicyRequired &&
    (restoreEvidenceSchemaVersion !== 1 ||
      !present(serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_ID) ||
      !present(serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_FINGERPRINT) ||
      !present(serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_VERIFIED_AT) ||
      Number.isNaN(Date.parse(serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_VERIFIED_AT)) ||
      serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESULT !== 'PASS' ||
      !present(serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_EXECUTION_ID) ||
      !present(serverEnv.WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_REF))
  ) {
    reasons.push('server_storage_restore_evidence_invalid');
  }

  const ready = base.ready && reasons.length === 0;
  return Object.freeze({
    ...base,
    ready,
    status: ready ? 'READY' : 'BLOCKED_EXTERNAL_BINDING',
    reasons: Object.freeze(reasons)
  });
}
