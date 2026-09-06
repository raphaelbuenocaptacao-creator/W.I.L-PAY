import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WILPAY_STORAGE_LIMITS, buildWilpayObjectKey } from '../src/lib/wilpayStorage.js';

const policy = JSON.parse(
  await readFile(new URL('../infra/wilpay-storage-policy.json', import.meta.url), 'utf8')
);

assert.equal(policy.service, 'wilpay');
assert.equal(policy.ownership.project_slug, 'wilpay');
assert.equal(policy.ownership.shared_with_other_apps, false);
assert.ok(policy.ownership.forbidden_project_names.includes('captapro'));
assert.ok(policy.ownership.forbidden_project_names.includes('gamificacao'));

assert.equal(policy.storage.visibility, 'private');
assert.ok(policy.storage.minimum_supported_clients >= 1000);
assert.equal(policy.storage.max_file_size_bytes, WILPAY_STORAGE_LIMITS.maxBytesPerFile);
assert.deepEqual(
  [...policy.storage.allowed_content_types].sort(),
  [...WILPAY_STORAGE_LIMITS.allowedMimeTypes].sort()
);
assert.equal(
  policy.storage.object_key_template,
  'wilpay/users/{user_id}/loans/{loan_id}/{document_type}/{file_id}.{extension}'
);
assert.equal(policy.storage.direct_public_urls, false);
assert.equal(policy.storage.viewer_access, 'short_lived_signed_url');

const sampleObjectKey = buildWilpayObjectKey({
  userId: 'user_123',
  loanId: 'loan_456',
  kind: 'document',
  fileId: 'file_789',
  mimeType: 'application/pdf'
});
assert.match(sampleObjectKey, /^wilpay\/users\/user_123\/loans\/loan_456\/document\/file_789\.pdf$/);

assert.equal(policy.database.store_binary_files, false);
assert.equal(policy.database.store_metadata_only, true);
assert.equal(policy.security.tenant_isolation, 'owner_user_id');
assert.equal(policy.security.deny_anonymous_reads, true);
assert.equal(policy.security.deny_cross_user_reads, true);
assert.equal(policy.security.secrets_in_client_bundle, false);
assert.equal(policy.migration.destructive_cleanup_requires_explicit_approval, true);

console.log('wilpayStoragePolicy tests passed');
