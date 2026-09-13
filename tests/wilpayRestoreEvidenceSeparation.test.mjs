import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const moduleUrl = new URL('../scripts/wilpayRestoreEvidence.mjs', import.meta.url);
assert.equal(
  existsSync(moduleUrl),
  true,
  'restore evidence verification must live in a dedicated module separate from resource fingerprinting'
);

const fingerprintSource = readFileSync(new URL('../scripts/wilpayResourceFingerprint.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(
  fingerprintSource,
  /wilpayRestoreEvidence\.mjs/,
  'resource fingerprinting must remain independent from operational restore evidence verification'
);
assert.doesNotMatch(
  fingerprintSource,
  /validateWilpayRestoreEvidenceReference/,
  'resource fingerprinting must not validate restore evidence'
);

const readinessSource = readFileSync(new URL('../scripts/wilpayInfrastructureReadinessGate.mjs', import.meta.url), 'utf8');
assert.match(
  readinessSource,
  /from '\.\/wilpayRestoreEvidence\.mjs'/,
  'readiness must consume the dedicated restore evidence verifier directly'
);
assert.match(
  readinessSource,
  /validateWilpayRestoreEvidenceReference\(isolation, isolation\.storage_restore_policy_lock\)/,
  'readiness must cryptographically validate restore evidence before declaring Storage ready'
);

const { validateWilpayRestoreEvidenceReference } = await import('../scripts/wilpayRestoreEvidence.mjs');

const manifest = {
  schema_version: 1,
  resource_id: 'storage-wilpay-exclusive',
  resource_fingerprint: 'a'.repeat(64),
  verified_at: '2026-09-13T08:00:00.000Z',
  result: 'PASS',
  execution_id: 'restore-drill-001'
};

assert.throws(
  () => validateWilpayRestoreEvidenceReference(
    { storage_observed_identity: { restore_evidence: { ...manifest, evidence_ref: `sha256:${'0'.repeat(64)}` } } },
    { evidence_ref_scheme: 'sha256' }
  ),
  /digest does not match/,
  'dedicated verifier must reject evidence whose digest does not match the canonical manifest'
);

console.log('W.I.L Pay restore evidence separation checks: PASS');
