import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  classifyWilpayRestoreEvidence,
  validateWilpayRestoreEvidenceReference
} from '../scripts/wilpayRestoreEvidence.mjs';

function digest(manifest) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(manifest), 'utf8')
    .digest('hex')}`;
}

const restorePolicy = { evidence_ref_scheme: 'sha256' };
const manifest = {
  schema_version: 1,
  resource_id: 'storage-wilpay-exclusive',
  resource_fingerprint: 'fingerprint-wilpay-exclusive',
  verified_at: '2026-09-13',
  result: 'PASS',
  execution_id: 'restore-drill-2026-09-13'
};
const isolation = {
  storage_observed_identity: {
    restore_evidence: {
      ...manifest,
      evidence_ref: digest(manifest)
    }
  }
};

assert.equal(
  classifyWilpayRestoreEvidence(isolation, restorePolicy),
  'unverified',
  'restore evidence must reject parseable but non-canonical timestamps as unverified'
);
assert.throws(
  () => validateWilpayRestoreEvidenceReference(isolation, restorePolicy),
  /canonical UTC ISO timestamp/,
  'restore evidence validation must fail closed on non-canonical timestamps'
);

console.log('W.I.L Pay restore evidence timestamp checks: PASS');
