import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../infra/wilpay-storage-capacity-forecast.sql', import.meta.url), 'utf8');
const normalized = sql.toLowerCase();

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_capacity_forecast AS/);
assert.match(sql, /storage_client_completeness/);
assert.match(sql, /storage_profile_complete/);
assert.match(sql, /percentile_cont\(0\.95\)/);
assert.match(sql, /projected_1000_clients_avg_bytes/);
assert.match(sql, /projected_1000_clients_p95_bytes/);
assert.match(sql, /recommended_1000_clients_bytes_with_25pct_headroom/);
assert.match(sql, /sampled_complete_clients >= 30/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_capacity_forecast FROM PUBLIC;/);

for (const forbidden of [' bytea', 'captapro', 'gamificacao', 'service_role', 'signed_url', 'data_url', 'base64']) {
  assert.equal(normalized.includes(forbidden), false, `capacity forecast SQL contains forbidden token: ${forbidden}`);
}

for (const destructive of ['drop table', 'drop schema', 'truncate ', 'delete from']) {
  assert.equal(normalized.includes(destructive), false, `capacity forecast SQL contains destructive statement: ${destructive}`);
}

console.log('W.I.L Pay storage capacity forecast checks: PASS');
