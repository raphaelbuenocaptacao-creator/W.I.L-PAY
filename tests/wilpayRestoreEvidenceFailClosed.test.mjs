import assert from 'node:assert/strict';
import { validateWilpayRestoreEvidenceReference } from '../scripts/wilpayRestoreEvidence.mjs';

const sha256Policy = {
  evidence_ref_scheme: 'sha256'
};

assert.throws(
  () => validateWilpayRestoreEvidenceReference({ storage_observed_identity: {} }, sha256Policy),
  /restore evidence is required/i,
  'sha256 restore policy must fail closed when server-side restore evidence is absent'
);

console.log('W.I.L Pay restore evidence fail-closed checks: PASS');
