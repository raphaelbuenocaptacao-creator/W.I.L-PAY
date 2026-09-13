import assert from 'node:assert/strict';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import {
  createWilpayServerRuntimeReadiness,
  evaluateWilpayInfrastructureReadiness
} from '../scripts/wilpayInfrastructureReadinessGate.mjs';

function approvedBinding() {
  const binding = {
    project: 'wilpay',
    environment: 'production',
    isolation: {
      database_provider: 'neon',
      database_project_id: 'wilpay-db-project',
      database_org_id: 'wilpay-org',
      approved_exclusive_database_project_ids: ['wilpay-db-project'],
      approved_exclusive_database_org_ids: ['wilpay-org'],
      database_identity_lock: {
        project_name: 'wilpay-production',
        region_id: 'us-east-2',
        branch_name: 'production',
        database_name: 'wilpay',
        role_name: 'wilpay_app'
      },
      database_observed_identity: {
        project_name: 'wilpay-production',
        region_id: 'us-east-2',
        branch_name: 'production',
        database_name: 'wilpay',
        role_name: 'wilpay_app'
      },
      storage_provider: 'private-object-storage',
      storage_resource_id: 'wilpay-storage-resource',
      storage_provider_binding: 'wilpay-storage-binding',
      storage_endpoint_origin: 'https://storage.wilpay.example',
      storage_bucket: 'wilpay-private-documents',
      approved_exclusive_storage_resource_ids: ['wilpay-storage-resource'],
      approved_exclusive_storage_bindings: ['wilpay-storage-binding'],
      storage_layout: { root_prefix: 'wilpay/production' },
      storage_restore_policy_lock: {
        immutable_after_approval: true,
        policy_id: 'wilpay-private-restore-v1',
        max_restore_drill_age_days: 30,
        restore_to_isolated_prefix_required: true,
        destructive_restore_overwrite_forbidden: true
      },
      storage_observed_identity: {
        provider: 'private-object-storage',
        resource_id: 'wilpay-storage-resource',
        provider_binding: 'wilpay-storage-binding',
        endpoint_origin: 'https://storage.wilpay.example',
        bucket: 'wilpay-private-documents',
        root_prefix: 'wilpay/production',
        private_access_enforced: true,
        versioning_enabled: true,
        destructive_lifecycle_disabled: true,
        restore_capability_verified: true,
        restore_drill_verified: true,
        last_verified_restore_at: new Date().toISOString(),
        restore_policy: {
          policy_id: 'wilpay-private-restore-v1',
          max_restore_drill_age_days: 30,
          restore_to_isolated_prefix_required: true,
          destructive_restore_overwrite_forbidden: true
        }
      }
    },
    readiness: {
      approval: {
        status: 'APPROVED',
        approved_by: 'infrastructure-owner',
        approved_at: '2026-09-11T09:00:00.000Z',
        evidence_ref: 'approval-record',
        resource_fingerprint: null
      }
    }
  };

  binding.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(binding);
  binding.isolation.storage_observed_identity.restore_evidence = {
    resource_id: binding.isolation.storage_resource_id,
    resource_fingerprint: binding.readiness.approval.resource_fingerprint,
    verified_at: binding.isolation.storage_observed_identity.last_verified_restore_at,
    evidence_ref: 'restore-drill/audit/restore-policy-fixture'
  };
  return binding;
}

const matching = approvedBinding();
const matchingResult = evaluateWilpayInfrastructureReadiness(matching);
assert.equal(matchingResult.ready, true, 'runtime restore policy evidence matching the approved lock must remain ready');

const mismatched = approvedBinding();
mismatched.isolation.storage_observed_identity.restore_policy.max_restore_drill_age_days = 120;
const mismatchedResult = evaluateWilpayInfrastructureReadiness(mismatched);
assert.equal(mismatchedResult.ready, false, 'runtime must fail closed when the observed restore policy differs from the approved lock');
assert.ok(mismatchedResult.reasons.includes('storage_restore_policy_mismatch'));

const missing = approvedBinding();
delete missing.isolation.storage_observed_identity.restore_policy;
const missingResult = evaluateWilpayInfrastructureReadiness(missing);
assert.equal(missingResult.ready, false, 'runtime must fail closed when restore policy evidence is missing');
assert.ok(missingResult.reasons.includes('storage_restore_policy_unverified'));

