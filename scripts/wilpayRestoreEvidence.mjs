import { createHash } from 'node:crypto';

function requireEvidenceIdentity(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`W.I.L Pay fingerprint requires complete exclusive resource binding: missing ${label}`);
  }
  return value.trim();
}

function presentEvidenceValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalUtcIsoTimestamp(value) {
  if (!presentEvidenceValue(value)) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString() === value;
}

export function validateWilpayRestoreEvidenceReference(isolation, restorePolicy) {
  if (restorePolicy?.evidence_ref_scheme !== 'sha256') return;

  const restoreEvidence = isolation?.storage_observed_identity?.restore_evidence;
  if (!restoreEvidence) {
    throw new Error('W.I.L Pay restore evidence is required when sha256 policy is active');
  }

  const evidenceRef = requireEvidenceIdentity(
    restoreEvidence.evidence_ref,
    'storage_observed_identity.restore_evidence.evidence_ref'
  );

  if (!/^sha256:[0-9a-f]{64}$/.test(evidenceRef)) {
    throw new Error('W.I.L Pay restore evidence reference must be an immutable sha256 digest');
  }

  if (restoreEvidence.schema_version !== 1) {
    throw new Error('W.I.L Pay restore evidence manifest must use schema version 1');
  }

  const resourceId = requireEvidenceIdentity(
    restoreEvidence.resource_id,
    'storage_observed_identity.restore_evidence.resource_id'
  );
  const resourceFingerprint = requireEvidenceIdentity(
    restoreEvidence.resource_fingerprint,
    'storage_observed_identity.restore_evidence.resource_fingerprint'
  );
  const verifiedAt = requireEvidenceIdentity(
    restoreEvidence.verified_at,
    'storage_observed_identity.restore_evidence.verified_at'
  );
  const result = requireEvidenceIdentity(
    restoreEvidence.result,
    'storage_observed_identity.restore_evidence.result'
  );
  const executionId = requireEvidenceIdentity(
    restoreEvidence.execution_id,
    'storage_observed_identity.restore_evidence.execution_id'
  );

  if (!canonicalUtcIsoTimestamp(verifiedAt)) {
    throw new Error('W.I.L Pay restore evidence manifest requires a canonical UTC ISO timestamp for verified_at');
  }
  if (result !== 'PASS') {
    throw new Error('W.I.L Pay restore evidence manifest requires a successful restore result');
  }

  const canonicalManifest = {
    schema_version: 1,
    resource_id: resourceId,
    resource_fingerprint: resourceFingerprint,
    verified_at: verifiedAt,
    result,
    execution_id: executionId
  };
  const expectedRef = `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalManifest), 'utf8')
    .digest('hex')}`;

  if (evidenceRef !== expectedRef) {
    throw new Error('W.I.L Pay restore evidence digest does not match the canonical restore manifest');
  }
}

export function classifyWilpayRestoreEvidence(isolation, restorePolicy) {
  if (restorePolicy?.evidence_ref_scheme !== 'sha256') return 'not_required';

  const restoreEvidence = isolation?.storage_observed_identity?.restore_evidence;
  if (!restoreEvidence || typeof restoreEvidence !== 'object') return 'unverified';

  const complete =
    Number.isInteger(restoreEvidence.schema_version) &&
    presentEvidenceValue(restoreEvidence.resource_id) &&
    presentEvidenceValue(restoreEvidence.resource_fingerprint) &&
    canonicalUtcIsoTimestamp(restoreEvidence.verified_at) &&
    presentEvidenceValue(restoreEvidence.result) &&
    presentEvidenceValue(restoreEvidence.execution_id) &&
    presentEvidenceValue(restoreEvidence.evidence_ref);

  if (!complete) return 'unverified';

  try {
    validateWilpayRestoreEvidenceReference(isolation, restorePolicy);
    return 'verified';
  } catch {
    return 'mismatch';
  }
}
