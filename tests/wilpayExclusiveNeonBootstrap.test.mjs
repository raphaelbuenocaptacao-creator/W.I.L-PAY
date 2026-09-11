import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../infra/wilpay-exclusive-neon-bootstrap.json', import.meta.url), 'utf8');
const manifest = JSON.parse(raw);
const normalized = raw.toLowerCase();

assert.equal(manifest.schema_version, 1);
assert.equal(manifest.project, 'wilpay');
assert.equal(manifest.environment, 'production');
assert.equal(manifest.status, 'PREPARED_NOT_PROVISIONED');
assert.equal(manifest.auto_apply, false);

assert.equal(manifest.database.provider, 'neon');
assert.equal(manifest.database.project_name, 'wilpay-production');
assert.equal(manifest.database.region_id, 'us-east-2');
assert.equal(manifest.database.branch_name, 'production');
assert.equal(manifest.database.database_name, 'wilpay');
assert.equal(manifest.database.role_name, 'wilpay_app');

assert.equal(manifest.isolation.exclusive_project_required, true);
assert.equal(manifest.isolation.shared_project_forbidden, true);
assert.equal(manifest.isolation.bind_only_after_explicit_resource_approval, true);
assert.equal(manifest.isolation.binding_file, 'infra/wilpay-infrastructure-binding.json');

for (const token of ['captapro', 'gamificacao']) {
  assert.equal(manifest.isolation.forbidden_project_tokens.includes(token), true);
  assert.equal(manifest.database.project_name.toLowerCase().includes(token), false);
  assert.equal(manifest.database.database_name.toLowerCase().includes(token), false);
  assert.equal(manifest.database.role_name.toLowerCase().includes(token), false);
}

assert.equal(manifest.security.credentials_in_repository_forbidden, true);
assert.equal(manifest.security.connection_string_in_repository_forbidden, true);
assert.equal(manifest.security.service_role_in_repository_forbidden, true);
assert.equal(manifest.security.server_side_database_access_only, true);
assert.equal(manifest.security.audit_log_required, true);
assert.equal(manifest.security.destructive_migration_requires_explicit_approval, true);

assert.equal(manifest.data_policy.binary_payloads_in_database_forbidden, true);
assert.equal(manifest.data_policy.database_stores_file_metadata_only, true);
assert.equal(manifest.data_policy.private_storage_required_for_new_uploads_after_binding, true);

assert.equal(manifest.provisioning_gate.requires_external_authorization, true);
assert.equal(manifest.provisioning_gate.requires_cost_confirmation_when_applicable, true);
for (const requirement of [
  'exclusive_neon_org_id',
  'exclusive_neon_project_authorization',
  'private_storage_resource_authorization'
]) {
  assert.equal(manifest.provisioning_gate.required_before_apply.includes(requirement), true);
}

for (const forbiddenSecretToken of [
  'postgresql://',
  'service_role',
  'access_token',
  'refresh_token',
  'secret_key',
  'private_key',
  'password'
]) {
  assert.equal(normalized.includes(forbiddenSecretToken), false, `bootstrap manifest must not contain secret material: ${forbiddenSecretToken}`);
}

console.log('W.I.L Pay exclusive Neon bootstrap checks: PASS');
