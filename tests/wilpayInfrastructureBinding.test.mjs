import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../infra/wilpay-infrastructure-binding.json', import.meta.url), 'utf8');
const binding = JSON.parse(raw);
const normalized = raw.toLowerCase();

assert.equal(binding.project, 'wilpay');
assert.equal(binding.environment, 'production');
assert.equal(binding.isolation.exclusive, true);
assert.equal(binding.isolation.database_provider, 'neon');
assert.equal(binding.isolation.storage_bucket, 'wilpay-private-documents');
assert.equal(binding.isolation.storage_private, true);
assert.equal(binding.capacity.minimum_complete_clients >= 1000, true);
assert.equal(binding.data_policy.database_binary_payloads, false);
assert.equal(binding.data_policy.database_stores_metadata_only, true);
assert.equal(binding.data_policy.private_storage_required_for_new_uploads_when_bound, true);

for (const forbidden of ['captapro', 'gamificacao']) {
  assert.equal(binding.isolation.forbidden_shared_projects.includes(forbidden), true);
}

const externallyBound = Boolean(
  binding.isolation.database_project_id &&
  binding.isolation.database_org_id &&
  binding.isolation.storage_provider_binding
);

if (!externallyBound) {
  assert.equal(binding.readiness.status, 'BLOCKED_EXTERNAL_BINDING');
}

for (const secretLike of ['service_role', 'password', 'access_token', 'refresh_token', 'secret_key', 'private_key']) {
  assert.equal(normalized.includes(secretLike), false, `binding must not contain secret field: ${secretLike}`);
}

console.log('W.I.L Pay exclusive infrastructure binding checks: PASS');
