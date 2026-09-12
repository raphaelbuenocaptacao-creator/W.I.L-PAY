import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';
import { evaluateWilpayInfrastructureReadiness } from '../scripts/wilpayInfrastructureReadinessGate.mjs';

const raw = await readFile(new URL('../infra/wilpay-infrastructure-binding.json', import.meta.url), 'utf8');
const binding = JSON.parse(raw);

const blocked = evaluateWilpayInfrastructureReadiness(binding);
assert.equal(blocked.ready, false, 'incomplete external binding must fail closed');
assert.equal(blocked.status, 'BLOCKED_EXTERNAL_BINDING');
assert.equal(blocked.reasons.includes('database_binding_incomplete'), true);
assert.equal(blocked.reasons.includes('storage_binding_incomplete'), true);
assert.equal(blocked.reasons.includes('explicit_approval_missing'), true);

const approved = structuredClone(binding);
approved.isolation.database_project_id = 'project-wilpay-exclusive';
approved.isolation.database_org_id = 'org-wilpay-exclusive';
approved.isolation.approved_exclusive_database_project_ids = ['project-wilpay-exclusive'];
approved.isolation.approved_exclusive_database_org_ids = ['org-wilpay-exclusive'];
approved.isolation.database_observed_identity = {
  project_name: 'wilpay-production',
  region_id: 'us-east-2',
  branch_name: 'production',
  database_name: 'wilpay',
  role_name: 'wilpay_app'
};
approved.isolation.storage_provider = 'private-storage-provider';
approved.isolation.storage_resource_id = 'storage-wilpay-exclusive';
approved.isolation.storage_provider_binding = 'binding-wilpay-production';
approved.isolation.storage_endpoint_origin = 'https://storage.wilpay.example';
approved.isolation.approved_exclusive_storage_resource_ids = ['storage-wilpay-exclusive'];
approved.isolation.approved_exclusive_storage_bindings = ['binding-wilpay-production'];
approved.isolation.storage_observed_identity = {
  provider: 'private-storage-provider',
  resource_id: 'storage-wilpay-exclusive',
  provider_binding: 'binding-wilpay-production',
  endpoint_origin: 'https://storage.wilpay.example',
  bucket: 'wilpay-private-documents',
  root_prefix: 'wilpay/production'
};
approved.readiness.approval.status = 'APPROVED';
approved.readiness.approval.approved_by = 'infrastructure-owner';
approved.readiness.approval.approved_at = '2026-09-11T06:00:00.000Z';
approved.readiness.approval.evidence_ref = 'approval-record-001';
approved.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(approved);

const ready = evaluateWilpayInfrastructureReadiness(approved);
assert.equal(ready.ready, true, 'fully allowlisted, identity-matched and fingerprinted resources must pass the gate');
assert.equal(ready.status, 'READY');
assert.deepEqual(ready.reasons, []);

const nonCanonicalStorageOrigin = structuredClone(approved);
nonCanonicalStorageOrigin.isolation.storage_endpoint_origin = 'https://storage.wilpay.example/private-upload';
nonCanonicalStorageOrigin.isolation.storage_observed_identity.endpoint_origin = 'https://storage.wilpay.example/private-upload';
nonCanonicalStorageOrigin.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(nonCanonicalStorageOrigin);
const rejectedNonCanonicalOrigin = evaluateWilpayInfrastructureReadiness(nonCanonicalStorageOrigin);
assert.equal(rejectedNonCanonicalOrigin.ready, false, 'approved Storage endpoint must be a canonical HTTPS origin without a path');
assert.equal(rejectedNonCanonicalOrigin.reasons.includes('storage_endpoint_origin_invalid'), true);

const missingObservedIdentity = structuredClone(approved);
delete missingObservedIdentity.isolation.database_observed_identity;
missingObservedIdentity.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(missingObservedIdentity);
const missingIdentity = evaluateWilpayInfrastructureReadiness(missingObservedIdentity);
assert.equal(missingIdentity.ready, false, 'readiness must fail closed without observed Neon identity');
assert.equal(missingIdentity.reasons.includes('database_identity_unverified'), true);

