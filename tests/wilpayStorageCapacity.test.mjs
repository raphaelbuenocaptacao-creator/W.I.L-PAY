import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-capacity.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /CREATE INDEX IF NOT EXISTS wilpay_private_files_owner_loan_type_status_created_idx/);
assert.match(sql, /owner_user_id,[\s\S]*loan_id,[\s\S]*document_type,[\s\S]*status,[\s\S]*created_at DESC/);
assert.match(sql, /CREATE INDEX IF NOT EXISTS wilpay_file_audit_file_occurred_idx/);
assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_usage_by_loan AS/);
assert.match(sql, /count\(\*\) FILTER \(WHERE uploaded_at IS NOT NULL\) AS uploaded_file_count/);
assert.match(sql, /sum\(size_bytes\) FILTER \(WHERE uploaded_at IS NOT NULL\)/);

for (const documentType of ['document', 'selfie', 'receipt', 'guarantee', 'history']) {
  assert.match(sql, new RegExp(`document_type = '${documentType}'`), `missing capacity count for ${documentType}`);
}

assert.match(sql, /REVOKE ALL ON wilpay\.storage_usage_by_loan FROM PUBLIC;/);

for (const forbidden of [' bytea', 'captapro', 'gamificacao', 'service_role', 'signed_url']) {
  assert.equal(normalized.includes(forbidden), false, `capacity SQL contains forbidden token: ${forbidden}`);
}

for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(destructive), false, `capacity SQL contains destructive statement: ${destructive}`);
}

console.log('W.I.L Pay storage capacity checks: PASS');
