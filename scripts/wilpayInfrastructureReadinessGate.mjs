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
  } else if (
    !allowlisted(isolation.approved_exclusive_storage_resource_ids, isolation.storage_resource_id) ||
    !allowlisted(isolation.approved_exclusive_storage_bindings, isolation.storage_provider_binding)
  ) {
    reasons.push('storage_binding_not_allowlisted');
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
