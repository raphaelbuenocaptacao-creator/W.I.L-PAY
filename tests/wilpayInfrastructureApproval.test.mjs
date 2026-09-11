import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeWilpayResourceFingerprint } from '../scripts/wilpayResourceFingerprint.mjs';

const raw = await readFile(new URL('../infra/wilpay-infrastructure-binding.json', import.meta.url), 'utf8');
const binding = JSON.parse(raw);

const approval = binding.readiness?.approval;
assert.equal(Boolean(approval), true, 'explicit infrastructure approval record is required');
assert.equal(['PENDING', 'APPROVED'].includes(approval.status), true, 'approval status must be PENDING or APPROVED');

const isolation = binding.isolation;
const databaseApproved = Boolean(
  isolation.database_project_id &&
  isolation.database_org_id &&
  isolation.approved_exclusive_database_project_ids.includes(isolation.database_project_id) &&
  isolation.approved_exclusive_database_org_ids.includes(isolation.database_org_id)
);
const storageApproved = Boolean(
  isolation.storage_provider &&
  isolation.storage_resource_id &&
  isolation.storage_provider_binding &&
  isolation.approved_exclusive_storage_resource_ids.includes(isolation.storage_resource_id) &&
  isolation.approved_exclusive_storage_bindings.includes(isolation.storage_provider_binding)
);
const resourcesApproved = databaseApproved && storageApproved;

if (!resourcesApproved) {
  assert.equal(approval.status, 'PENDING', 'approval must remain pending until all exclusive resources are bound and allowlisted');
  assert.equal(approval.approved_by, null, 'approved_by must remain empty before approval');
  assert.equal(approval.approved_at, null, 'approved_at must remain empty before approval');
  assert.equal(approval.evidence_ref, null, 'evidence_ref must remain empty before approval');
  assert.equal(approval.resource_fingerprint, null, 'resource_fingerprint must remain empty before approval');
  assert.equal(binding.readiness.status, 'BLOCKED_EXTERNAL_BINDING');
} else {
  assert.equal(approval.status, 'APPROVED', 'fully bound exclusive resources still require explicit approval');
  assert.equal(typeof approval.approved_by, 'string');
  assert.equal(approval.approved_by.trim().length > 0, true, 'approved_by is required');
  assert.equal(typeof approval.approved_at, 'string');
  assert.equal(Number.isNaN(Date.parse(approval.approved_at)), false, 'approved_at must be a valid timestamp');
  assert.equal(typeof approval.evidence_ref, 'string');
  assert.equal(approval.evidence_ref.trim().length > 0, true, 'evidence_ref is required');
  assert.equal(typeof approval.resource_fingerprint, 'string');
  assert.match(approval.resource_fingerprint, /^[a-f0-9]{64}$/i, 'resource_fingerprint must be SHA-256 hex');
  assert.equal(
    approval.resource_fingerprint,
    computeWilpayResourceFingerprint(binding),
    'approved fingerprint must match the currently bound Neon and Storage identities'
  );
}

for (const key of ['approved_by', 'approved_at', 'evidence_ref', 'resource_fingerprint']) {
  const value = approval?.[key];
  if (value) {
    assert.equal(/password|token|secret|service_role|connection_string/i.test(value), false, `${key} must not contain secret material`);
  }
}

const candidate = structuredClone(binding);
candidate.isolation.database_project_id = 'project-wilpay-exclusive';
candidate.isolation.database_org_id = 'org-wilpay-exclusive';
candidate.isolation.storage_provider = 'private-storage-provider';
candidate.isolation.storage_resource_id = 'storage-wilpay-exclusive';
candidate.isolation.storage_provider_binding = 'binding-wilpay-production';

const fingerprint = computeWilpayResourceFingerprint(candidate);
assert.match(fingerprint, /^[a-f0-9]{64}$/i, 'fingerprint must be a SHA-256 hex digest');
assert.equal(
  computeWilpayResourceFingerprint(structuredClone(candidate)),
  fingerprint,
  'fingerprint must be deterministic for the same resource identities'
);

const changedStorage = structuredClone(candidate);
changedStorage.isolation.storage_resource_id = 'storage-wilpay-replaced';
assert.notEqual(
  computeWilpayResourceFingerprint(changedStorage),
  fingerprint,
  'changing an exclusive resource identity must invalidate the fingerprint'
);

assert.throws(
  () => computeWilpayResourceFingerprint(binding),
  /complete exclusive resource binding/i,
  'fingerprint generation must fail closed while resource identities are incomplete'
);

console.log('W.I.L Pay explicit infrastructure approval checks: PASS');
