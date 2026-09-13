import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-scale-readiness.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_scale_readiness/);
assert.match(sql, /FROM wilpay\.storage_capacity_readiness b/);
assert.match(sql, /CROSS JOIN wilpay\.storage_object_capacity_readiness o/);
assert.match(sql, /'CONFIG_MISMATCH'/);
assert.match(sql, /'TARGET_BELOW_MINIMUM'/);
assert.match(sql, /target_complete_clients\s*<\s*1000/);
assert.match(sql, /target_complete_clients\s*>=\s*1000/);
assert.match(sql, /'UNCONFIGURED'/);
assert.match(sql, /b\.capacity_status\s*=\s*'UNVERIFIED_QUOTA'[\s\S]*'BYTE_UNVERIFIED_QUOTA'/);
assert.match(sql, /o\.object_capacity_status\s*=\s*'UNVERIFIED_QUOTA'[\s\S]*'OBJECT_UNVERIFIED_QUOTA'/);
assert.match(sql, /b\.capacity_status\s*=\s*'UNVERIFIED_QUOTA_EVIDENCE'[\s\S]*'BYTE_UNVERIFIED_QUOTA_EVIDENCE'/);
assert.match(sql, /o\.object_capacity_status\s*=\s*'UNVERIFIED_QUOTA_EVIDENCE'[\s\S]*'OBJECT_UNVERIFIED_QUOTA_EVIDENCE'/);
assert.match(sql, /b\.capacity_status\s*=\s*'STALE_QUOTA_VERIFICATION'[\s\S]*'BYTE_STALE_QUOTA_VERIFICATION'/);
assert.match(sql, /o\.object_capacity_status\s*=\s*'STALE_QUOTA_VERIFICATION'[\s\S]*'OBJECT_STALE_QUOTA_VERIFICATION'/);
assert.match(sql, /b\.verified_at\s+<\s+now\(\)\s*-\s*interval '7 days'[\s\S]*'BYTE_STALE_QUOTA_VERIFICATION'/);
assert.match(sql, /o\.verified_at\s+<\s+now\(\)\s*-\s*interval '7 days'[\s\S]*'OBJECT_STALE_QUOTA_VERIFICATION'/);
assert.match(sql, /b\.verified_at\s+>=\s+now\(\)\s*-\s*interval '7 days'/);
assert.match(sql, /o\.verified_at\s+>=\s+now\(\)\s*-\s*interval '7 days'/);
assert.doesNotMatch(sql, /interval '30 days'/);
assert.match(sql, /'INSUFFICIENT_SAMPLE'/);
assert.match(sql, /'INSUFFICIENT_CAPACITY'/);
assert.match(sql, /'READY'/);
assert.match(sql, /AS scale_ready/);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_scale_readiness FROM PUBLIC/);
assert.doesNotMatch(sql, /service_role|secret|password|token|signed_url/i);
assert.doesNotMatch(sql, /DELETE\s+FROM|DROP\s+(TABLE|SCHEMA)|TRUNCATE/i);

console.log('PASS wilpay storage unified scale readiness');
