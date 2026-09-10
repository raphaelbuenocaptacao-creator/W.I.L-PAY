const SAFE_ACTIONS = new Set([
  'grant_requested',
  'upload_completed',
  'view_granted',
  'metadata_updated',
  'quarantined',
  'archived'
]);

const FORBIDDEN_SERIALIZED_KEY = /"(?:data_url|signed_url|upload_url|service_role|token|authorization|file_bytes|file_data|base64|secret|password|api_key|blob)"\s*:/i;

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function assertSafeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    throw new Error('audit details must be an object');
  }
  const serialized = JSON.stringify(details);
  if (serialized.length > 8192) throw new Error('audit details are too large');
  if (FORBIDDEN_SERIALIZED_KEY.test(serialized)) {
    throw new Error('audit details contain forbidden sensitive fields');
  }
  return serialized;
}

/**
 * Creates a minimal, parameterized INSERT adapter for wilpay.file_audit_log.
 *
 * `query` must be a server-only database function with the signature:
 *   query(sqlText, params) -> Promise<result>
 * and MUST use the exclusive W.I.L Pay database connection.
 *
 * The adapter never accepts connection strings or credentials and never builds SQL
 * from user-controlled values. It writes one append-only audit row and returns no
 * stored row contents, preventing accidental propagation of audit metadata.
 */
export function createWilpayFileAuditInsertAdapter({ query } = {}) {
  if (typeof query !== 'function') throw new Error('W.I.L Pay audit database query function is required');

  return async function insertWilpayFileAuditRow(rawRow) {
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
      throw new Error('W.I.L Pay audit row is required');
    }

    const fileId = requiredText(rawRow.file_id, 'audit file_id');
    const actorUserId = requiredText(rawRow.actor_user_id, 'audit actor_user_id');
    const action = requiredText(rawRow.action, 'audit action');
    const occurredAt = requiredText(rawRow.occurred_at, 'audit occurred_at');
    const requestId = requiredText(rawRow.request_id, 'audit request_id');

    if (!SAFE_ACTIONS.has(action)) throw new Error('Unsupported W.I.L Pay audit action');
    if (!Number.isFinite(Date.parse(occurredAt))) throw new Error('Invalid W.I.L Pay audit occurred_at');

    const detailsJson = assertSafeDetails(rawRow.details);

    const sql = `INSERT INTO wilpay.file_audit_log
      (file_id, actor_user_id, action, occurred_at, request_id, details)
      VALUES ($1, $2, $3, $4::timestamptz, $5, $6::jsonb)`;

    const params = Object.freeze([
      fileId,
      actorUserId,
      action,
      occurredAt,
      requestId,
      detailsJson
    ]);

    await query(sql, params);

    return Object.freeze({
      inserted: true,
      file_id: fileId,
      request_id: requestId,
      action
    });
  };
}
