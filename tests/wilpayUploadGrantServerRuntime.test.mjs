import assert from 'node:assert/strict';
import { createWilpayUploadGrantServerRuntime } from '../src/lib/wilpayUploadGrantServerRuntime.js';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';

const nowMs = Date.parse('2026-09-12T09:30:00Z');
const payload = {
  request_id: 'req_runtime_001',
  upload_id: '123e4567-e89b-42d3-a456-426614174000',
  owner_user_id: 'user_123',
  file_id: 'file_456',
  loan_id: 'loan_789',
  document_type: 'document',
  bucket: 'wilpay-private-documents',
  object_key: 'wilpay/production/user_123/documents/file_456',
  content_type: 'application/pdf',
  size_bytes: 1024,
  checksum_sha256: 'c'.repeat(64)
};

const calls = [];
const runtime = createWilpayUploadGrantServerRuntime({
  query: async (sql, params) => {
    calls.push(['issue', sql, params]);
    return { rows: [{ issued: true }] };
  },
  checkPrivateInfrastructureReady: async () => {
    calls.push(['readiness']);
    return { ready: true, status: 'READY', reasons: [] };
  },
  allowLegacyReadinessChecker: true,
  consumeGrantNonce: async (nonce) => {
    calls.push(['consume', nonce]);
    return true;
  },
  signPrivateUpload: async (authorized) => {
    calls.push(['sign', authorized]);
    return {
      request_id: authorized.request_id,
      upload_id: authorized.upload_id,
      bucket: authorized.bucket,
      object_key: authorized.object_key,
      content_type: authorized.content_type,
      checksum_sha256: authorized.checksum_sha256,
      method: 'PUT',
      upload_url: 'https://storage.example.invalid/upload/opaque',
      expires_at: new Date(nowMs + 5 * 60 * 1000).toISOString()
    };
  },
  now: () => nowMs
});

const grant = await runtime(payload, { authenticatedUserId: 'user_123' });
assert.deepEqual(calls.map(([name]) => name), ['readiness', 'issue', 'consume', 'sign']);
assert.equal(grant.upload_id, payload.upload_id);
assert.equal(grant.object_key, payload.object_key);
assert.equal('secret' in grant, false);
assert.match(calls[1][1], /wilpay_issue_upload_grant_nonce/i);
assert.equal(calls[1][2][1], payload.upload_id);

await assert.rejects(
  async () => createWilpayUploadGrantServerRuntime({
    consumeGrantNonce: async () => true,
    signPrivateUpload: async () => ({})
  }),
  /database query function is required/i
);

let consumed = 0;
let signed = 0;
const failClosed = createWilpayUploadGrantServerRuntime({
  query: async () => ({ rows: [{ issued: false }] }),
  checkPrivateInfrastructureReady: async () => ({ ready: true, status: 'READY', reasons: [] }),
  allowLegacyReadinessChecker: true,
  consumeGrantNonce: async () => {
    consumed += 1;
    return true;
  },
  signPrivateUpload: async () => {
    signed += 1;
    return {};
  },
  now: () => nowMs
});

await assert.rejects(
  failClosed(payload, { authenticatedUserId: 'user_123' }),
  /nonce could not be persisted/i
);
assert.equal(consumed, 0, 'nonce consumer must not run when persistence fails');
assert.equal(signed, 0, 'storage signer must not run when persistence fails');

let blockedQueries = 0;
let blockedConsumed = 0;
let blockedSigned = 0;
const blockedByInfrastructure = createWilpayUploadGrantServerRuntime({
  query: async () => {
    blockedQueries += 1;
    return { rows: [{ issued: true }] };
  },
  checkPrivateInfrastructureReady: async () => ({
    ready: false,
    status: 'BLOCKED_EXTERNAL_BINDING',
    reasons: ['database_identity_mismatch']
  }),
  allowLegacyReadinessChecker: true,
  consumeGrantNonce: async () => {
    blockedConsumed += 1;
    return true;
  },
  signPrivateUpload: async () => {
    blockedSigned += 1;
    return {};
  },
  now: () => nowMs
});

