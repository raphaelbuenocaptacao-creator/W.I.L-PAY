import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-client-completeness.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_client_completeness AS/);
assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_client_readiness_summary AS/);
assert.match(sql, /complete_clients_remaining_to_1000/);
assert.match(sql, /complete_client_target_reached/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_client_completeness FROM PUBLIC;/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_client_readiness_summary FROM PUBLIC;/);

for (const documentType of ['document', 'selfie', 'receipt', 'guarantee', 'history']) {
  assert.match(sql, new RegExp(`document_type = '${documentType}'`), `missing completeness check for ${documentType}`);
  assert.match(
    sql,
    new RegExp(`document_type = '${documentType}'\\s+AND status = 'active'`),
    `complete storage profile must require an active ${documentType}`,
  );
}

assert.match(sql, /status = 'active'/, 'completeness must be based on operationally available files');
assert.equal(
  /storage_profile_complete[\s\S]*status\s+in\s*\(\s*'active'\s*,\s*'quarantined'/.test(normalized),
  false,
  'quarantined files must not satisfy storage_profile_complete',
);

for (const forbidden of [' bytea', 'captapro', 'gamificacao', 'service_role', 'signed_url', 'data_url', 'base64']) {
  assert.equal(normalized.includes(forbidden), false, `completeness SQL contains forbidden token: ${forbidden}`);
}

for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(destructive), false, `completeness SQL contains destructive statement: ${destructive}`);
}

console.log('W.I.L Pay storage client completeness checks: PASS');
