import { issueWilpayPersistedSignedUploadGrant } from './wilpayUploadGrantIssuer.js';
import { createWilpayUploadGrantNonceIssueAdapter } from './wilpayUploadGrantNonceIssueAdapter.js';

function requiredFunction(value, message) {
  if (typeof value !== 'function') throw new Error(message);
  return value;
}

/**
 * Backend-only composition root for W.I.L Pay private upload grants.
 *
 * The database query function must point to the exclusive W.I.L Pay database.
 * Storage credentials remain encapsulated inside signPrivateUpload and are never
 * accepted or returned by this runtime. The server-scoped infrastructure
 * readiness check must pass before the database, nonce consumer, or private
 * storage signer can run. A nonce is then persisted before it can be consumed
 * or a provider PUT URL can be signed.
 */
export function createWilpayUploadGrantServerRuntime({
  query,
  checkPrivateInfrastructureReady,
  consumeGrantNonce,
  signPrivateUpload,
  auditGrantIssued,
  now = () => Date.now()
} = {}) {
  const issueGrantNonce = createWilpayUploadGrantNonceIssueAdapter({ query });
  const checkInfrastructure = requiredFunction(
    checkPrivateInfrastructureReady,
    'Private infrastructure readiness checker is required'
  );
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
