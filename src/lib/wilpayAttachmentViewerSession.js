import { resolveWilpayAttachmentViewer } from './wilpayAttachmentViewerResolver.js';
import { createWilpayViewerGrantRequester } from './wilpayViewerGrantClient.js';
import { getWilpayAureonAccessToken } from './wilpayAureonAccessToken.js';

function isPrivateRecord(record) {
  return Boolean(record?.file_id || record?.object_key);
}

export async function resolveWilpayAttachmentForCurrentSession(
  record,
  {
    requestViewerGrant,
    getAccessToken = getWilpayAureonAccessToken,
    now = Date.now()
  } = {}
) {
  let requester = requestViewerGrant;

  // Legacy data URLs do not need a backend call. Metadata-only records do,
  // and the requester is created only at that point so rollout can stay gradual.
  if (isPrivateRecord(record) && typeof requester !== 'function') {
    requester = createWilpayViewerGrantRequester({ getAccessToken });
  }

  return resolveWilpayAttachmentViewer({
    record,
    requestViewerGrant: requester,
    now
  });
}

export async function openWilpayAttachmentForCurrentSession(
  record,
  {
    openWindow = globalThis?.open?.bind(globalThis),
    ...resolverOptions
  } = {}
) {
  if (typeof openWindow !== 'function') throw new Error('secure viewer window is unavailable');
  const resolved = await resolveWilpayAttachmentForCurrentSession(record, resolverOptions);
  const opened = openWindow(resolved.source, '_blank', 'noopener,noreferrer');
  if (opened && typeof opened === 'object' && 'opener' in opened) opened.opener = null;
  return resolved;
}
