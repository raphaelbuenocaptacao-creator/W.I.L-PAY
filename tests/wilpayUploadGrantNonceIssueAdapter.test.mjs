import assert from 'node:assert/strict';

let adapterModule = null;
try {
  adapterModule = await import('../src/lib/wilpayUploadGrantNonceIssueAdapter.js');
} catch {
  // RED until the server-only database adapter exists.
}

assert.ok(adapterModule, 'W.I.L Pay upload grant nonce issue adapter is required');
const { createWilpayUploadGrantNonceIssueAdapter } = adapterModule;
assert.equal(typeof createWilpayUploadGrantNonceIssueAdapter, 'function');

const calls = [];
const issueGrantNonce = createWilpayUploadGrantNonceIssueAdapter({
  query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ issued: true }] };
  }
});

const payload = {
  request_id: 'req_001',
  upload_id: '2f4f8d7b-fb79-4a45-9f9c-701c83f9bdb4',
  owner_user_id: 'user_123',
  file_id: 'file_456',
  object_key: 'clients/user_123/documents/file_456.pdf',
  expires_at: '2026-09-12T09:35:00.000Z'
};

assert.equal(await issueGrantNonce(payload), true);
assert.equal(calls.length, 1);
assert.match(calls[0].sql, /wilpay_issue_upload_grant_nonce/i);
assert.match(calls[0].sql, /\$2::uuid/);
assert.match(calls[0].sql, /\$6::timestamptz/);
assert.equal(calls[0].sql.includes(payload.request_id), false, 'request values must not be interpolated into SQL');
assert.deepEqual(calls[0].params, [
  payload.request_id,
  payload.upload_id,
  payload.owner_user_id,
  payload.file_id,
  payload.object_key,
  payload.expires_at
]);
assert.equal(Object.isFrozen(calls[0].params), true);

const conflictIssueGrantNonce = createWilpayUploadGrantNonceIssueAdapter({
  query: async () => ({ rows: [{ issued: false }] })
});
assert.equal(await conflictIssueGrantNonce(payload), false, 'nonce conflicts must fail closed');

let rejectedQueries = 0;
const guardedIssueGrantNonce = createWilpayUploadGrantNonceIssueAdapter({
  query: async () => {
    rejectedQueries += 1;
    return { rows: [{ issued: true }] };
  }
});

await assert.rejects(
  guardedIssueGrantNonce({ ...payload, upload_id: 'not-a-uuid' }),
  /upload_id/i
);
await assert.rejects(
  guardedIssueGrantNonce({ ...payload, expires_at: 'not-a-date' }),
  /expires_at/i
);
assert.equal(rejectedQueries, 0, 'invalid nonce requests must not reach the database');

assert.throws(
  () => createWilpayUploadGrantNonceIssueAdapter(),
  /query function is required/i
);

console.log('PASS wilpayUploadGrantNonceIssueAdapter');
