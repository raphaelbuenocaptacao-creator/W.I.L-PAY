import { persistWilpayAttachmentForRuntime } from './wilpayAttachmentRuntimeGateway.js';
import { createWilpayUploadCompletedAuditRuntime } from './wilpayUploadCompletedAuditRuntime.js';

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
  return value;
}

const FORBIDDEN_REQUEST_CAPABILITIES = Object.freeze([
  'query',
  'auditUploadCompleted',
  'runtimeStatus',
  'persistPrivate',
  'legacyPersist',
  'persistAttachment'
]);

function assertNoRequestCapabilityInjection(input) {
  const injected = FORBIDDEN_REQUEST_CAPABILITIES.filter((key) =>
    Object.prototype.hasOwnProperty.call(input, key)
  );

  if (injected.length > 0) {
    throw new Error('W.I.L Pay attachment request contains forbidden server capability fields');
  }
}

/**
 * Server-side composition boundary for W.I.L Pay attachment persistence.
 *
 * The database query function is injected only here and converted into the
 * narrow auditUploadCompleted capability expected by the upload gateway.
 * Callers never receive the query function and cannot replace mandatory
 * server capabilities through per-request input.
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

    // Fail closed if request-controlled data attempts to replace any capability
    // that decides persistence mode or writes audit records. These capabilities
    // belong exclusively to the W.I.L Pay server/runtime composition layer.
    assertNoRequestCapabilityInjection(input);

    return gateway({
      ...input,
      auditUploadCompleted
    });
  }

  return Object.freeze({
    persistAttachment: persistAttachmentWithAudit
  });
}