const mismatchedObservedIdentity = structuredClone(approved);
mismatchedObservedIdentity.isolation.database_observed_identity.region_id = 'eu-central-1';
mismatchedObservedIdentity.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(mismatchedObservedIdentity);
const identityMismatch = evaluateWilpayInfrastructureReadiness(mismatchedObservedIdentity);
assert.equal(identityMismatch.ready, false, 'observed Neon identity must match the locked production identity');
assert.equal(identityMismatch.reasons.includes('database_identity_mismatch'), true);

const missingObservedStorage = structuredClone(approved);
delete missingObservedStorage.isolation.storage_observed_identity;
missingObservedStorage.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(missingObservedStorage);
const missingStorageIdentity = evaluateWilpayInfrastructureReadiness(missingObservedStorage);
assert.equal(missingStorageIdentity.ready, false, 'readiness must fail closed without observed private Storage identity');
assert.equal(missingStorageIdentity.reasons.includes('storage_identity_unverified'), true);

const mismatchedObservedStorage = structuredClone(approved);
mismatchedObservedStorage.isolation.storage_observed_identity.bucket = 'shared-or-replaced-bucket';
mismatchedObservedStorage.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(mismatchedObservedStorage);
const storageIdentityMismatch = evaluateWilpayInfrastructureReadiness(mismatchedObservedStorage);
assert.equal(storageIdentityMismatch.ready, false, 'observed Storage identity must match the locked W.I.L Pay binding');
assert.equal(storageIdentityMismatch.reasons.includes('storage_identity_mismatch'), true);

const mismatchedObservedStorageOrigin = structuredClone(approved);
mismatchedObservedStorageOrigin.isolation.storage_observed_identity.endpoint_origin = 'https://replacement-storage.wilpay.example';
mismatchedObservedStorageOrigin.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(mismatchedObservedStorageOrigin);
const storageOriginIdentityMismatch = evaluateWilpayInfrastructureReadiness(mismatchedObservedStorageOrigin);
assert.equal(storageOriginIdentityMismatch.ready, false, 'observed Storage endpoint origin must match the locked W.I.L Pay binding');
assert.equal(storageOriginIdentityMismatch.reasons.includes('storage_identity_mismatch'), true);

const replacedStorage = structuredClone(approved);
replacedStorage.isolation.storage_resource_id = 'storage-silently-replaced';
replacedStorage.isolation.approved_exclusive_storage_resource_ids.push('storage-silently-replaced');
const tampered = evaluateWilpayInfrastructureReadiness(replacedStorage);
assert.equal(tampered.ready, false, 'resource replacement must invalidate readiness');
assert.equal(tampered.reasons.includes('resource_fingerprint_mismatch'), true);

const replacedStorageOrigin = structuredClone(approved);
replacedStorageOrigin.isolation.storage_endpoint_origin = 'https://replacement-storage.wilpay.example';
const tamperedOrigin = evaluateWilpayInfrastructureReadiness(replacedStorageOrigin);
assert.equal(tamperedOrigin.ready, false, 'storage endpoint origin replacement must invalidate readiness');
assert.equal(tamperedOrigin.reasons.includes('resource_fingerprint_mismatch'), true);

const unallowlistedDatabase = structuredClone(approved);
unallowlistedDatabase.isolation.database_project_id = 'project-not-approved';
unallowlistedDatabase.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(unallowlistedDatabase);
const rejected = evaluateWilpayInfrastructureReadiness(unallowlistedDatabase);
assert.equal(rejected.ready, false, 'database project must be explicitly allowlisted');
assert.equal(rejected.reasons.includes('database_binding_not_allowlisted'), true);

console.log('W.I.L Pay infrastructure readiness gate checks: PASS');
