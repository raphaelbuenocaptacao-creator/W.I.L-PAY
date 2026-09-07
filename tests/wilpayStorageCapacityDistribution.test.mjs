import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-capacity-distribution.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_capacity_distribution/);
assert.match(sql, /FROM wilpay\.storage_usage_by_owner/);
assert.match(sql, /percentile_cont\(0\.50\)/);
assert.match(sql, /percentile_cont\(0\.95\)/);
assert.match(sql, /largest_client_share_percent/);
assert.match(sql, /sampled_clients >= 30 AS distribution_sample_ready/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_capacity_distribution FROM PUBLIC/);
assert.doesNotMatch(sql, /service_role|secret|password|token/i);
assert.doesNotMatch(sql, /DELETE\s+FROM|DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

console.log('PASS wilpay storage capacity distribution');
