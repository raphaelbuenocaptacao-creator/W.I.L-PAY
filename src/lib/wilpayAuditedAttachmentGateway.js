import { persistWilpayAttachmentForRuntime } from './wilpayAttachmentRuntimeGateway.js';
import { createWilpayUploadCompletedAuditRuntime } from './wilpayUploadCompletedAuditRuntime.js';

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
  return value;
}

/**
 * Server-side composition boundary for W.I.L Pay attachment persistence.
 *
 * The database query function is injected only here and converted into the
 * narrow auditUploadCompleted capability expected by the upload gateway.
 * Callers never receive the query function and cannot replace the mandatory
 * completion auditor through per-request input.
 */
export function createWilpayAuditedAttachmentGateway({
  query,
  persistAttachment = persistWilpayAttachmentForRuntime
} = {}) {
  const gateway = requiredFunction(persistAttachment, 'persistAttachment');
  const { auditUploadCompleted } = createWilpayUploadCompletedAuditRuntime({ query });

  async function persistAttachmentWithAudit(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('attachment input is required');
    }

    // Intentionally override any request-provided auditor. The audit capability
    // must be created server-side from the exclusive W.I.L Pay database only.
    return gateway({
      ...input,
      auditUploadCompleted
    });
  }

  return Object.freeze({
    persistAttachment: persistAttachmentWithAudit
  });
}
