import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-history-integrity.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_history_integrity/i);
assert.match(sql, /document_type/i);
assert.match(sql, /total_versions/i);
assert.match(sql, /active_versions/i);
assert.match(sql, /archived_versions/i);
assert.match(sql, /quarantined_versions/i);
assert.match(sql, /checksum_sha256/i);
assert.match(sql, /object_key LIKE 'wilpay\/users\/%\/loans\/%'/i);
assert.match(sql, /MULTIPLE_ACTIVE_VERSIONS/i);
assert.match(sql, /INVALID_CHECKSUM/i);
assert.match(sql, /INVALID_OBJECT_SCOPE/i);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_history_integrity FROM PUBLIC/i);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
assert.doesNotMatch(sql, /\bDROP\s+(TABLE|SCHEMA|VIEW)\b/i);
assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
assert.doesNotMatch(sql, /service_role|api[_-]?key|authorization\s*:/i);

console.log('PASS wilpayStorageHistoryIntegrity');
