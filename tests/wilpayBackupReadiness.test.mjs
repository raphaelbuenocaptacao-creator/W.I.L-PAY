import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../infra/wilpay-backup-readiness.sql',import.meta.url),'utf8');

assert.match(sql,/CREATE OR REPLACE VIEW wilpay\.backup_readiness/i);
assert.match(sql,/CREATE OR REPLACE VIEW wilpay\.backup_checkpoint/i);
assert.match(sql,/checksum_sha256/i);
assert.match(sql,/file_audit_log/i);
assert.match(sql,/private_files/i);

// The readiness layer must remain metadata-only and non-destructive.
assert.doesNotMatch(sql,/\bDELETE\s+FROM\b/i);
assert.doesNotMatch(sql,/\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i);
assert.doesNotMatch(sql,/\bTRUNCATE\b/i);
assert.doesNotMatch(sql,/service_role|signed_url|authorization\s*[:=]|api[_-]?key\s*[:=]|password\s*[:=]/i);

console.log('wilpay backup readiness: PASS');
