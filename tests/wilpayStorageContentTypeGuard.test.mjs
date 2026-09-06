import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-content-type-guard.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /ADD CONSTRAINT wilpay_private_files_extension_matches_content_type CHECK/);
assert.match(sql, /content_type = 'application\/pdf'/);
assert.match(sql, /content_type = 'image\/jpeg'/);
assert.match(sql, /content_type = 'image\/png'/);
assert.match(sql, /content_type = 'image\/webp'/);
assert.match(sql, /\\\.pdf\$/);
assert.match(sql, /\\\.\(jpg\|jpeg\)\$/);
assert.match(sql, /\\\.png\$/);
assert.match(sql, /\\\.webp\$/);
assert.match(sql, /NOT VALID;/);

for (const forbidden of ['captapro', 'gamificacao', 'drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(forbidden), false, `content-type guard contains forbidden token: ${forbidden}`);
}

console.log('W.I.L Pay storage content-type guard checks: PASS');
