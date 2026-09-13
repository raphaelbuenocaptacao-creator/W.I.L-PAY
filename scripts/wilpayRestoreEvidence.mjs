import { createHash } from 'node:crypto';

function requireEvidenceIdentity(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`W.I.L Pay fingerprint requires complete exclusive resource binding: missing ${label}`);
  }
  return value.trim();
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

  if (Number.isNaN(Date.parse(verifiedAt))) {
    throw new Error('W.I.L Pay restore evidence manifest requires a valid verified_at timestamp');
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
