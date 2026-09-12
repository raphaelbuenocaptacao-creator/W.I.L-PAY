import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseSql = await readFile(new URL('../infra/wilpay-storage-metadata.sql', import.meta.url), 'utf8');
const uploadIdentitySql = await readFile(new URL('../infra/wilpay-storage-upload-identity.sql', import.meta.url), 'utf8');
const sql = `${baseSql}\n${uploadIdentitySql}`;
const normalized = sql.toLowerCase();

assert.match(sql, /CREATE SCHEMA IF NOT EXISTS wilpay;/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS wilpay\.private_files/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS wilpay\.file_audit_log/);
assert.match(sql, /bucket\s+text\s+NOT NULL[\s\S]*wilpay-private-documents/);
assert.match(sql, /storage_scope\s+text\s+NOT NULL[\s\S]*wilpay-private/);
assert.match(sql, /size_bytes\s+bigint\s+NOT NULL,/);
assert.match(sql, /CONSTRAINT wilpay_private_files_category_size CHECK/);
assert.match(sql, /WHEN 'selfie' THEN 10485760/);
assert.match(sql, /WHEN 'receipt' THEN 10485760/);
assert.match(sql, /WHEN 'document' THEN 15728640/);
assert.match(sql, /WHEN 'history' THEN 15728640/);
assert.match(sql, /WHEN 'guarantee' THEN 20971520/);
assert.doesNotMatch(sql, /size_bytes\s+bigint\s+NOT NULL\s+CHECK\s*\(size_bytes > 0 AND size_bytes <= 15728640\)/);
assert.match(sql, /checksum_sha256\s+text\s+NOT NULL[\s\S]*\^\[a-f0-9\]\{64\}\$/);
assert.match(sql, /object_key LIKE 'wilpay\/users\/%\/loans\/%'/);
assert.match(sql, /CONSTRAINT wilpay_object_key_owner_loan_scope CHECK/);
assert.match(sql, /position\('\/' IN owner_user_id\) = 0/);
assert.match(sql, /position\('\/' IN loan_id\) = 0/);
assert.match(sql, /'wilpay\/users\/' \|\| owner_user_id \|\| '\/loans\/' \|\| loan_id \|\| '\/'/);
assert.match(sql, /length\(object_key\) > length\('wilpay\/users\/' \|\| owner_user_id \|\| '\/loans\/' \|\| loan_id \|\| '\/'\)/);
assert.match(sql, /ALTER TABLE wilpay\.private_files[\s\S]*ADD CONSTRAINT wilpay_object_key_owner_loan_scope/);

// Every new object receives a database-generated immutable upload identity. Legacy
// rows stay untouched/nullable until a separately approved migration backfills them.
assert.match(uploadIdentitySql, /ADD COLUMN IF NOT EXISTS upload_id uuid;/);
assert.match(uploadIdentitySql, /ALTER COLUMN upload_id SET DEFAULT gen_random_uuid\(\);/);
assert.match(uploadIdentitySql, /CREATE UNIQUE INDEX IF NOT EXISTS wilpay_private_files_upload_id_uidx[\s\S]*WHERE upload_id IS NOT NULL;/);
assert.doesNotMatch(uploadIdentitySql, /UPDATE wilpay\.private_files[\s\S]*SET upload_id/);
assert.doesNotMatch(uploadIdentitySql, /ALTER COLUMN upload_id SET NOT NULL/);

assert.match(sql, /CREATE OR REPLACE FUNCTION wilpay\.reject_file_audit_mutation\(\)/);
assert.match(sql, /CREATE TRIGGER wilpay_file_audit_append_only[\s\S]*BEFORE UPDATE OR DELETE ON wilpay\.file_audit_log/);
assert.match(sql, /RAISE EXCEPTION 'W\.I\.L Pay file audit log is append-only';/);
assert.match(sql, /REVOKE ALL ON SCHEMA wilpay FROM PUBLIC;/);
assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA wilpay FROM PUBLIC;/);

assert.match(sql, /CONSTRAINT wilpay_file_audit_file_fk FOREIGN KEY \(file_id\)/);
assert.match(sql, /REFERENCES wilpay\.private_files\(file_id\) ON UPDATE RESTRICT ON DELETE RESTRICT/);
assert.match(sql, /ADD CONSTRAINT wilpay_file_audit_file_fk[\s\S]*FOREIGN KEY \(file_id\)[\s\S]*NOT VALID;/);

assert.match(sql, /CONSTRAINT wilpay_private_files_metadata_safe CHECK/);
assert.match(sql, /CONSTRAINT wilpay_file_audit_details_safe CHECK/);
assert.match(sql, /octet_length\(metadata::text\) <= 16384/);
assert.match(sql, /octet_length\(details::text\) <= 8192/);
for (const sensitiveKey of [
  'data_url', 'signed_url', 'service_role', 'token', 'authorization',
  'file_bytes', 'base64', 'secret', 'password', 'api_key',
]) {
  assert.match(sql, new RegExp(`'${sensitiveKey}'`), `missing blocked metadata key: ${sensitiveKey}`);
}
assert.match(sql, /ADD CONSTRAINT wilpay_private_files_metadata_safe[\s\S]*NOT VALID;/);
assert.match(sql, /ADD CONSTRAINT wilpay_file_audit_details_safe[\s\S]*NOT VALID;/);
assert.match(sql, /CONSTRAINT wilpay_private_files_metadata_nested_safe CHECK/);
assert.match(sql, /CONSTRAINT wilpay_file_audit_details_nested_safe CHECK/);
assert.match(sql, /metadata::text !~\* '\"\(data_url\|signed_url\|service_role\|token\|authorization\|file_bytes\|base64\|secret\|password\|api_key\)\"\[\[:space:\]\]\*:'/);
assert.match(sql, /details::text !~\* '\"\(data_url\|signed_url\|service_role\|token\|authorization\|file_bytes\|base64\|secret\|password\|api_key\)\"\[\[:space:\]\]\*:'/);
assert.match(sql, /ADD CONSTRAINT wilpay_private_files_metadata_nested_safe[\s\S]*NOT VALID;/);
assert.match(sql, /ADD CONSTRAINT wilpay_file_audit_details_nested_safe[\s\S]*NOT VALID;/);

for (const forbidden of [' bytea', 'captapro', 'gamificacao']) {
  assert.equal(normalized.includes(forbidden), false, `schema contains forbidden token: ${forbidden}`);
}

for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(destructive), false, `schema contains destructive statement: ${destructive}`);
}

console.log('W.I.L Pay storage metadata schema checks: PASS');
