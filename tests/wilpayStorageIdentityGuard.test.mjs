import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-identity-guard.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /CREATE OR REPLACE FUNCTION wilpay\.reject_private_file_identity_mutation\(\)/);
assert.match(sql, /CREATE TRIGGER wilpay_private_file_identity_immutable/);
assert.match(sql, /BEFORE UPDATE ON wilpay\.private_files/);
assert.match(sql, /NEW\.owner_user_id IS DISTINCT FROM OLD\.owner_user_id/);
assert.match(sql, /NEW\.loan_id IS DISTINCT FROM OLD\.loan_id/);
assert.match(sql, /NEW\.object_key IS DISTINCT FROM OLD\.object_key/);
assert.match(sql, /NEW\.checksum_sha256 IS DISTINCT FROM OLD\.checksum_sha256/);
assert.match(sql, /NEW\.content_type IS DISTINCT FROM OLD\.content_type/);
assert.match(sql, /NEW\.size_bytes IS DISTINCT FROM OLD\.size_bytes/);
assert.match(sql, /NEW\.created_at IS DISTINCT FROM OLD\.created_at/);
assert.match(sql, /RETURN NEW;/);

for (const forbidden of ['captapro', 'gamificacao', 'drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(forbidden), false, `identity guard contains forbidden token: ${forbidden}`);
}

console.log('W.I.L Pay storage identity guard checks: PASS');
