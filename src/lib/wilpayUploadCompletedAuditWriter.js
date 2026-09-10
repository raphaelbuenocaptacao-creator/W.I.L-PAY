const FORBIDDEN_AUDIT_KEY = /"(?:data_url|signed_url|upload_url|service_role|token|authorization|file_bytes|file_data|base64|secret|password|api_key|blob|file|bytes|buffer|content)"\s*:/i;

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function assertSafeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Upload completed audit event is required');
  }
  const serialized = JSON.stringify(event);
  if (serialized.length > 16384) throw new Error('Upload completed audit event is too large');
  if (FORBIDDEN_AUDIT_KEY.test(serialized)) throw new Error('Upload completed audit event contains forbidden sensitive fields');
  return event;
}

/**
 * Adapts the metadata-only completion event emitted after a successful private
 * Storage upload + metadata persistence to the append-only wilpay.file_audit_log.
 * The injected insert function must use only the exclusive W.I.L Pay database.
 */
export function createWilpayUploadCompletedAuditWriter({ insertAuditRow } = {}) {
  if (typeof insertAuditRow !== 'function') throw new Error('Upload completed audit insert function is required');

  return async function auditUploadCompleted(rawEvent) {
    const event = assertSafeEvent(rawEvent);
    if (event.event_type !== 'private_upload_completed') {
      throw new Error('Unsupported upload completed audit event type');
    }

    const fileId = requiredText(event.file_id, 'audit file_id');
    const actorUserId = requiredText(event.owner_user_id, 'audit owner_user_id');
    const requestId = requiredText(event.request_id, 'audit request_id');
    const occurredAt = requiredText(event.occurred_at, 'audit occurred_at');
    const documentType = requiredText(event.document_type, 'audit document_type');
    const storageProvider = requiredText(event.storage_provider, 'audit storage_provider');
    const bucket = requiredText(event.bucket, 'audit bucket');
    const objectKey = requiredText(event.object_key, 'audit object_key');
    const contentType = requiredText(event.content_type, 'audit content_type');
    const checksum = requiredText(event.checksum_sha256, 'audit checksum_sha256');

    if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid audit checksum_sha256');
    if (!Number.isInteger(event.size_bytes) || event.size_bytes <= 0) throw new Error('Invalid audit size_bytes');
    if (!Number.isFinite(Date.parse(occurredAt))) throw new Error('Invalid upload completed audit timestamp');

    const row = Object.freeze({
      file_id: fileId,
      actor_user_id: actorUserId,
      action: 'upload_completed',
      occurred_at: occurredAt,
      request_id: requestId,
      details: Object.freeze({
        phase: 'completed',
        loan_id: event.loan_id || null,
        document_type: documentType,
        storage_provider: storageProvider,
        bucket,
        object_key: objectKey,
        content_type: contentType,
        size_bytes: event.size_bytes,
        checksum_sha256: checksum
      })
    });

    await insertAuditRow(row);
    return row;
  };
}
