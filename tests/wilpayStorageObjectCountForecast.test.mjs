import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-object-count-forecast.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_object_count_forecast/);
assert.match(sql, /JOIN wilpay\.storage_client_completeness c/);
assert.match(sql, /percentile_cont\(0\.95\)/);
assert.match(sql, /projected_objects_for_1000_clients/);
assert.match(sql, /recommended_objects_for_1000_clients_with_25pct_headroom/);
assert.match(sql, /greatest\(5000::numeric/);
assert.match(sql, /greatest\(6250::numeric/);
assert.match(sql, /sampled_complete_clients >= 30/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_object_count_forecast FROM PUBLIC/);
assert.doesNotMatch(sql, /service_role|secret|password|token|signed_url/i);
assert.doesNotMatch(sql, /DELETE\s+FROM|DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

console.log('PASS wilpay storage object-count forecast');
