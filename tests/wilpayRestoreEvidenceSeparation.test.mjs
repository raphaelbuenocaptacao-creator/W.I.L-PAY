import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const moduleUrl = new URL('../scripts/wilpayRestoreEvidence.mjs', import.meta.url);
assert.equal(
  existsSync(moduleUrl),
  true,
  'restore evidence verification must live in a dedicated module separate from resource fingerprinting'
);

const fingerprintSource = readFileSync(new URL('../scripts/wilpayResourceFingerprint.mjs', import.meta.url), 'utf8');
assert.match(
  fingerprintSource,
  /from '\.\/wilpayRestoreEvidence\.mjs'/,
  'resource fingerprinting must delegate restore evidence verification to the dedicated module'
);
assert.doesNotMatch(
  fingerprintSource,
  /function validateRestoreEvidenceReference\(/,
  'resource fingerprinting must not own restore evidence verification internals'
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
