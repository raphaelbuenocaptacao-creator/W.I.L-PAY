import { wilpayPrivateUploadRuntimeStatus } from './wilpayPrivateUploadSession.js';
import { persistWilpayAppAttachment } from './wilpayAppAttachmentAdapter.js';

const PRIVATE_ATTACHMENT_DOC_TYPES = new Set([
  'DOCUMENTO_FOTO',
  'COMPROVANTE_RESIDENCIA',
  'SELFIE_DOCUMENTO',
  'GARANTIA_FOTO_1',
  'GARANTIA_FOTO_2',
  'GARANTIA_FOTO_3',
  'COMPROVANTE_PAGAMENTO'
]);

function resultBuilder(promise) {
  return {
    select() { return this; },
    then(resolve, reject) { return Promise.resolve(promise).then(resolve, reject); }
  };
}

function blockedBuilder(message) {
  return resultBuilder({ data: null, error: { message, code: 'WILPAY_PRIVATE_STORAGE_REQUIRED' } });
}

function legacyAttachmentItems(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.filter(item =>
    item?.record_type === 'ATTACHMENT' &&
    typeof item?.data_url === 'string' &&
    item.data_url.startsWith('data:')
  );
}

function fileFromLegacyAttachment(item) {
  return {
    name: item.file_name,
    type: item.mime_type,
    size: item.size,
    data_url: item.data_url
  };
}

function normalizedDocType(item) {
  return String(item?.doc_type || '').trim().toUpperCase();
}

export function installWilpayLegacyAttachmentWriteGuard(
  neon,
  runtimeStatus = wilpayPrivateUploadRuntimeStatus,
  persistAttachment = persistWilpayAppAttachment
) {
  if (!neon || typeof neon.from !== 'function') throw new Error('Neon client is required');
  if (typeof persistAttachment !== 'function') throw new Error('Attachment persistence adapter is required');
  if (neon.__wilpayAttachmentWriteGuardInstalled) return neon;

  const originalFrom = neon.from.bind(neon);
  const persistenceClient = { from: originalFrom };

  neon.from = table => {
    const source = originalFrom(table);
    if (String(table) !== 'wilpay_loans' || typeof source?.insert !== 'function') return source;

    return {
      ...source,
      insert(payload) {
        const status = runtimeStatus?.() || {};
        const legacyAttachments = legacyAttachmentItems(payload);
        const privateRolloutStarted = Boolean(
          status.ready || status.endpoint_configured || status.upload_origins_configured
        );

        if (!privateRolloutStarted || legacyAttachments.length === 0) {
          return source.insert(payload);
        }

        // Partial private-storage configuration must fail closed: never send
        // binary/base64 back to AUREON while rollout is incomplete.
        if (!status.ready) {
          return blockedBuilder(
            'Upload privado do W.I.L Pay está parcialmente configurado. Binário no AUREON foi bloqueado.'
          );
        }

        // AppV3 currently inserts one attachment at a time. Once private
        // Storage is ready, transparently route that legacy call through the
        // Storage-first adapter instead of writing data_url into wilpay_loans.
        if (legacyAttachments.length !== 1 || (Array.isArray(payload) && payload.length !== 1)) {
          return blockedBuilder(
            'Upload privado do W.I.L Pay exige anexos individuais para preservar auditoria e metadados.'
          );
        }

        const item = legacyAttachments[0];
        const docType = normalizedDocType(item);
        if (!PRIVATE_ATTACHMENT_DOC_TYPES.has(docType)) {
          return blockedBuilder(
            'Tipo de anexo não permitido no Storage privado do W.I.L Pay.'
          );
        }

        const routed = persistAttachment({
          neon: persistenceClient,
          authUid: item.auth_uid,
          loanId: item.loan_id,
          docType,
          file: fileFromLegacyAttachment(item),
          createdAt: item.created_at,
          runtimeStatus: () => status
        }).catch(error => ({
          data: null,
          error: {
            message: error?.message || 'Falha no upload privado do W.I.L Pay.',
            code: 'WILPAY_PRIVATE_STORAGE_REQUIRED'
          }
        }));

        return resultBuilder(routed);
      }
    };
  };

  Object.defineProperty(neon, '__wilpayAttachmentWriteGuardInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return neon;
}
