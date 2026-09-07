import { prepareWilpayPrivateUpload } from './wilpayStorage.js';
import { buildWilpaySignedUploadRequest, uploadWilpayPrivateFile } from './wilpaySignedUpload.js';

function assertFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} is required`);
}

function assertMetadataOnlyPayload(metadata) {
  const forbiddenKeys = ['file', 'blob', 'bytes', 'buffer', 'base64', 'content', 'upload_url', 'signed_url'];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new Error(`Metadata payload must not contain ${key}`);
    }
  }
  return true;
}

export async function uploadWilpayFileToPrivateStorage({
  userId,
  loanId,
  kind,
  fileId,
  file,
  storageProvider,
  createdAt,
  requestUploadGrant,
  persistFileMetadata,
  allowedUploadOrigins,
  fetchImpl
}) {
  assertFunction(requestUploadGrant, 'requestUploadGrant');
  assertFunction(persistFileMetadata, 'persistFileMetadata');

  const prepared = await prepareWilpayPrivateUpload({
    userId,
    loanId,
    kind,
    fileId,
    file,
    storageProvider,
    createdAt
  });

  const grantRequest = buildWilpaySignedUploadRequest(prepared.metadata);
  const grant = await requestUploadGrant(grantRequest);

  const uploaded = await uploadWilpayPrivateFile({
    file: prepared.file,
    metadata: prepared.metadata,
    grant,
    allowedUploadOrigins,
    fetchImpl
  });

  assertMetadataOnlyPayload(prepared.metadata);

  // Persist metadata only after the object upload succeeds. This keeps Neon/AUREON
  // free of document binaries and avoids marking failed uploads as completed.
  const persisted = await persistFileMetadata({ ...prepared.metadata });

  return Object.freeze({
    file_id: uploaded.file_id,
    bucket: uploaded.bucket,
    object_key: uploaded.object_key,
    checksum_sha256: uploaded.checksum_sha256,
    persisted: persisted ?? null
  });
}

export const WILPAY_FORBIDDEN_DATABASE_FILE_FIELDS = Object.freeze([
  'file',
  'blob',
  'bytes',
  'buffer',
  'base64',
  'content',
  'upload_url',
  'signed_url'
]);
