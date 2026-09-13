import assert from 'node:assert/strict';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import * as readinessModule from '../scripts/wilpayInfrastructureReadinessGate.mjs';

assert.equal(
  typeof readinessModule.createWilpayPrivateRuntimeReadiness,
  'function',
  'private runtime must be composed through the infrastructure readiness gate'
);

const restorePolicy = {
  policy_id: 'wilpay-private-restore-v1',
  max_restore_drill_age_days: 30,
  restore_to_isolated_prefix_required: true,
  destructive_restore_overwrite_forbidden: true
};

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
    storage_provider: 'private-object-storage',
    storage_resource_id: 'wilpay-storage-resource',
    storage_provider_binding: 'wilpay-storage-binding',
    storage_endpoint_origin: 'https://storage.wilpay.example',
    storage_bucket: 'wilpay-private-documents',
    approved_exclusive_storage_resource_ids: ['wilpay-storage-resource'],
    approved_exclusive_storage_bindings: ['wilpay-storage-binding'],
    storage_restore_policy_lock: { ...restorePolicy },
    storage_layout: { root_prefix: 'wilpay/production' }
  },
  readiness: { approval: {} }
};

binding.readiness.approval = {
  status: 'APPROVED',
  approved_by: 'infrastructure-owner',
  approved_at: '2026-09-11T09:00:00.000Z',
  evidence_ref: 'approval-record',
  resource_fingerprint: computeWilpayResourceFingerprint(binding)
};

const observedDatabaseIdentity = {
  project_name: 'wilpay-production',
  region_id: 'us-east-2',
  branch_name: 'production',
  database_name: 'wilpay',
  role_name: 'wilpay_app'
};
const observedStorageIdentity = {
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
  restore_policy: { ...restorePolicy }
};

const before = JSON.stringify(binding);
const ready = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity,
  transportStatus: { endpoint_configured: true, upload_origins_configured: true }
});

assert.equal(ready.ready, true);
assert.equal(ready.status, 'READY');
assert.equal(ready.endpoint_configured, true);
assert.equal(ready.upload_origins_configured, true);
assert.deepEqual(ready.reasons, []);
assert.equal(JSON.stringify(binding), before, 'runtime observations must not mutate the persisted binding');
assert.equal('database_observed_identity' in binding.isolation, false);
assert.equal('storage_observed_identity' in binding.isolation, false);

const blocked = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity: { ...observedStorageIdentity, resource_id: 'different-storage' },
  transportStatus: { endpoint_configured: true, upload_origins_configured: true }
});
assert.equal(blocked.ready, false);
assert.ok(blocked.reasons.includes('storage_identity_mismatch'));

const publicBucket = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity: { ...observedStorageIdentity, private_access_enforced: false },
  transportStatus: { endpoint_configured: true, upload_origins_configured: true }
});
assert.equal(publicBucket.ready, false, 'runtime must fail closed when private bucket access is not observed');
assert.ok(publicBucket.reasons.includes('storage_private_access_unverified'));

const unversionedBucket = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity: { ...observedStorageIdentity, versioning_enabled: false },
  transportStatus: { endpoint_configured: true, upload_origins_configured: true }
});
assert.equal(unversionedBucket.ready, false, 'runtime must fail closed when bucket versioning is not observed');
assert.ok(unversionedBucket.reasons.includes('storage_versioning_unverified'));

const destructiveLifecycleBucket = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity: { ...observedStorageIdentity, destructive_lifecycle_disabled: false },
  transportStatus: { endpoint_configured: true, upload_origins_configured: true }
});
assert.equal(destructiveLifecycleBucket.ready, false, 'runtime must fail closed while destructive lifecycle deletion is enabled');
assert.ok(destructiveLifecycleBucket.reasons.includes('storage_destructive_lifecycle_unverified'));

const endpointMismatch = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity: { ...observedStorageIdentity, endpoint_origin: 'https://replacement-storage.wilpay.example' },
  transportStatus: { endpoint_configured: true, upload_origins_configured: true }
});
assert.equal(endpointMismatch.ready, false, 'runtime readiness must reject a Storage endpoint origin that differs from the approved binding');
assert.ok(endpointMismatch.reasons.includes('storage_identity_mismatch'));

const malformedObservedOrigin = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity: { ...observedStorageIdentity, endpoint_origin: 'https://storage.wilpay.example/private-upload' },
  transportStatus: { endpoint_configured: true, upload_origins_configured: true }
});
assert.equal(malformedObservedOrigin.ready, false, 'runtime readiness must reject a non-canonical observed Storage origin');
assert.ok(malformedObservedOrigin.reasons.includes('storage_observed_endpoint_origin_invalid'));

const missingTransport = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity,
  transportStatus: { endpoint_configured: false, upload_origins_configured: true }
});
assert.equal(missingTransport.ready, false);
assert.ok(missingTransport.reasons.includes('private_storage_endpoint_not_configured'));

console.log('W.I.L Pay private runtime readiness tests passed');
