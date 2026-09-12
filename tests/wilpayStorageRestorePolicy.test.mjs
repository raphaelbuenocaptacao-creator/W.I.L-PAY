import assert from 'node:assert/strict';
import fs from 'node:fs';

const raw = fs.readFileSync(new URL('../infra/wilpay-storage-restore-policy.json', import.meta.url), 'utf8');
const policy = JSON.parse(raw);

assert.equal(policy.project, 'wilpay');
assert.equal(policy.environment, 'production');
assert.equal(policy.storage_private_required, true);
assert.equal(policy.versioning_required, true);
assert.equal(policy.restore_capability_required, true);
assert.equal(policy.restore_drill_required, true);
assert.equal(policy.destructive_restore_overwrite_forbidden, true);
assert.equal(policy.restore_to_isolated_prefix_required, true);
assert.equal(policy.evidence_server_side_only, true);
assert.ok(Number.isInteger(policy.max_restore_drill_age_days) && policy.max_restore_drill_age_days > 0 && policy.max_restore_drill_age_days <= 90);
assert.ok(Number.isInteger(policy.minimum_complete_clients) && policy.minimum_complete_clients >= 1000);
assert.deepEqual(
  policy.required_categories,
  ['documents', 'selfies', 'receipts', 'guarantees', 'history'],
  'restore drills must cover every private Storage category'
);
assert.equal(policy.status, 'BLOCKED_EXTERNAL_BINDING', 'restore readiness must fail closed until real provider evidence exists');
assert.equal(policy.last_verified_restore_at, null);
assert.equal(policy.evidence_ref, null);

const serialized = JSON.stringify(policy);
assert.doesNotMatch(serialized, /service_role|api[_-]?key|password|token|secret/i, 'restore policy must not contain credentials or secrets');

console.log('W.I.L Pay storage restore policy: PASS');
