import assert from 'node:assert/strict';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import { evaluateWilpayInfrastructureReadiness } from '../scripts/wilpayInfrastructureReadinessGate.mjs';

function approvedBinding() {
  const binding = {
    project: 'wilpay',
    environment: 'production',
    isolation: {
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
      storage_layout: { root_prefix: 'wilpay/production' },
      storage_observed_identity: {
        provider: 'private-storage-provider', resource_id: 'storage-wilpay-exclusive', provider_binding: 'binding-wilpay-production',
        endpoint_origin: 'https://storage.wilpay.example', bucket: 'wilpay-private-documents', root_prefix: 'wilpay/production',
        private_access_enforced: true, versioning_enabled: true, destructive_lifecycle_disabled: true,
        restore_capability_verified: true, restore_drill_verified: true, last_verified_restore_at: new Date().toISOString()
      }
    },
    readiness: { approval: { status: 'APPROVED', approved_by: 'infrastructure-owner', approved_at: new Date().toISOString(), evidence_ref: 'approval-record', resource_fingerprint: null } }
  };
  binding.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(binding);
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
const blockedStale = evaluateWilpayInfrastructureReadiness(staleRestoreDrill);
assert.equal(blockedStale.ready, false, 'readiness must fail closed when the last restore drill is older than 30 days');
assert.ok(blockedStale.reasons.includes('storage_restore_drill_stale'));

console.log('W.I.L Pay storage restore runtime readiness checks: PASS');
