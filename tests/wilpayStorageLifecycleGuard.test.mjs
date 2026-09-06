import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-lifecycle-guard.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /ADD CONSTRAINT wilpay_private_files_lifecycle_consistent CHECK/);
assert.match(sql, /status = 'pending' AND uploaded_at IS NULL AND archived_at IS NULL/);
assert.match(sql, /status IN \('active','quarantined'\) AND uploaded_at IS NOT NULL AND archived_at IS NULL/);
assert.match(sql, /status = 'archived' AND uploaded_at IS NOT NULL AND archived_at IS NOT NULL/);
assert.match(sql, /NOT VALID;/);

for (const forbidden of ['captapro', 'gamificacao', 'drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(forbidden), false, `lifecycle guard contains forbidden token: ${forbidden}`);
}

console.log('W.I.L Pay storage lifecycle guard checks: PASS');
