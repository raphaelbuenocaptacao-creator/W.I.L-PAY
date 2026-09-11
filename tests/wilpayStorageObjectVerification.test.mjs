import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const verificationSql = await readFile(new URL('../infra/wilpay-storage-object-verification.sql', import.meta.url), 'utf8');
const completenessSql = await readFile(new URL('../infra/wilpay-storage-client-completeness.sql', import.meta.url), 'utf8');

assert.match(verificationSql, /storage_verified_at\s+timestamptz/i, 'migration must persist the last trusted object verification time');
assert.match(verificationSql, /storage_verified_size_bytes\s+bigint/i, 'migration must persist the verified object size');
assert.match(verificationSql, /storage_verified_checksum_sha256\s+text/i, 'migration must persist the verified object checksum');
assert.match(verificationSql, /storage_verified_at\s*>=\s*uploaded_at/i, 'verification evidence must be newer than or equal to upload completion');
assert.match(verificationSql, /CREATE OR REPLACE VIEW wilpay\.storage_unverified_active_objects AS/i);
assert.match(verificationSql, /storage_verified_size_bytes\s*<>\s*size_bytes/i);
assert.match(verificationSql, /storage_verified_checksum_sha256\s*<>\s*checksum_sha256/i);
assert.match(verificationSql, /REVOKE ALL ON wilpay\.storage_unverified_active_objects FROM PUBLIC;/i);

for (const documentType of ['document', 'selfie', 'receipt', 'guarantee', 'history']) {
  const escaped = documentType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `document_type = '${escaped}'[\\s\\S]{0,360}status = 'active'[\\s\\S]{0,360}storage_verified_at is not null[\\s\\S]{0,360}storage_verified_size_bytes = size_bytes[\\s\\S]{0,360}storage_verified_checksum_sha256 = checksum_sha256`,
    'i',
  );
  assert.match(
    completenessSql,
    pattern,
    `complete storage profile must require reconciled object evidence for ${documentType}`,
  );
}

for (const sql of [verificationSql, completenessSql]) {
  const normalized = sql.toLowerCase();
  for (const forbidden of [' bytea', 'captapro', 'gamificacao']) {
    assert.equal(normalized.includes(forbidden), false, `storage verification SQL contains forbidden token: ${forbidden}`);
  }
  for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
    assert.equal(normalized.includes(destructive), false, `storage verification SQL contains destructive statement: ${destructive}`);
  }
}

console.log('W.I.L Pay storage object verification checks: PASS');
