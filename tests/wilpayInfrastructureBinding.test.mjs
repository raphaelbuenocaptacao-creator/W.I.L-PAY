import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../infra/wilpay-infrastructure-binding.json', import.meta.url), 'utf8');
const binding = JSON.parse(raw);
const normalized = raw.toLowerCase();

assert.equal(binding.schema_version >= 4, true);
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

const layout = binding.isolation.storage_layout;
assert.equal(layout.root_prefix, 'wilpay/production');
assert.equal(layout.object_key_template, 'wilpay/production/{auth_uid}/{category}/{file_id}');
assert.equal(layout.immutable_file_id_required, true);
assert.equal(layout.pii_in_object_key_forbidden, true);
for (const category of ['documents', 'selfies', 'receipts', 'guarantees', 'history']) {
  assert.equal(layout.allowed_categories.includes(category), true, `missing storage category: ${category}`);
}
for (const forbiddenToken of ['{name}', '{email}', '{cpf}', '{phone}', '{document_number}']) {
  assert.equal(layout.object_key_template.includes(forbiddenToken), false, `object key must not contain PII token: ${forbiddenToken}`);
}

for (const forbidden of ['captapro', 'gamificacao']) {
  assert.equal(binding.isolation.forbidden_shared_projects.includes(forbidden), true);
}

const approvedDatabaseProjects = binding.isolation.approved_exclusive_database_project_ids;
const approvedDatabaseOrgs = binding.isolation.approved_exclusive_database_org_ids;
const approvedStorageBindings = binding.isolation.approved_exclusive_storage_bindings;
assert.equal(Array.isArray(approvedDatabaseProjects), true);
assert.equal(Array.isArray(approvedDatabaseOrgs), true);
assert.equal(Array.isArray(approvedStorageBindings), true);

if (binding.isolation.database_project_id) {
  assert.equal(
    approvedDatabaseProjects.includes(binding.isolation.database_project_id),
    true,
    'database_project_id must be explicitly approved for exclusive W.I.L Pay use'
  );
}

if (binding.isolation.database_org_id) {
  assert.equal(
    approvedDatabaseOrgs.includes(binding.isolation.database_org_id),
    true,
    'database_org_id must be explicitly approved for exclusive W.I.L Pay use'
  );
}

if (binding.isolation.storage_provider_binding) {
  assert.equal(
    approvedStorageBindings.includes(binding.isolation.storage_provider_binding),
    true,
    'storage_provider_binding must be explicitly approved for exclusive W.I.L Pay use'
  );
}

const databaseBound = Boolean(binding.isolation.database_project_id && binding.isolation.database_org_id);
const storageBound = Boolean(binding.isolation.storage_provider_binding);
const databaseProjectApproved = Boolean(
  binding.isolation.database_project_id &&
  approvedDatabaseProjects.includes(binding.isolation.database_project_id)
);
const databaseOrgApproved = Boolean(
  binding.isolation.database_org_id &&
  approvedDatabaseOrgs.includes(binding.isolation.database_org_id)
);
const storageApproved = Boolean(
  binding.isolation.storage_provider_binding &&
  approvedStorageBindings.includes(binding.isolation.storage_provider_binding)
);
const externallyBound = databaseBound && storageBound;
const productionReady = externallyBound && databaseProjectApproved && databaseOrgApproved && storageApproved;

if (!productionReady) {
  assert.equal(
    binding.readiness.status,
    'BLOCKED_EXTERNAL_BINDING',
    'production must remain fail-closed until exclusive Neon project/org and private Storage bindings are complete and explicitly approved'
  );
  for (const requirement of [
    'exclusive_neon_project_id',
    'exclusive_neon_org_id',
    'private_storage_provider_binding',
    'explicit_resource_approval'
  ]) {
    assert.equal(binding.readiness.requires.includes(requirement), true, `missing readiness requirement: ${requirement}`);
  }
} else {
  assert.notEqual(
    binding.readiness.status,
    'BLOCKED_EXTERNAL_BINDING',
    'a fully approved exclusive binding should move to an explicit ready state'
  );
}

for (const forbiddenProject of binding.isolation.forbidden_shared_projects) {
  const token = String(forbiddenProject).toLowerCase();
  for (const candidate of [
    binding.isolation.database_project_id,
    binding.isolation.database_org_id,
    binding.isolation.storage_provider_binding,
    ...approvedDatabaseProjects,
    ...approvedDatabaseOrgs,
    ...approvedStorageBindings
  ].filter(Boolean)) {
    assert.equal(
      String(candidate).toLowerCase().includes(token),
      false,
      `exclusive binding must never reference forbidden shared project: ${forbiddenProject}`
    );
  }
}

for (const secretLike of ['service_role', 'password', 'access_token', 'refresh_token', 'secret_key', 'private_key']) {
  assert.equal(normalized.includes(secretLike), false, `binding must not contain secret field: ${secretLike}`);
}

console.log('W.I.L Pay exclusive infrastructure binding checks: PASS');
