import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/documentViewerFix.js', import.meta.url), 'utf8');

assert.match(source, /resolveWilpayAttachmentForCurrentSession/);
assert.match(source, /wilPrivateReceipt/);
assert.match(source, /\.eq\('auth_uid', user\.id\)/);
assert.match(source, /row\.record_type === 'ATTACHMENT'/);
assert.match(source, /row\.doc_type === 'COMPROVANTE_PAGAMENTO'/);
assert.match(source, /openViewer\(resolved\.source/);
assert.doesNotMatch(source, /service_role|SERVICE_ROLE|secret[_-]?key/i);

console.log('wilpay private receipt viewer bridge: PASS');
