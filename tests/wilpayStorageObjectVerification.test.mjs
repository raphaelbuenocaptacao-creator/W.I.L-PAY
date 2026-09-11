import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const metadataSql = await readFile(new URL('../infra/wilpay-storage-metadata.sql', import.meta.url), 'utf8');
const completenessSql = await readFile(new URL('../infra/wilpay-storage-client-completeness.sql', import.meta.url), 'utf8');
const reconciliationSql = await readFile(new URL('../infra/wilpay-storage-reconciliation.sql', import.meta.url), 'utf8');

assert.match(metadataSql, /storage_verified_at\s+timestamptz/i, 'metadata must persist the last trusted object verification time');
assert.match(metadataSql, /storage_verified_size_bytes\s+bigint/i, 'metadata must persist the verified object size');
assert.match(metadataSql, /storage_verified_checksum_sha256\s+text/i, 'metadata must persist the verified object checksum');

for (const documentType of ['document', 'selfie', 'receipt', 'guarantee', 'history']) {
  const escaped = documentType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `document_type = '${escaped}'[\\s\\S]{0,260}status = 'active'[\\s\\S]{0,260}storage_verified_at is not null[\\s\\S]{0,260}storage_verified_size_bytes = size_bytes[\\s\\S]{0,260}storage_verified_checksum_sha256 = checksum_sha256`,
    'i',
  );
  assert.match(
    completenessSql,
    pattern,
    `complete storage profile must require reconciled object evidence for ${documentType}`,
  );
}

assert.match(
  reconciliationSql,
  /CREATE OR REPLACE VIEW wilpay\.storage_unverified_active_objects AS/i,
  'reconciliation must expose active metadata that lacks matching object verification evidence',
);
assert.match(reconciliationSql, /storage_verified_size_bytes\s*<>\s*size_bytes/i);
assert.match(reconciliationSql, /storage_verified_checksum_sha256\s*<>\s*checksum_sha256/i);
assert.match(reconciliationSql, /REVOKE ALL ON wilpay\.storage_unverified_active_objects FROM PUBLIC;/i);

for (const sql of [metadataSql, completenessSql, reconciliationSql]) {
  const normalized = sql.toLowerCase();
  for (const forbidden of [' bytea', 'captapro', 'gamificacao', 'service_role', 'signed_url', 'data_url', 'base64']) {
    assert.equal(normalized.includes(forbidden), false, `storage verification SQL contains forbidden token: ${forbidden}`);
  }
  for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
    assert.equal(normalized.includes(destructive), false, `storage verification SQL contains destructive statement: ${destructive}`);
  }
}

console.log('W.I.L Pay storage object verification checks: PASS');
