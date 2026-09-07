import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-capacity-pressure.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_capacity_pressure/);
assert.match(sql, /FROM wilpay\.storage_capacity_readiness r/);
assert.match(sql, /CROSS JOIN wilpay\.storage_capacity_distribution d/);
assert.match(sql, /observed_quota_percent/);
assert.match(sql, /forecast_quota_percent/);
assert.match(sql, /'UNCONFIGURED'/);
assert.match(sql, /'INSUFFICIENT_SAMPLE'/);
assert.match(sql, /'CRITICAL'/);
assert.match(sql, /'HIGH'/);
assert.match(sql, /'WATCH'/);
assert.match(sql, /'HEALTHY'/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_capacity_pressure FROM PUBLIC/);
assert.doesNotMatch(sql, /service_role|secret|password|token/i);
assert.doesNotMatch(sql, /DELETE\s+FROM|DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

console.log('PASS wilpay storage capacity pressure');
