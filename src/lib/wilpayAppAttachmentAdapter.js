import { persistWilpayAttachmentForRuntime } from './wilpayAttachmentRuntimeGateway.js';
import { getWilpayAureonAccessToken } from './wilpayAureonAccessToken.js';

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function compactLegacyRecord({ authUid, loanId, docType, file, createdAt }) {
  if (!file || typeof file !== 'object') throw new Error('file is required');
  const dataUrl = String(file.data_url || '');
  if (!/^data:(image\/(jpeg|png)|application\/pdf);base64,/i.test(dataUrl)) {
    throw new Error('legacy attachment data URL is invalid');
  }
  return {
    record_type: 'ATTACHMENT',
    auth_uid: requiredText(authUid, 'authUid'),
    loan_id: requiredText(loanId, 'loanId'),
    doc_type: requiredText(docType, 'docType').toUpperCase(),
    file_name: requiredText(file.name, 'file.name'),
    mime_type: requiredText(file.type, 'file.type').toLowerCase(),
    size: Number(file.size || 0),
    data_url: dataUrl,
    created_at: createdAt || new Date().toISOString()
  };
}

export async function persistWilpayAppAttachment({
  neon,
  getAccessToken = getWilpayAureonAccessToken,
  authUid,
  loanId,
  docType,
  file,
  createdAt,
  fetchImpl,
  randomUUID,
  runtimeStatus
}) {
  if (!neon || typeof neon.from !== 'function') throw new Error('Neon client is required');

  const legacyPersist = async () => {
    const record = compactLegacyRecord({ authUid, loanId, docType, file, createdAt });
    return neon.from('wilpay_loans').insert(record).select();
  };

  const outcome = await persistWilpayAttachmentForRuntime({
    neon,
    getAccessToken,
    authUid,
    loanId,
    docType,
    file,
    fetchImpl,
    createdAt,
    randomUUID,
    legacyPersist,
    runtimeStatus
  });

  if (outcome.mode === 'legacy') return outcome.result;

  return {
    data: outcome.result?.persisted ? [outcome.result.persisted] : [],
    error: null,
    storage_mode: 'private'
  };
}
