import assert from 'node:assert/strict';
import { createWilpayFileAuditInsertAdapter } from '../src/lib/wilpayFileAuditInsertAdapter.js';

const calls = [];
const insertAuditRow = createWilpayFileAuditInsertAdapter({
  query: async (sql, params) => {
    calls.push({ sql, params });
    return { rowCount: 1 };
  }
});

const row = {
  file_id: 'file_456',
  actor_user_id: 'user_123',
  action: 'grant_requested',
  occurred_at: '2026-09-10T12:00:00.000Z',
  request_id: "req_'_001",
  details: {
    phase: 'issued',
    document_type: 'document',
    content_type: 'application/pdf',
    size_bytes: 2048,
    checksum_sha256: 'c'.repeat(64),
    expires_at: '2026-09-10T12:05:00.000Z'
  }
};

const result = await insertAuditRow(row);
assert.deepEqual(result, {
  inserted: true,
  file_id: row.file_id,
  request_id: row.request_id,
  action: row.action
});
assert.equal(Object.isFrozen(result), true);
assert.equal(calls.length, 1);
assert.match(calls[0].sql, /INSERT INTO wilpay\.file_audit_log/i);
assert.match(calls[0].sql, /VALUES \(\$1, \$2, \$3, \$4::timestamptz, \$5, \$6::jsonb\)/);
assert.equal(calls[0].sql.includes(row.request_id), false, 'request values must never be interpolated into SQL');
assert.equal(calls[0].params[4], row.request_id);
assert.equal(calls[0].params.length, 6);
assert.equal(Object.isFrozen(calls[0].params), true);

await assert.rejects(
  insertAuditRow({ ...row, action: 'delete_everything' }),
  /unsupported/i
);

await assert.rejects(
  insertAuditRow({ ...row, details: { nested: { signed_url: 'https://example.invalid/private' } } }),
  /forbidden sensitive fields/i
);

await assert.rejects(
  insertAuditRow({ ...row, occurred_at: 'not-a-date' }),
  /occurred_at/i
);

assert.throws(
  () => createWilpayFileAuditInsertAdapter(),
  /query function is required/i
);

assert.equal(calls.length, 1, 'rejected rows must never reach the database query function');

console.log('PASS wilpayFileAuditInsertAdapter');
