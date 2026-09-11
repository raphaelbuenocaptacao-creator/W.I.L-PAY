import { computeWilpayResourceFingerprint } from './wilpayResourceFingerprint.mjs';

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

function storageIdentityStatus(isolation) {
  const observed = isolation.storage_observed_identity;
  if (!observed || typeof observed !== 'object') {
    return 'unverified';
  }

  const expected = {
    provider: isolation.storage_provider,
    resource_id: isolation.storage_resource_id,
    provider_binding: isolation.storage_provider_binding,
    bucket: isolation.storage_bucket,
    root_prefix: isolation.storage_layout?.root_prefix
  };

  const identityKeys = ['provider', 'resource_id', 'provider_binding', 'bucket', 'root_prefix'];
  const complete = identityKeys.every((key) => present(observed[key]) && present(expected[key]));
  if (!complete) {
    return 'unverified';
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
    present(isolation.storage_provider_binding);
  if (!storageComplete) {
    reasons.push('storage_binding_incomplete');
  } else {
    if (
      !allowlisted(isolation.approved_exclusive_storage_resource_ids, isolation.storage_resource_id) ||
      !allowlisted(isolation.approved_exclusive_storage_bindings, isolation.storage_provider_binding)
    ) {
      reasons.push('storage_binding_not_allowlisted');
    }

    const identityStatus = storageIdentityStatus(isolation);
    if (identityStatus === 'unverified') {
      reasons.push('storage_identity_unverified');
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
