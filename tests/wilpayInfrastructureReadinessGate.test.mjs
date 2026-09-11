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
approved.isolation.storage_provider = 'private-storage-provider';
approved.isolation.storage_resource_id = 'storage-wilpay-exclusive';
approved.isolation.storage_provider_binding = 'binding-wilpay-production';
approved.isolation.approved_exclusive_storage_resource_ids = ['storage-wilpay-exclusive'];
approved.isolation.approved_exclusive_storage_bindings = ['binding-wilpay-production'];
approved.readiness.approval.status = 'APPROVED';
approved.readiness.approval.approved_by = 'infrastructure-owner';
approved.readiness.approval.approved_at = '2026-09-11T06:00:00.000Z';
approved.readiness.approval.evidence_ref = 'approval-record-001';
approved.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(approved);

const ready = evaluateWilpayInfrastructureReadiness(approved);
assert.equal(ready.ready, true, 'fully allowlisted and fingerprinted resources must pass the gate');
assert.equal(ready.status, 'READY');
assert.deepEqual(ready.reasons, []);

const replacedStorage = structuredClone(approved);
replacedStorage.isolation.storage_resource_id = 'storage-silently-replaced';
replacedStorage.isolation.approved_exclusive_storage_resource_ids.push('storage-silently-replaced');
const tampered = evaluateWilpayInfrastructureReadiness(replacedStorage);
assert.equal(tampered.ready, false, 'resource replacement must invalidate readiness');
assert.equal(tampered.reasons.includes('resource_fingerprint_mismatch'), true);

const unallowlistedDatabase = structuredClone(approved);
unallowlistedDatabase.isolation.database_project_id = 'project-not-approved';
unallowlistedDatabase.readiness.approval.resource_fingerprint = computeWilpayResourceFingerprint(unallowlistedDatabase);
const rejected = evaluateWilpayInfrastructureReadiness(unallowlistedDatabase);
assert.equal(rejected.ready, false, 'database project must be explicitly allowlisted');
assert.equal(rejected.reasons.includes('database_binding_not_allowlisted'), true);

console.log('W.I.L Pay infrastructure readiness gate checks: PASS');
