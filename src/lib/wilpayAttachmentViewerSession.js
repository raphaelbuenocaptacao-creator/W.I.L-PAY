import { resolveWilpayAttachmentViewer } from './wilpayAttachmentViewerResolver.js';
import { createWilpayViewerGrantRequester } from './wilpayViewerGrantClient.js';
import { getWilpayAureonAccessToken } from './wilpayAureonAccessToken.js';

function isPrivateRecord(record) {
  return Boolean(record?.file_id || record?.object_key);
}

function assertAttachmentRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('attachment record is required');
  // Preserve old attachment rows created before record_type existed, but never
  // allow an explicitly typed loan/location row to reach the private grant API.
  if (record.record_type && record.record_type !== 'ATTACHMENT') {
    throw new Error('record is not an attachment');
  }
  // Storage-backed rows must stay tenant-bound. Legacy data URLs remain readable
  // during migration, but a private grant is never requested for orphan metadata.
  if (isPrivateRecord(record) && !String(record.auth_uid || '').trim()) {
    throw new Error('private attachment owner is required');
  }
}

export async function resolveWilpayAttachmentForCurrentSession(
  record,
  {
    requestViewerGrant,
    getAccessToken = getWilpayAureonAccessToken,
    now = Date.now()
  } = {}
) {
  assertAttachmentRecord(record);
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
