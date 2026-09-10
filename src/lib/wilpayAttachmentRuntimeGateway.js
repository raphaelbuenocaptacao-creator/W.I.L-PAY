import {
  persistWilpayPrivateAttachmentWithSession,
  wilpayPrivateUploadRuntimeStatus
} from './wilpayPrivateUploadSession.js';

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
  return value;
}

function normalizeRuntimeStatus(status) {
  const value = status || {};
  return Object.freeze({
    ready: Boolean(value.ready),
    endpoint_configured: Boolean(value.endpoint_configured),
    upload_origins_configured: Boolean(value.upload_origins_configured)
  });
}

export async function persistWilpayAttachmentForRuntime({
  neon,
  getAccessToken,
  auditUploadCompleted,
  authUid,
  loanId,
  docType,
  file,
  fetchImpl,
  createdAt,
  randomUUID,
  legacyPersist,
  runtimeStatus = wilpayPrivateUploadRuntimeStatus,
  persistPrivate = persistWilpayPrivateAttachmentWithSession
}) {
  const statusProvider = requiredFunction(runtimeStatus, 'runtimeStatus');
  const status = normalizeRuntimeStatus(statusProvider());

  if (status.ready) {
    const persistPrivateAttachment = requiredFunction(persistPrivate, 'persistPrivate');
    // A ready private-storage runtime must never accept unaudited uploads.
    // Requiring the completion auditor here prevents a partially wired backend
    // from silently storing private client documents without an append-only trail.
    const completionAuditor = requiredFunction(auditUploadCompleted, 'auditUploadCompleted');
    const result = await persistPrivateAttachment({
      neon,
      getAccessToken,
      auditUploadCompleted: completionAuditor,
      authUid,
      loanId,
      docType,
      file,
      fetchImpl,
      createdAt,
      randomUUID
    });
    return Object.freeze({ mode: 'private', result });
  }

  // Partial private-storage configuration must never silently fall back to
  // database binary persistence. This makes rollout fail closed.
  if (status.endpoint_configured || status.upload_origins_configured) {
    throw new Error('W.I.L Pay private storage configuration is incomplete');
  }

  // Legacy persistence exists only as a temporary compatibility bridge while
  // the dedicated W.I.L Pay Storage/backend is not provisioned. Callers must
  // opt into it explicitly; the private path remains the preferred path.
  const persistLegacy = requiredFunction(legacyPersist, 'legacyPersist');
  const result = await persistLegacy();
  return Object.freeze({ mode: 'legacy', result });
}
