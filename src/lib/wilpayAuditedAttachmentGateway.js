import { persistWilpayAttachmentForRuntime } from './wilpayAttachmentRuntimeGateway.js';
import { createWilpayUploadCompletedAuditRuntime } from './wilpayUploadCompletedAuditRuntime.js';
import { createWilpayPrivateRuntimeReadiness } from '../../scripts/wilpayInfrastructureReadinessGate.mjs';

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
  'persistAttachment',
  'binding',
  'observedDatabaseIdentity',
  'observedStorageIdentity',
  'transportStatus'
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
 * Database access and infrastructure readiness are injected only here as
 * narrow server capabilities. Request-controlled data cannot replace either
 * capability or choose the persistence mode.
 */
export function createWilpayAuditedAttachmentGateway({
  query,
  runtimeStatus,
  persistAttachment = persistWilpayAttachmentForRuntime
} = {}) {
  const gateway = requiredFunction(persistAttachment, 'persistAttachment');
  const trustedRuntimeStatus = requiredFunction(runtimeStatus, 'runtimeStatus');
  const { auditUploadCompleted } = createWilpayUploadCompletedAuditRuntime({ query });

  async function persistAttachmentWithAudit(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('attachment input is required');
    }

    // Fail closed if request-controlled data attempts to replace any capability
    // that decides persistence mode or writes audit records. Infrastructure
    // binding and observed resource identities are server-owned capabilities too.
    assertNoRequestCapabilityInjection(input);

    return gateway({
      ...input,
      auditUploadCompleted,
      runtimeStatus: trustedRuntimeStatus
    });
  }

  return Object.freeze({
    persistAttachment: persistAttachmentWithAudit
  });
}

/**
 * Builds the only server-side attachment runtime that may choose private
 * Storage. Readiness is derived once from the exclusive infrastructure binding
 * and the identities observed by the backend, then captured as an immutable
 * capability before any request data is accepted.
 */
export function createWilpayExclusiveAttachmentRuntime({
  query,
  binding,
  observedDatabaseIdentity,
  observedStorageIdentity,
  transportStatus,
  persistAttachment
} = {}) {
  const readiness = createWilpayPrivateRuntimeReadiness({
    binding,
    observedDatabaseIdentity,
    observedStorageIdentity,
    transportStatus
  });

  const runtimeStatus = () => readiness;

  return createWilpayAuditedAttachmentGateway({
    query,
    runtimeStatus,
    persistAttachment
  });
}
