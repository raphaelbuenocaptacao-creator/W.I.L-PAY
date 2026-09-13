import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import {
  createWilpayServerRuntimeReadiness
} from '../scripts/wilpayInfrastructureReadinessGate.mjs';
import { validateWilpayRestoreEvidenceReference } from '../scripts/wilpayRestoreEvidence.mjs';

const sha256Policy = {
  evidence_ref_scheme: 'sha256'
};

assert.throws(
  () => validateWilpayRestoreEvidenceReference({ storage_observed_identity: {} }, sha256Policy),
  /restore evidence is required/i,
  'sha256 restore policy must fail closed when server-side restore evidence is absent'
);

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
  approved_at: '2026-09-13T10:00:00.000Z',
  evidence_ref: 'approval-record',
  resource_fingerprint: computeWilpayResourceFingerprint(binding)
};

const verifiedAt = new Date().toISOString();
const restoreManifest = {
  schema_version: 1,
  resource_id: binding.isolation.storage_resource_id,
  resource_fingerprint: binding.readiness.approval.resource_fingerprint,
  verified_at: verifiedAt,
  result: 'PASS',
  execution_id: 'restore-drill-server-fixture'
};
const evidenceRef = `sha256:${createHash('sha256')
  .update(JSON.stringify(restoreManifest), 'utf8')
  .digest('hex')}`;

const serverReady = createWilpayServerRuntimeReadiness({
  binding,
  env: {
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
    WILPAY_SERVER_STORAGE_LAST_VERIFIED_RESTORE_AT: verifiedAt,
    WILPAY_SERVER_STORAGE_RESTORE_POLICY_ID: restorePolicy.policy_id,
    WILPAY_SERVER_STORAGE_MAX_RESTORE_DRILL_AGE_DAYS: '30',
    WILPAY_SERVER_STORAGE_RESTORE_TO_ISOLATED_PREFIX_REQUIRED: 'true',
    WILPAY_SERVER_STORAGE_DESTRUCTIVE_RESTORE_OVERWRITE_FORBIDDEN: 'true',
    WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_SCHEMA_VERSION: '1',
    WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_ID: restoreManifest.resource_id,
    WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESOURCE_FINGERPRINT: restoreManifest.resource_fingerprint,
    WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_VERIFIED_AT: restoreManifest.verified_at,
    WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_RESULT: restoreManifest.result,
    WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_EXECUTION_ID: restoreManifest.execution_id,
    WILPAY_SERVER_STORAGE_RESTORE_EVIDENCE_REF: evidenceRef,
    WILPAY_SERVER_PRIVATE_STORAGE_ENDPOINT_CONFIGURED: 'true',
    WILPAY_SERVER_UPLOAD_ORIGINS_CONFIGURED: 'true'
  }
});

assert.equal(
  serverReady.ready,
  true,
  'server runtime must be able to reach READY when the complete canonical restore manifest is supplied'
);
assert.deepEqual(serverReady.reasons, []);

console.log('W.I.L Pay restore evidence fail-closed checks: PASS');
