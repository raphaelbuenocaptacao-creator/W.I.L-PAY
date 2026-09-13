import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-capacity-budget.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE TABLE IF NOT EXISTS wilpay\.storage_capacity_config/);
assert.match(sql, /target_complete_clients integer NOT NULL DEFAULT 1000/);
assert.match(sql, /provider_quota_bytes bigint CHECK \(provider_quota_bytes IS NULL OR provider_quota_bytes > 0\)/);
assert.match(sql, /VALUES \('primary', 1000, 25\.00, NULL, NULL\)/);
assert.match(sql, /WHEN c\.target_complete_clients < 1000 THEN 'TARGET_BELOW_MINIMUM'/);
assert.match(sql, /WHEN c\.provider_quota_bytes IS NULL THEN 'UNCONFIGURED'/);
assert.match(sql, /WHEN c\.verified_at IS NULL THEN 'UNVERIFIED_QUOTA'/);
assert.match(sql, /WHEN c\.verified_at < now\(\) - interval '7 days' THEN 'STALE_QUOTA_VERIFICATION'/);
assert.match(sql, /WHEN NOT f\.forecast_sample_ready THEN 'INSUFFICIENT_SAMPLE'/);
assert.match(sql, /THEN 'READY'/);
assert.match(sql, /ELSE 'INSUFFICIENT_QUOTA'/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_capacity_config FROM PUBLIC/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_capacity_readiness FROM PUBLIC/);
assert.doesNotMatch(sql, /service_role|secret|password|token/i);
assert.doesNotMatch(sql, /DELETE\s+FROM|DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

console.log('PASS wilpay storage capacity budget');
