import { issueWilpayPersistedSignedUploadGrant } from './wilpayUploadGrantIssuer.js';
import { createWilpayUploadGrantNonceIssueAdapter } from './wilpayUploadGrantNonceIssueAdapter.js';
import { createWilpayServerRuntimeReadiness } from '../../scripts/wilpayInfrastructureReadinessGate.mjs';

function requiredFunction(value, message) {
  if (typeof value !== 'function') throw new Error(message);
  return value;
}

function createInfrastructureChecker({
  infrastructureBinding,
  serverEnv,
  checkPrivateInfrastructureReady,
  allowLegacyReadinessChecker
}) {
  const hasBinding = infrastructureBinding != null;
  const hasServerEnv = serverEnv != null;

  if (hasBinding || hasServerEnv) {
    if (!hasBinding || !hasServerEnv) {
      throw new Error('Exclusive infrastructure binding and server environment are required');
    }

    return async () => createWilpayServerRuntimeReadiness({
      binding: infrastructureBinding,
      env: serverEnv
    });
  }

  if (checkPrivateInfrastructureReady != null) {
    if (allowLegacyReadinessChecker !== true) {
      throw new Error('Exclusive infrastructure binding and server environment are required');
    }

    return requiredFunction(
      checkPrivateInfrastructureReady,
      'Private infrastructure readiness checker is required'
    );
  }

  return requiredFunction(
    checkPrivateInfrastructureReady,
    'Private infrastructure readiness checker is required'
  );
}

/**
 * Backend-only composition root for W.I.L Pay private upload grants.
 *
 * Production callers should provide infrastructureBinding + serverEnv so
 * readiness is derived directly from the approved exclusive binding and the
 * observed server-side identities. The legacy manual readiness callback is
 * disabled by default and only remains behind allowLegacyReadinessChecker=true
 * for controlled migration/testing; it must not be enabled in production.
 *
 * The database query function must point to the exclusive W.I.L Pay database.
 * Storage credentials remain encapsulated inside signPrivateUpload and are never
 * accepted or returned by this runtime. The infrastructure readiness check must
 * pass before the database, nonce consumer, or private storage signer can run.
 * A nonce is then persisted before it can be consumed or a provider PUT URL can
 * be signed.
 */
export function createWilpayUploadGrantServerRuntime({
  query,
  infrastructureBinding,
  serverEnv,
  checkPrivateInfrastructureReady,
  allowLegacyReadinessChecker = false,
  consumeGrantNonce,
  signPrivateUpload,
  auditGrantIssued,
  now = () => Date.now()
} = {}) {
  const issueGrantNonce = createWilpayUploadGrantNonceIssueAdapter({ query });
  const checkInfrastructure = createInfrastructureChecker({
    infrastructureBinding,
    serverEnv,
    checkPrivateInfrastructureReady,
    allowLegacyReadinessChecker
  });
  const consume = requiredFunction(
    consumeGrantNonce,
    'Atomic upload grant nonce consumer is required'
  );
  const signer = requiredFunction(
    signPrivateUpload,
    'Private storage upload signer is required'
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
