import { persistWilpayPrivateAttachment } from './wilpayPrivateAttachmentPersistence.js';
import {
  configuredWilpayUploadGrantEndpoint,
  createWilpayUploadGrantRequester
} from './wilpayUploadGrantClient.js';

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
  return value;
}

function optionalFunction(value, label) {
  if (value != null && typeof value !== 'function') throw new Error(`${label} must be a function`);
  return value;
}

function configuredUploadOrigins() {
  return String(import.meta.env?.VITE_WILPAY_STORAGE_UPLOAD_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export function wilpayPrivateUploadRuntimeStatus() {
  const endpoint = configuredWilpayUploadGrantEndpoint();
  const uploadOrigins = configuredUploadOrigins();
  return Object.freeze({
    ready: Boolean(endpoint && uploadOrigins.length),
    endpoint_configured: Boolean(endpoint),
    upload_origins_configured: uploadOrigins.length > 0
  });
}

export async function persistWilpayPrivateAttachmentWithSession({
  neon,
  getAccessToken,
  auditUploadCompleted,
  authUid,
  loanId,
  docType,
  file,
  fetchImpl,
  createdAt,
  randomUUID
}) {
  const status = wilpayPrivateUploadRuntimeStatus();
  if (!status.endpoint_configured) {
    throw new Error('W.I.L Pay private upload grant endpoint is not configured');
  }
  if (!status.upload_origins_configured) {
    throw new Error('W.I.L Pay private storage upload origin is not configured');
  }

  const tokenProvider = requiredFunction(getAccessToken, 'getAccessToken');
  const completionAuditor = optionalFunction(auditUploadCompleted, 'auditUploadCompleted');
  const requestUploadGrant = createWilpayUploadGrantRequester({
    getAccessToken: tokenProvider,
    fetchImpl
  });

  return persistWilpayPrivateAttachment({
    neon,
    authUid,
    loanId,
    docType,
    file,
    requestUploadGrant,
    auditUploadCompleted: completionAuditor,
    allowedUploadOrigins: configuredUploadOrigins(),
    fetchImpl,
    createdAt,
    randomUUID
  });
}
