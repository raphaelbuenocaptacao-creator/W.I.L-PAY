import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-scale-readiness.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_scale_readiness/);
assert.match(sql, /FROM wilpay\.storage_capacity_readiness b/);
assert.match(sql, /CROSS JOIN wilpay\.storage_object_capacity_readiness o/);
assert.match(sql, /'CONFIG_MISMATCH'/);
assert.match(sql, /'UNCONFIGURED'/);
assert.match(sql, /'STALE_VERIFICATION'/);
assert.match(sql, /'INSUFFICIENT_SAMPLE'/);
assert.match(sql, /'INSUFFICIENT_CAPACITY'/);
assert.match(sql, /'READY'/);
assert.match(sql, /interval '30 days'/);
assert.match(sql, /AS scale_ready/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_scale_readiness FROM PUBLIC/);
assert.doesNotMatch(sql, /service_role|secret|password|token|signed_url/i);
assert.doesNotMatch(sql, /DELETE\s+FROM|DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

console.log('PASS wilpay storage unified scale readiness');
