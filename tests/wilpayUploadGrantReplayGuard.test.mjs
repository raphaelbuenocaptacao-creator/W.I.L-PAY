import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../infra/wilpay-upload-grant-replay-guard.sql', import.meta.url), 'utf8');

assert.match(sql, /create table if not exists wilpay_upload_grant_nonce/i);
assert.match(sql, /request_id text primary key/i);
assert.match(sql, /upload_id uuid/i);
assert.match(sql, /add column if not exists upload_id uuid/i);
assert.match(sql, /consumed_at timestamptz/i);
assert.match(sql, /expires_at > created_at/i);
assert.match(sql, /interval '10 minutes'/i);
assert.match(sql, /object_key like 'wilpay\/production\/%'/i);
assert.match(sql, /create or replace function wilpay_consume_upload_grant/i);
assert.match(sql, /p_upload_id uuid/i);
assert.match(sql, /upload_id = p_upload_id/i);
assert.match(sql, /consumed_at is null/i);
assert.match(sql, /expires_at > p_now/i);
assert.match(sql, /get diagnostics v_rows = row_count/i);
assert.match(sql, /return v_rows = 1/i);
assert.match(sql, /legacy signature is intentionally fail-closed/i);
assert.doesNotMatch(sql, /delete\s+from\s+wilpay_upload_grant_nonce/i);
assert.doesNotMatch(sql, /truncate\s+wilpay_upload_grant_nonce/i);
assert.doesNotMatch(sql, /update\s+wilpay_upload_grant_nonce\s+set\s+upload_id/i);

console.log('PASS wilpayUploadGrantReplayGuard');
