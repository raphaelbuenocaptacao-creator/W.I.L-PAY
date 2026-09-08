import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const forbidden = [/captapro/gi, /gamifica(?:cao|ção)/gi];
const allowedBucket = 'wilpay-private-documents';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(?:js|jsx|ts|tsx|json|sql|yml|yaml)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const sourceRoot = new URL('../src/', import.meta.url);
const sourceFiles = await walk(sourceRoot.pathname);
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');
  for (const pattern of forbidden) {
    pattern.lastIndex = 0;
    assert.equal(pattern.test(text), false, `cross-project reference found in ${relative(root.pathname, file)}`);
  }
}

const aureonClient = await readFile(new URL('../src/lib/aureonClient.js', import.meta.url), 'utf8');
assert.match(aureonClient, /const PROJECT\s*=\s*['"]wilpay['"]/);

const storagePolicy = JSON.parse(await readFile(new URL('../infra/wilpay-storage-policy.json', import.meta.url), 'utf8'));
assert.equal(storagePolicy.service, 'wilpay');
assert.equal(storagePolicy.ownership.project_slug, 'wilpay');
assert.equal(storagePolicy.ownership.shared_with_other_apps, false);
assert.equal(storagePolicy.storage.visibility, 'private');
assert.equal(storagePolicy.storage.bucket, allowedBucket);
assert.ok(storagePolicy.storage.minimum_supported_clients >= 1000);
assert.equal(storagePolicy.database.store_binary_files, false);
assert.equal(storagePolicy.database.store_metadata_only, true);
assert.equal(storagePolicy.migration.destructive_cleanup_requires_explicit_approval, true);

const storageSource = await readFile(new URL('../src/lib/wilpayStorage.js', import.meta.url), 'utf8');
assert.match(storageSource, new RegExp(allowedBucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

console.log('W.I.L Pay infrastructure isolation guard: PASS');
