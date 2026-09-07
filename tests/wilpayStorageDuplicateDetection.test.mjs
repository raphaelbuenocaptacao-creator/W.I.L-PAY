import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-storage-duplicate-detection.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE INDEX IF NOT EXISTS wilpay_private_files_checksum_uploaded_idx/i);
assert.match(sql, /CREATE OR REPLACE VIEW wilpay\.storage_duplicate_upload_candidates/i);
assert.match(sql, /checksum_sha256/i);
assert.match(sql, /HAVING count\(\*\) > 1/i);
assert.match(sql, /REVOKE ALL ON wilpay\.storage_duplicate_upload_candidates FROM PUBLIC/i);
assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
assert.doesNotMatch(sql, /\bUPDATE\s+wilpay\.private_files\b/i);
assert.doesNotMatch(sql, /\bsigned_url\s+AS\b/i);
assert.doesNotMatch(sql, /\bobject_key\s+AS\b/i);

console.log('PASS wilpayStorageDuplicateDetection');