await assert.rejects(
  blockedByInfrastructure(payload, { authenticatedUserId: 'user_123' }),
  /private infrastructure is not ready/i
);
assert.equal(blockedQueries, 0, 'database nonce issue must not run when infrastructure is not ready');
assert.equal(blockedConsumed, 0, 'nonce consumer must not run when infrastructure is not ready');
assert.equal(blockedSigned, 0, 'storage signer must not run when infrastructure is not ready');

assert.throws(
  () => createWilpayUploadGrantServerRuntime({
    query: async () => ({ rows: [{ issued: true }] }),
    consumeGrantNonce: async () => true,
    signPrivateUpload: async () => ({})
  }),
  /private infrastructure readiness checker is required/i
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
      project_name: 'wilpay-production', region_id: 'us-east-2', branch_name: 'production', database_name: 'wilpay', role_name: 'wilpay_app'
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
  status: 'APPROVED', approved_by: 'infrastructure-owner', approved_at: '2026-09-12T09:00:00.000Z', evidence_ref: 'approval-record',
  resource_fingerprint: computeWilpayResourceFingerprint(binding)
};
const env = {
  WILPAY_SERVER_NEON_PROJECT_NAME: 'wilpay-production',
  WILPAY_SERVER_NEON_REGION_ID: 'us-east-2',
  WILPAY_SERVER_NEON_BRANCH_NAME: 'production',
  WILPAY_SERVER_NEON_DATABASE_NAME: 'wilpay',
  WILPAY_SERVER_NEON_ROLE_NAME: 'wilpay_app',
  WILPAY_SERVER_STORAGE_PROVIDER: 'private-object-storage',
  WILPAY_SERVER_STORAGE_RESOURCE_ID: 'wilpay-storage-resource',
  WILPAY_SERVER_STORAGE_PROVIDER_BINDING: 'wilpay-storage-binding',
  WILPAY_SERVER_STORAGE_BUCKET: 'wilpay-private-documents',
  WILPAY_SERVER_STORAGE_ROOT_PREFIX: 'wilpay/production',
  WILPAY_SERVER_PRIVATE_STORAGE_ENDPOINT_CONFIGURED: 'true',
  WILPAY_SERVER_UPLOAD_ORIGINS_CONFIGURED: 'true'
};

let boundQueries = 0;
const boundRuntime = createWilpayUploadGrantServerRuntime({
  query: async () => {
    boundQueries += 1;
    return { rows: [{ issued: true }] };
  },
  infrastructureBinding: binding,
  serverEnv: env,
  consumeGrantNonce: async () => true,
  signPrivateUpload: async (authorized) => ({
    request_id: authorized.request_id,
    upload_id: authorized.upload_id,
    bucket: authorized.bucket,
    object_key: authorized.object_key,
    content_type: authorized.content_type,
    checksum_sha256: authorized.checksum_sha256,
    method: 'PUT',
    upload_url: 'https://storage.example.invalid/upload/opaque',
    expires_at: new Date(nowMs + 5 * 60 * 1000).toISOString()
  }),
  now: () => nowMs
});
await boundRuntime(payload, { authenticatedUserId: 'user_123' });
assert.equal(boundQueries, 1, 'bound readiness should allow the nonce issue when identities match');

let mismatchQueries = 0;
const mismatchedBoundRuntime = createWilpayUploadGrantServerRuntime({
  query: async () => {
    mismatchQueries += 1;
    return { rows: [{ issued: true }] };
  },
  infrastructureBinding: binding,
  serverEnv: { ...env, WILPAY_SERVER_STORAGE_RESOURCE_ID: 'different-storage' },
  checkPrivateInfrastructureReady: async () => ({ ready: true }),
  consumeGrantNonce: async () => true,
  signPrivateUpload: async () => ({}),
  now: () => nowMs
});
await assert.rejects(
  mismatchedBoundRuntime(payload, { authenticatedUserId: 'user_123' }),
  /private infrastructure is not ready/i
);
assert.equal(mismatchQueries, 0, 'manual readiness must not override a mismatched bound infrastructure identity');

assert.throws(
  () => createWilpayUploadGrantServerRuntime({
    query: async () => ({ rows: [{ issued: true }] }),
    checkPrivateInfrastructureReady: async () => ({ ready: true }),
    consumeGrantNonce: async () => true,
    signPrivateUpload: async () => ({})
  }),
  /exclusive infrastructure binding and server environment are required/i
);

console.log('PASS wilpayUploadGrantServerRuntime');
