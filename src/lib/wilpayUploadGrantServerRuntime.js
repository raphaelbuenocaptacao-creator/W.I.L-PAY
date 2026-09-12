import { issueWilpayPersistedSignedUploadGrant } from './wilpayUploadGrantIssuer.js';
import { createWilpayUploadGrantNonceIssueAdapter } from './wilpayUploadGrantNonceIssueAdapter.js';
import { createWilpayServerRuntimeReadiness } from '../../scripts/wilpayInfrastructureReadinessGate.mjs';

function requiredFunction(value, message) {
  if (typeof value !== 'function') throw new Error(message);
  return value;
}

function requiredText(value, message) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(message);
  return text;
}

function requiredHttpsOrigin(value) {
  const text = requiredText(value, 'Private storage endpoint origin is required');
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('Private storage endpoint origin is invalid');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Private storage endpoint origin must use HTTPS');
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Private storage endpoint origin must be an origin only');
  }

  return parsed.origin;
}

function createInfrastructureChecker({ infrastructureBinding, serverEnv }) {
  if (infrastructureBinding == null || serverEnv == null) {
    throw new Error('Exclusive infrastructure binding and server environment are required');
  }

  return async () => createWilpayServerRuntimeReadiness({
    binding: infrastructureBinding,
    env: serverEnv
  });
}

function createStorageScope(infrastructureBinding) {
  const isolation = infrastructureBinding?.isolation ?? {};
  return Object.freeze({
    provider: requiredText(isolation.storage_provider, 'Private storage provider is required'),
    resource_id: requiredText(isolation.storage_resource_id, 'Private storage resource_id is required'),
    provider_binding: requiredText(isolation.storage_provider_binding, 'Private storage provider binding is required'),
    endpoint_origin: requiredHttpsOrigin(isolation.storage_endpoint_origin),
    bucket: requiredText(isolation.storage_bucket, 'Private storage bucket is required'),
    root_prefix: requiredText(isolation.storage_layout?.root_prefix, 'Private storage root prefix is required')
  });
}

function createScopedStorageSigner(signer, storageScope) {
  return async (authorized) => {
    if (authorized?.bucket !== storageScope.bucket) {
      throw new Error('Authorized upload bucket does not match approved storage scope');
    }

    const expectedPrefix = `${storageScope.root_prefix}/`;
    if (typeof authorized?.object_key !== 'string' || !authorized.object_key.startsWith(expectedPrefix)) {
      throw new Error('Authorized upload object_key does not match approved storage root prefix');
    }

    const signed = await signer(authorized, storageScope);
    if (signed?.storage_resource_id !== storageScope.resource_id) {
      throw new Error('Signed grant storage resource_id mismatch');
    }

    if (typeof signed?.upload_url === 'string') {
      try {
        const signedUrl = new URL(signed.upload_url);
        if (signedUrl.protocol === 'https:' && signedUrl.origin !== storageScope.endpoint_origin) {
          throw new Error('Signed grant storage endpoint origin mismatch');
        }
      } catch (error) {
        if (error?.message === 'Signed grant storage endpoint origin mismatch') throw error;
      }
    }

    return signed;
  };
}

/**
 * Backend-only composition root for W.I.L Pay private upload grants.
 *
 * Every caller must provide infrastructureBinding + serverEnv so readiness is
 * derived directly from the approved exclusive binding and observed server-side
 * identities. There is intentionally no manual readiness override.
 *
 * The database query function must point to the exclusive W.I.L Pay database.
 * Storage credentials remain encapsulated inside signPrivateUpload and are never
 * accepted or returned by this runtime. Before the provider signer is called, the
 * authorized upload must match the approved bucket/root prefix and the signer must
 * attest the exact approved storage resource_id. HTTPS signed URLs are additionally
 * restricted to the approved storage endpoint origin. The storage scope is
 * server-only and is not returned to the client.
 *
 * The infrastructure readiness check must pass before the database, nonce consumer,
 * or private storage signer can run. A nonce is then persisted before it can be
 * consumed or a provider PUT URL can be signed.
 */
export function createWilpayUploadGrantServerRuntime({
  query,
  infrastructureBinding,
  serverEnv,
  consumeGrantNonce,
  signPrivateUpload,
  auditGrantIssued,
  now = () => Date.now()
} = {}) {
  const issueGrantNonce = createWilpayUploadGrantNonceIssueAdapter({ query });
  const checkInfrastructure = createInfrastructureChecker({
    infrastructureBinding,
    serverEnv
  });
  const storageScope = createStorageScope(infrastructureBinding);
  const consume = requiredFunction(
    consumeGrantNonce,
    'Atomic upload grant nonce consumer is required'
  );
  const signer = createScopedStorageSigner(
    requiredFunction(signPrivateUpload, 'Private storage upload signer is required'),
    storageScope
  );

  if (auditGrantIssued != null && typeof auditGrantIssued !== 'function') {
    throw new Error('Upload grant auditor must be a function');
  }
  requiredFunction(now, 'Upload grant clock is required');

  return async function issuePrivateUploadGrant(payload, { authenticatedUserId } = {}) {
    const readiness = await checkInfrastructure();
    if (readiness?.ready !== true) {
      throw new Error('W.I.L Pay private infrastructure is not ready');
    }

    return issueWilpayPersistedSignedUploadGrant(payload, {
      authenticatedUserId,
      issueGrantNonce,
      consumeGrantNonce: consume,
      signPrivateUpload: signer,
      auditGrantIssued,
      now
    });
  };
}
