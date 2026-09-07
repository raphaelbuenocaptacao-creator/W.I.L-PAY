import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-object-capacity-budget.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE TABLE IF NOT EXISTS wilpay\.storage_object_capacity_config/);
assert.match(sql, /target_complete_clients integer NOT NULL DEFAULT 1000/);
assert.match(sql, /provider_object_quota bigint/);
assert.match(sql, /wilpay_object_quota_verification_pair/);
assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_object_capacity_readiness/);
assert.match(sql, /CROSS JOIN wilpay\.storage_object_count_forecast f/);
assert.match(sql, /target_complete_clients \* 5/);
assert.match(sql, /p95_objects_per_complete_client/);
assert.match(sql, /'UNCONFIGURED'/);
assert.match(sql, /'INSUFFICIENT_SAMPLE'/);
assert.match(sql, /'READY'/);
assert.match(sql, /'INSUFFICIENT_OBJECT_QUOTA'/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_object_capacity_config FROM PUBLIC/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_object_capacity_readiness FROM PUBLIC/);
assert.doesNotMatch(sql, /service_role|secret|password|token|signed_url/i);
assert.doesNotMatch(sql, /DELETE\s+FROM|DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

console.log('PASS wilpay storage object-capacity budget');
