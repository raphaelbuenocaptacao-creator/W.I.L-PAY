import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-category-size-upgrade.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /to_regclass\('wilpay\.private_files'\)/);
assert.match(sql, /ADD CONSTRAINT wilpay_private_files_category_size CHECK/);
assert.match(sql, /WHEN 'selfie' THEN 10485760/);
assert.match(sql, /WHEN 'receipt' THEN 10485760/);
assert.match(sql, /WHEN 'document' THEN 15728640/);
assert.match(sql, /WHEN 'history' THEN 15728640/);
assert.match(sql, /WHEN 'guarantee' THEN 20971520/);
assert.match(sql, /\) NOT VALID;/);
assert.match(sql, /c\.conname = 'private_files_size_bytes_check'/);
assert.match(sql, /pg_get_constraintdef\(c\.oid\)/);
assert.match(sql, /Refusing to replace unexpected constraint definition/);
assert.match(sql, /DROP CONSTRAINT %I/);

// The upgrade may replace only the known legacy CHECK. It must never delete data
// or perform destructive table/schema operations.
for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(destructive), false, `upgrade contains destructive statement: ${destructive}`);
}
for (const forbidden of ['captapro', 'gamificacao', 'service_role', 'api_key', 'password']) {
  assert.equal(normalized.includes(forbidden), false, `upgrade contains forbidden token: ${forbidden}`);
}

console.log('W.I.L Pay category-size upgrade checks: PASS');
