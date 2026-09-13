import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import { evaluateWilpayInfrastructureReadiness } from '../scripts/wilpayInfrastructureReadinessGate.mjs';

function restoreEvidenceDigest(manifest) {
  const canonical = {
    schema_version: manifest.schema_version,
    resource_id: manifest.resource_id,
    resource_fingerprint: manifest.resource_fingerprint,
    verified_at: manifest.verified_at,
    result: manifest.result,
    execution_id: manifest.execution_id
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')}`;
}

function approvedBinding() {
  const restorePolicy = {
    policy_id: 'wilpay-private-restore-v1',
    max_restore_drill_age_days: 30,
    restore_to_isolated_prefix_required: true,
    destructive_restore_overwrite_forbidden: true,
    evidence_ref_scheme: 'sha256'
  };

  const binding = {
    project: 'wilpay',
    environment: 'production',
    isolation: {
      database_provider: 'neon',
      database_project_id: 'project-wilpay-exclusive',
      database_org_id: 'org-wilpay-exclusive',
      approved_exclusive_database_project_ids: ['project-wilpay-exclusive'],
      approved_exclusive_database_org_ids: ['org-wilpay-exclusive'],
      database_identity_lock: {
        project_name: 'wilpay-production', region_id: 'us-east-2', branch_name: 'production', database_name: 'wilpay', role_name: 'wilpay_app'
      },
      database_observed_identity: {
        project_name: 'wilpay-production', region_id: 'us-east-2', branch_name: 'production', database_name: 'wilpay', role_name: 'wilpay_app'
      },
      storage_provider: 'private-storage-provider',
      storage_resource_id: 'storage-wilpay-exclusive',
      storage_provider_binding: 'binding-wilpay-production',
      storage_endpoint_origin: 'https://storage.wilpay.example',
      storage_bucket: 'wilpay-private-documents',
      approved_exclusive_storage_resource_ids: ['storage-wilpay-exclusive'],
      approved_exclusive_storage_bindings: ['binding-wilpay-production'],
      storage_restore_policy_lock: { ...restorePolicy },
      storage_layout: { root_prefix: 'wilpay/production' },
      storage_observed_identity: {
        provider: 'private-storage-provider', resource_id: 'storage-wilpay-exclusive', provider_binding: 'binding-wilpay-production',
        endpoint_origin: 'https://storage.wilpay.example', bucket: 'wilpay-private-documents', root_prefix: 'wilpay/production',
        private_access_enforced: true, versioning_enabled: true, destructive_lifecycle_disabled: true,
        restore_capability_verified: true, restore_drill_verified: true, last_verified_restore_at: new Date().toISOString(),
        restore_policy: { ...restorePolicy }
      }
    },
    readiness: { approval: { status: 'APPROVED', approved_by: 'infrastructure-owner', approved_at: new Date().toISOString(), evidence_ref: 'approval-record', resource_fingerprint: null } }
  };
  const resourceFingerprint = computeWilpayResourceFingerprint(binding);
  binding.readiness.approval.resource_fingerprint = resourceFingerprint;
  const manifest = {
    schema_version: 1,
    resource_id: binding.isolation.storage_resource_id,
    resource_fingerprint: resourceFingerprint,
    verified_at: binding.isolation.storage_observed_identity.last_verified_restore_at,
    result: 'PASS',
    execution_id: 'restore-drill-fixture'
  };
  binding.isolation.storage_observed_identity.restore_evidence = {
    ...manifest,
    evidence_ref: restoreEvidenceDigest(manifest)
  };
  return binding;
}

const ready = evaluateWilpayInfrastructureReadiness(approvedBinding());
assert.equal(ready.ready, true, 'recent verified restore evidence should allow an otherwise approved Storage binding');

const noRestoreCapability = approvedBinding();
noRestoreCapability.isolation.storage_observed_identity.restore_capability_verified = false;
const blockedCapability = evaluateWilpayInfrastructureReadiness(noRestoreCapability);
assert.equal(blockedCapability.ready, false, 'readiness must fail closed without verified restore capability');
assert.ok(blockedCapability.reasons.includes('storage_restore_capability_unverified'));

const noRestoreDrill = approvedBinding();
noRestoreDrill.isolation.storage_observed_identity.restore_drill_verified = false;
const blockedDrill = evaluateWilpayInfrastructureReadiness(noRestoreDrill);
assert.equal(blockedDrill.ready, false, 'readiness must fail closed without a successful restore drill');
assert.ok(blockedDrill.reasons.includes('storage_restore_drill_unverified'));

const staleRestoreDrill = approvedBinding();
staleRestoreDrill.isolation.storage_observed_identity.last_verified_restore_at = '2020-01-01T00:00:00.000Z';
staleRestoreDrill.isolation.storage_observed_identity.restore_evidence.verified_at = '2020-01-01T00:00:00.000Z';
const blockedStale = evaluateWilpayInfrastructureReadiness(staleRestoreDrill);
assert.equal(blockedStale.ready, false, 'readiness must fail closed when the last restore drill exceeds the approved policy age');
assert.ok(blockedStale.reasons.includes('storage_restore_drill_stale'));

const sevenDayPolicy = approvedBinding();
sevenDayPolicy.isolation.storage_restore_policy_lock.max_restore_drill_age_days = 7;
sevenDayPolicy.isolation.storage_observed_identity.restore_policy.max_restore_drill_age_days = 7;
sevenDayPolicy.isolation.storage_observed_identity.last_verified_restore_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
delete sevenDayPolicy.isolation.storage_observed_identity.restore_evidence;
sevenDayPolicy.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(sevenDayPolicy);
const sevenDayManifest = {
  schema_version: 1,
  resource_id: sevenDayPolicy.isolation.storage_resource_id,
  resource_fingerprint: sevenDayPolicy.readiness.approval.resource_fingerprint,
  verified_at: sevenDayPolicy.isolation.storage_observed_identity.last_verified_restore_at,
  result: 'PASS',
  execution_id: 'restore-drill-seven-day-fixture'
};
sevenDayPolicy.isolation.storage_observed_identity.restore_evidence = {
  ...sevenDayManifest,
  evidence_ref: restoreEvidenceDigest(sevenDayManifest)
};
const blockedByApprovedAge = evaluateWilpayInfrastructureReadiness(sevenDayPolicy);
assert.equal(blockedByApprovedAge.ready, false, 'restore drill freshness must follow the approved restore policy instead of a fixed 30-day limit');
assert.ok(blockedByApprovedAge.reasons.includes('storage_restore_drill_stale'));

const wrongRestoreResource = approvedBinding();
wrongRestoreResource.isolation.storage_observed_identity.restore_evidence.resource_id = 'storage-from-another-project';
const blockedWrongResource = evaluateWilpayInfrastructureReadiness(wrongRestoreResource);
assert.equal(blockedWrongResource.ready, false, 'restore evidence from another Storage resource must never satisfy readiness');
assert.ok(blockedWrongResource.reasons.includes('storage_restore_evidence_mismatch'));

const wrongRestoreFingerprint = approvedBinding();
wrongRestoreFingerprint.isolation.storage_observed_identity.restore_evidence.resource_fingerprint = '0'.repeat(64);
const blockedWrongFingerprint = evaluateWilpayInfrastructureReadiness(wrongRestoreFingerprint);
assert.equal(blockedWrongFingerprint.ready, false, 'restore evidence must be bound to the approved infrastructure fingerprint');
assert.ok(blockedWrongFingerprint.reasons.includes('storage_restore_evidence_mismatch'));

const missingRestoreEvidence = approvedBinding();
delete missingRestoreEvidence.isolation.storage_observed_identity.restore_evidence;
const blockedMissingEvidence = evaluateWilpayInfrastructureReadiness(missingRestoreEvidence);
assert.equal(blockedMissingEvidence.ready, false, 'restore readiness must fail closed when resource-bound evidence is missing');
assert.ok(blockedMissingEvidence.reasons.includes('storage_restore_evidence_unverified'));

const missingEvidenceRef = approvedBinding();
delete missingEvidenceRef.isolation.storage_observed_identity.restore_evidence.evidence_ref;
const blockedMissingEvidenceRef = evaluateWilpayInfrastructureReadiness(missingEvidenceRef);
assert.equal(blockedMissingEvidenceRef.ready, false, 'restore readiness must fail closed without an auditable restore-drill evidence reference');
assert.ok(blockedMissingEvidenceRef.reasons.includes('storage_restore_evidence_unverified'));

const mutableEvidenceRef = approvedBinding();
mutableEvidenceRef.isolation.storage_observed_identity.restore_evidence.evidence_ref = 'restore-drill/audit/latest';
const blockedMutableEvidenceRef = evaluateWilpayInfrastructureReadiness(mutableEvidenceRef);
assert.equal(blockedMutableEvidenceRef.ready, false, 'restore readiness must reject mutable evidence references when the approved policy requires sha256');

const mismatchedEvidenceTimestamp = approvedBinding();
mismatchedEvidenceTimestamp.isolation.storage_observed_identity.restore_evidence.verified_at = '2026-09-01T00:00:00.000Z';
const blockedMismatchedTimestamp = evaluateWilpayInfrastructureReadiness(mismatchedEvidenceTimestamp);
assert.equal(blockedMismatchedTimestamp.ready, false, 'restore evidence must attest the exact restore-drill timestamp being evaluated');
assert.ok(blockedMismatchedTimestamp.reasons.includes('storage_restore_evidence_mismatch'));

const tamperedRestoreResult = approvedBinding();
tamperedRestoreResult.isolation.storage_observed_identity.restore_evidence.result = 'FAIL';
const blockedTamperedManifest = evaluateWilpayInfrastructureReadiness(tamperedRestoreResult);
assert.equal(blockedTamperedManifest.ready, false, 'restore evidence digest must bind the canonical manifest content');
assert.ok(blockedTamperedManifest.reasons.includes('storage_restore_evidence_mismatch'));
assert.equal(
  blockedTamperedManifest.reasons.includes('resource_identity_incomplete'),
  false,
  'restore evidence tampering must be rejected by readiness before resource fingerprint evaluation'
);

console.log('W.I.L Pay storage restore runtime readiness checks: PASS');
