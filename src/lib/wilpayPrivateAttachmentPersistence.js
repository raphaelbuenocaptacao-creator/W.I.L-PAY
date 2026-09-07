import { uploadWilpayFileToPrivateStorage } from './wilpayPrivateUploadFlow.js';
import { buildWilpayAttachmentRecord } from './wilpayAttachmentRecord.js';

const DOC_KIND = Object.freeze({
  DOCUMENTO_FOTO: 'document',
  COMPROVANTE_RESIDENCIA: 'document',
  SELFIE_DOCUMENTO: 'selfie',
  GARANTIA_FOTO_1: 'guarantee',
  GARANTIA_FOTO_2: 'guarantee',
  GARANTIA_FOTO_3: 'guarantee',
  COMPROVANTE_PAGAMENTO: 'receipt'
});

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function secureFileId(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (typeof randomUUID !== 'function') throw new Error('Secure file id generation is unavailable');
  return requiredText(randomUUID(), 'fileId');
}

function assertNeonClient(neon) {
  if (!neon || typeof neon.from !== 'function') throw new Error('Neon client is required');
}

export function wilpayStorageKindForDocType(docType) {
  const normalized = requiredText(docType, 'docType').toUpperCase();
  const kind = DOC_KIND[normalized];
  if (!kind) throw new Error('Unsupported W.I.L Pay attachment type');
  return kind;
}

export async function persistWilpayPrivateAttachment({
  neon,
  authUid,
  loanId,
  docType,
  file,
  requestUploadGrant,
  allowedUploadOrigins,
  fetchImpl,
  storageProvider = 'private',
  createdAt = new Date().toISOString(),
  randomUUID
}) {
  assertNeonClient(neon);
  const safeAuthUid = requiredText(authUid, 'authUid');
  const safeLoanId = requiredText(loanId, 'loanId');
  const safeDocType = requiredText(docType, 'docType').toUpperCase();
  const kind = wilpayStorageKindForDocType(safeDocType);
  const fileId = secureFileId(randomUUID);

  return uploadWilpayFileToPrivateStorage({
    userId: safeAuthUid,
    loanId: safeLoanId,
    kind,
    fileId,
    file,
    storageProvider,
    createdAt,
    requestUploadGrant,
    allowedUploadOrigins,
    fetchImpl,
    persistFileMetadata: async metadata => {
      const record = buildWilpayAttachmentRecord({
        authUid: safeAuthUid,
        loanId: safeLoanId,
        docType: safeDocType,
        file: {
          name: file?.name,
          type: metadata.mime_type,
          size: metadata.size_bytes
        },
        upload: metadata,
        storageProvider: metadata.storage_provider,
        createdAt: metadata.created_at
      });

      const result = await neon.from('wilpay_loans').insert(record).select();
      if (result?.error) throw new Error(`Attachment metadata persistence failed: ${result.error.message || 'unknown error'}`);
      return result?.data?.[0] ?? null;
    }
  });
}

export const WILPAY_PRIVATE_ATTACHMENT_DOC_TYPES = Object.freeze(Object.keys(DOC_KIND));
