import assert from 'node:assert/strict';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import { evaluateWilpayInfrastructureReadiness } from '../scripts/wilpayInfrastructureReadinessGate.mjs';

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

console.log('W.I.L Pay restore policy binding checks: PASS');
