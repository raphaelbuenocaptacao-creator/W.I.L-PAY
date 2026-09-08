import { wilpayPrivateUploadRuntimeStatus } from './wilpayPrivateUploadSession.js';

function blockedBuilder(message) {
  const result = { data: null, error: { message, code: 'WILPAY_PRIVATE_STORAGE_REQUIRED' } };
  return {
    select() { return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
}

function hasLegacyAttachmentBinary(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.some(item =>
    item?.record_type === 'ATTACHMENT' &&
    typeof item?.data_url === 'string' &&
    item.data_url.startsWith('data:')
  );
}

export function installWilpayLegacyAttachmentWriteGuard(
  neon,
  runtimeStatus = wilpayPrivateUploadRuntimeStatus
) {
  if (!neon || typeof neon.from !== 'function') throw new Error('Neon client is required');
  if (neon.__wilpayAttachmentWriteGuardInstalled) return neon;

  const originalFrom = neon.from.bind(neon);
  neon.from = table => {
    const source = originalFrom(table);
    if (String(table) !== 'wilpay_loans' || typeof source?.insert !== 'function') return source;

    return {
      ...source,
      insert(payload) {
        const status = runtimeStatus?.() || {};
        const privateRolloutStarted = Boolean(
          status.ready || status.endpoint_configured || status.upload_origins_configured
        );

        if (privateRolloutStarted && hasLegacyAttachmentBinary(payload)) {
          return blockedBuilder(
            'Upload privado do W.I.L Pay está ativo. Use o fluxo Storage-first; binário no AUREON foi bloqueado.'
          );
        }

        return source.insert(payload);
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
