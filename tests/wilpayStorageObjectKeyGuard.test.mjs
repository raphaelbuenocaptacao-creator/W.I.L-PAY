import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-object-key-guard.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /ADD CONSTRAINT wilpay_private_files_canonical_object_key CHECK/);
assert.match(sql, /'wilpay\/users\/' \|\| owner_user_id/);
assert.match(sql, /'\/loans\/' \|\| loan_id/);
assert.match(sql, /'\/' \|\| document_type/);
assert.match(sql, /'\/' \|\| file_id/);
assert.match(sql, /WHEN 'application\/pdf' THEN '\.pdf'/);
assert.match(sql, /WHEN 'image\/jpeg' THEN '\.jpg'/);
assert.match(sql, /WHEN 'image\/png' THEN '\.png'/);
assert.match(sql, /WHEN 'image\/webp' THEN '\.webp'/);
assert.match(sql, /NOT VALID;/);

for (const forbidden of ['captapro', 'gamificacao', 'drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(forbidden), false, `object-key guard contains forbidden token: ${forbidden}`);
}

console.log('W.I.L Pay canonical object-key guard checks: PASS');
