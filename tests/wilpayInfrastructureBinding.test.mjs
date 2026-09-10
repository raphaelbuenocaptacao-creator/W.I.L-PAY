import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../infra/wilpay-infrastructure-binding.json', import.meta.url), 'utf8');
const binding = JSON.parse(raw);
const normalized = raw.toLowerCase();

assert.equal(binding.schema_version >= 6, true);
assert.equal(binding.project, 'wilpay');
assert.equal(binding.environment, 'production');
assert.equal(binding.isolation.exclusive, true);
assert.equal(binding.isolation.database_provider, 'neon');
assert.equal(binding.isolation.storage_bucket, 'wilpay-private-documents');
assert.equal(binding.isolation.storage_private, true);
assert.equal(binding.capacity.minimum_complete_clients >= 1000, true);
assert.equal(binding.capacity.planning_budget_bytes_per_client >= 268435456, true);
assert.equal(
  binding.capacity.minimum_planning_budget_bytes >= binding.capacity.minimum_complete_clients * binding.capacity.planning_budget_bytes_per_client,
  true,
  'storage planning budget must cover at least 1,000 complete clients'
);
for (const category of ['documents', 'selfies', 'receipts', 'guarantees', 'history']) {
  assert.equal(Number.isInteger(binding.capacity.max_object_bytes_by_category[category]), true, `missing max object size for ${category}`);
  assert.equal(binding.capacity.max_object_bytes_by_category[category] > 0, true, `invalid max object size for ${category}`);
}
assert.equal(binding.retention.automatic_destructive_deletion, false);
assert.equal(binding.retention.versioning_required_when_supported, true);
assert.equal(binding.retention.metadata_history_required, true);
assert.equal(binding.retention.lifecycle_deletion_requires_explicit_approval, true);
assert.equal(binding.data_policy.database_binary_payloads, false);
assert.equal(binding.data_policy.database_stores_metadata_only, true);
assert.equal(binding.data_policy.private_storage_required_for_new_uploads_when_bound, true);

const storageIdentityLock = binding.isolation.storage_identity_lock;
assert.equal(storageIdentityLock.immutable_after_approval, true);
assert.equal(storageIdentityLock.provider_identity_required, true);
assert.equal(storageIdentityLock.resource_identity_required, true);
assert.equal(storageIdentityLock.bucket_name_immutable, true);

const layout = binding.isolation.storage_layout;
assert.equal(layout.root_prefix, 'wilpay/production');
assert.equal(layout.object_key_template, 'wilpay/production/{auth_uid}/{category}/{file_id}');
assert.equal(layout.immutable_file_id_required, true);
assert.equal(layout.pii_in_object_key_forbidden, true);
assert.equal(layout.write_prefix_must_match_root, true);
assert.equal(layout.writes_outside_root_forbidden, true);
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
const approvedStorageResources = binding.isolation.approved_exclusive_storage_resource_ids;
const approvedStorageBindings = binding.isolation.approved_exclusive_storage_bindings;
assert.equal(Array.isArray(approvedDatabaseProjects), true);
assert.equal(Array.isArray(approvedDatabaseOrgs), true);
assert.equal(Array.isArray(approvedStorageResources), true);
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

const anyStorageBindingField = Boolean(
  binding.isolation.storage_provider ||
  binding.isolation.storage_resource_id ||
  binding.isolation.storage_provider_binding
);

if (anyStorageBindingField) {
  assert.equal(Boolean(binding.isolation.storage_provider), true, 'storage_provider is required once Storage binding starts');
  assert.equal(Boolean(binding.isolation.storage_resource_id), true, 'storage_resource_id is required once Storage binding starts');
  assert.equal(Boolean(binding.isolation.storage_provider_binding), true, 'storage_provider_binding is required once Storage binding starts');
  assert.equal(
    approvedStorageResources.includes(binding.isolation.storage_resource_id),
    true,
    'storage_resource_id must be explicitly approved for exclusive W.I.L Pay use'
  );
  assert.equal(
    approvedStorageBindings.includes(binding.isolation.storage_provider_binding),
    true,
    'storage_provider_binding must be explicitly approved for exclusive W.I.L Pay use'
  );
}

const databaseBound = Boolean(binding.isolation.database_project_id && binding.isolation.database_org_id);
const storageBound = Boolean(
  binding.isolation.storage_provider &&
  binding.isolation.storage_resource_id &&
  binding.isolation.storage_provider_binding
);
const databaseProjectApproved = Boolean(
  binding.isolation.database_project_id &&
  approvedDatabaseProjects.includes(binding.isolation.database_project_id)
);
const databaseOrgApproved = Boolean(
  binding.isolation.database_org_id &&
  approvedDatabaseOrgs.includes(binding.isolation.database_org_id)
);
const storageResourceApproved = Boolean(
  binding.isolation.storage_resource_id &&
  approvedStorageResources.includes(binding.isolation.storage_resource_id)
);
const storageApproved = Boolean(
  binding.isolation.storage_provider_binding &&
  approvedStorageBindings.includes(binding.isolation.storage_provider_binding)
);
const externallyBound = databaseBound && storageBound;
const productionReady = externallyBound && databaseProjectApproved && databaseOrgApproved && storageResourceApproved && storageApproved;

if (!productionReady) {
  assert.equal(
    binding.readiness.status,
    'BLOCKED_EXTERNAL_BINDING',
    'production must remain fail-closed until exclusive Neon project/org and immutable private Storage identity are complete and explicitly approved'
  );
  for (const requirement of [
    'exclusive_neon_project_id',
    'exclusive_neon_org_id',
    'private_storage_provider_identity',
    'private_storage_resource_id',
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
    binding.isolation.storage_provider,
    binding.isolation.storage_resource_id,
    binding.isolation.storage_provider_binding,
    ...approvedDatabaseProjects,
    ...approvedDatabaseOrgs,
    ...approvedStorageResources,
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
