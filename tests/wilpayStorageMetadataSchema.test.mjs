import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-metadata.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /CREATE SCHEMA IF NOT EXISTS wilpay;/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS wilpay\.private_files/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS wilpay\.file_audit_log/);
assert.match(sql, /bucket\s+text\s+NOT NULL[\s\S]*wilpay-private-documents/);
assert.match(sql, /storage_scope\s+text\s+NOT NULL[\s\S]*wilpay-private/);
assert.match(sql, /size_bytes\s+bigint\s+NOT NULL[\s\S]*15728640/);
assert.match(sql, /checksum_sha256\s+text\s+NOT NULL[\s\S]*\^\[a-f0-9\]\{64\}\$/);
assert.match(sql, /object_key LIKE 'wilpay\/users\/%\/loans\/%'/);
assert.match(sql, /REVOKE ALL ON SCHEMA wilpay FROM PUBLIC;/);
assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA wilpay FROM PUBLIC;/);

for (const forbidden of [' bytea', 'base64 ', 'data_url ', 'service_role', 'captaPro', 'gamificacao']) {
  assert.equal(normalized.includes(forbidden.toLowerCase()), false, `schema contains forbidden token: ${forbidden}`);
}

for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(destructive), false, `schema contains destructive statement: ${destructive}`);
}

console.log('W.I.L Pay storage metadata schema checks: PASS');