const serverBinding = approvedBinding();
delete serverBinding.isolation.database_observed_identity;
delete serverBinding.isolation.storage_observed_identity;
const serverRestoreVerifiedAt = new Date().toISOString();
const serverEnv = {
  WILPAY_SERVER_NEON_PROJECT_NAME: 'wilpay-production',
  WILPAY_SERVER_NEON_REGION_ID: 'us-east-2',
  WILPAY_SERVER_NEON_BRANCH_NAME: 'production',
  WILPAY_SERVER_NEON_DATABASE_NAME: 'wilpay',
  WILPAY_SERVER_NEON_ROLE_NAME: 'wilpay_app',
  WILPAY_SERVER_STORAGE_PROVIDER: 'private-object-storage',
  WILPAY_SERVER_STORAGE_RESOURCE_ID: 'wilpay-storage-resource',
  WILPAY_SERVER_STORAGE_PROVIDER_BINDING: 'wilpay-storage-binding',
  WILPAY_SERVER_STORAGE_ENDPOINT_ORIGIN: 'https://storage.wilpay.example',
  WILPAY_SERVER_STORAGE_BUCKET: 'wilpay-private-documents',
  WILPAY_SERVER_STORAGE_ROOT_PREFIX: 'wilpay/production',
  WILPAY_SERVER_STORAGE_PRIVATE_ACCESS_ENFORCED: 'true',
  WILPAY_SERVER_STORAGE_VERSIONING_ENABLED: 'true',
  WILPAY_SERVER_STORAGE_DESTRUCTIVE_LIFECYCLE_DISABLED: 'true',
  WILPAY_SERVER_STORAGE_RESTORE_CAPABILITY_VERIFIED: 'true',
  WILPAY_SERVER_STORAGE_RESTORE_DRILL_VERIFIED: 'true',
  WILPAY_SERVER_STORAGE_LAST_VERIFIED_RESTORE_AT: serverRestoreVerifiedAt,
  WILPAY_SERVER_STORAGE_RESTORE_POLICY_ID: 'wilpay-private-restore-v1',
  WILPAY_SERVER_STORAGE_MAX_RESTORE_DRILL_AGE_DAYS: '30',
  WILPAY_SERVER_STORAGE_RESTORE_TO_ISOLATED_PREFIX_REQUIRED: 'true',
  WILPAY_SERVER_STORAGE_DESTRUCTIVE_RESTORE_OVERWRITE_FORBIDDEN: 'true',
  WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_ID: 'wilpay-storage-resource',
  WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_FINGERPRINT: serverBinding.readiness.approval.resource_fingerprint,
  WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_VERIFIED_AT: serverRestoreVerifiedAt,
  WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_REF: 'restore-drill/audit/restore-policy-server-fixture',
  WILPAY_SERVER_PRIVATE_STORAGE_ENDPOINT_CONFIGURED: 'true',
  WILPAY_SERVER_UPLOAD_ORIGINS_CONFIGURED: 'true'
};

const serverReady = createWilpayServerRuntimeReadiness({ binding: serverBinding, env: serverEnv });
assert.equal(serverReady.ready, true, 'server runtime must attest the same restore policy that was approved');

const serverMismatch = createWilpayServerRuntimeReadiness({
  binding: serverBinding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_MAX_RESTORE_DRILL_AGE_DAYS: '120' }
});
assert.equal(serverMismatch.ready, false, 'server runtime must reject restore policy drift');
assert.ok(serverMismatch.reasons.includes('storage_restore_policy_mismatch'));

const clientExposedPolicy = createWilpayServerRuntimeReadiness({
  binding: serverBinding,
  env: { ...serverEnv, VITE_WILPAY_STORAGE_RESTORE_POLICY_ID: 'wilpay-private-restore-v1' }
});
assert.equal(clientExposedPolicy.ready, false, 'restore policy attestation must remain server-only');
assert.ok(clientExposedPolicy.reasons.includes('client_exposed_infrastructure_configuration'));

const clientExposedEvidence = createWilpayServerRuntimeReadiness({
  binding: serverBinding,
  env: { ...serverEnv, VITE_WILPAY_STORAGE_RESTORE_EVIDENCE_RESOURCE_ID: 'wilpay-storage-resource' }
});
assert.equal(clientExposedEvidence.ready, false, 'restore evidence identity must remain server-only');
assert.ok(clientExposedEvidence.reasons.includes('client_exposed_infrastructure_configuration'));

console.log('W.I.L Pay restore policy binding checks: PASS');
