import assert from 'node:assert/strict';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import * as readinessModule from '../scripts/wilpayInfrastructureReadinessGate.mjs';

assert.equal(
  typeof readinessModule.createWilpayPrivateRuntimeReadiness,
  'function',
  'private runtime must be composed through the infrastructure readiness gate'
);

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
    storage_bucket: 'wilpay-private-documents',
    approved_exclusive_storage_resource_ids: ['wilpay-storage-resource'],
    approved_exclusive_storage_bindings: ['wilpay-storage-binding'],
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
  bucket: 'wilpay-private-documents',
  root_prefix: 'wilpay/production'
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

const incompleteTransport = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity,
  transportStatus: { endpoint_configured: true, upload_origins_configured: false }
});
assert.equal(incompleteTransport.ready, false);
assert.ok(incompleteTransport.reasons.includes('upload_origins_not_configured'));

console.log('W.I.L Pay private runtime readiness tests passed');
