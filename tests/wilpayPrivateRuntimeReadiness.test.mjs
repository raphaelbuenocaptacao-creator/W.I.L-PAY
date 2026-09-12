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
    storage_endpoint_origin: 'https://storage.wilpay.example',
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
  endpoint_origin: 'https://storage.wilpay.example',
  bucket: 'wilpay-private-documents',
  root_prefix: 'wilpay/production',
  private_access_enforced: true,
  versioning_enabled: true,
  destructive_lifecycle_disabled: true
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

const incompleteTransport = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity,
  transportStatus: { endpoint_configured: true, upload_origins_configured: false }
});
assert.equal(incompleteTransport.ready, false);
assert.ok(incompleteTransport.reasons.includes('upload_origins_not_configured'));

const stringFalseTransport = readinessModule.createWilpayPrivateRuntimeReadiness({
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity,
  transportStatus: { endpoint_configured: 'false', upload_origins_configured: 'false' }
});
assert.equal(stringFalseTransport.ready, false, 'transport readiness must reject truthy string values');
assert.equal(stringFalseTransport.endpoint_configured, false);
assert.equal(stringFalseTransport.upload_origins_configured, false);
assert.ok(stringFalseTransport.reasons.includes('private_storage_endpoint_not_configured'));
assert.ok(stringFalseTransport.reasons.includes('upload_origins_not_configured'));

assert.equal(
  typeof readinessModule.createWilpayServerRuntimeReadiness,
  'function',
  'server runtime must derive infrastructure readiness only from server-scoped configuration'
);

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
  WILPAY_SERVER_PRIVATE_STORAGE_ENDPOINT_CONFIGURED: 'true',
  WILPAY_SERVER_UPLOAD_ORIGINS_CONFIGURED: 'true'
};

const serverReady = readinessModule.createWilpayServerRuntimeReadiness({ binding, env: serverEnv });
assert.equal(serverReady.ready, true);
assert.equal(serverReady.endpoint_configured, true);
assert.equal(serverReady.upload_origins_configured, true);
assert.deepEqual(serverReady.reasons, []);

const serverPublicBucket = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_PRIVATE_ACCESS_ENFORCED: 'false' }
});
assert.equal(serverPublicBucket.ready, false);
assert.ok(serverPublicBucket.reasons.includes('storage_private_access_unverified'));

const serverUnversionedBucket = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_VERSIONING_ENABLED: 'false' }
});
assert.equal(serverUnversionedBucket.ready, false);
assert.ok(serverUnversionedBucket.reasons.includes('storage_versioning_unverified'));

const serverDestructiveLifecycle = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_DESTRUCTIVE_LIFECYCLE_DISABLED: 'false' }
});
assert.equal(serverDestructiveLifecycle.ready, false);
assert.ok(serverDestructiveLifecycle.reasons.includes('storage_destructive_lifecycle_unverified'));

const serverEndpointMismatch = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_ENDPOINT_ORIGIN: 'https://replacement-storage.wilpay.example' }
});
assert.equal(serverEndpointMismatch.ready, false, 'server readiness must bind the observed Storage origin to the approved resource');
assert.ok(serverEndpointMismatch.reasons.includes('storage_identity_mismatch'));

const clientExposedConfig = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, VITE_WILPAY_STORAGE_RESOURCE_ID: 'client-visible-storage' }
});
assert.equal(clientExposedConfig.ready, false);
assert.ok(clientExposedConfig.reasons.includes('client_exposed_infrastructure_configuration'));

const clientExposedVersioning = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, VITE_WILPAY_STORAGE_VERSIONING_ENABLED: 'true' }
});
assert.equal(clientExposedVersioning.ready, false);
assert.ok(clientExposedVersioning.reasons.includes('client_exposed_infrastructure_configuration'));

const clientExposedLifecycle = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, VITE_WILPAY_STORAGE_DESTRUCTIVE_LIFECYCLE_DISABLED: 'true' }
});
assert.equal(clientExposedLifecycle.ready, false);
assert.ok(clientExposedLifecycle.reasons.includes('client_exposed_infrastructure_configuration'));

const malformedServerFlag = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_PRIVATE_STORAGE_ENDPOINT_CONFIGURED: 'TRUE' }
});
assert.equal(malformedServerFlag.ready, false);
assert.equal(malformedServerFlag.endpoint_configured, false);
assert.ok(malformedServerFlag.reasons.includes('server_transport_flag_invalid'));

const missingPrivateEvidence = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_PRIVATE_ACCESS_ENFORCED: undefined }
});
assert.equal(missingPrivateEvidence.ready, false);
assert.ok(missingPrivateEvidence.reasons.includes('server_storage_private_flag_invalid'));

const missingVersioningEvidence = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_VERSIONING_ENABLED: undefined }
});
assert.equal(missingVersioningEvidence.ready, false);
assert.ok(missingVersioningEvidence.reasons.includes('server_storage_versioning_flag_invalid'));

const missingLifecycleEvidence = readinessModule.createWilpayServerRuntimeReadiness({
  binding,
  env: { ...serverEnv, WILPAY_SERVER_STORAGE_DESTRUCTIVE_LIFECYCLE_DISABLED: undefined }
});
assert.equal(missingLifecycleEvidence.ready, false);
assert.ok(missingLifecycleEvidence.reasons.includes('server_storage_lifecycle_flag_invalid'));

console.log('W.I.L Pay private runtime readiness tests passed');
