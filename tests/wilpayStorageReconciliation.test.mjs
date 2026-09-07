import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-reconciliation.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /CREATE INDEX IF NOT EXISTS wilpay_private_files_pending_created_idx/);
assert.match(sql, /WHERE status = 'pending'/);
assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_stale_pending_uploads AS/);
assert.match(sql, /created_at < now\(\) - interval '15 minutes'/);
assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_lifecycle_anomalies AS/);
assert.match(sql, /status IN \('active','quarantined'\)/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_stale_pending_uploads FROM PUBLIC;/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_lifecycle_anomalies FROM PUBLIC;/);

for (const forbidden of [' bytea', 'service_role', 'signed_url', 'data_url', 'captapro', 'gamificacao']) {
  assert.equal(normalized.includes(forbidden), false, `reconciliation SQL contains forbidden token: ${forbidden}`);
}

for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from', 'update wilpay.private_files']) {
  assert.equal(normalized.includes(destructive), false, `reconciliation SQL contains destructive statement: ${destructive}`);
}

console.log('W.I.L Pay storage reconciliation checks: PASS');
