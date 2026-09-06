import assert from 'node:assert/strict';
import { isWilpayViewerSource, mimeFromViewerSource } from '../src/lib/wilpayViewerSource.js';

const legacyPdf = 'data:application/pdf;base64,JVBERi0xLjQ=';
assert.equal(mimeFromViewerSource(legacyPdf), 'application/pdf');
assert.equal(isWilpayViewerSource(legacyPdf), true);

const signedPdf = 'https://storage.example/private/object?token=redacted';
assert.equal(mimeFromViewerSource(signedPdf, 'application/pdf'), 'application/pdf');
assert.equal(isWilpayViewerSource(signedPdf, { privateFile: true }), true);
assert.equal(isWilpayViewerSource(signedPdf, { privateFile: false }), false);

assert.equal(mimeFromViewerSource('https://storage.example/file.webp?sig=redacted'), 'image/webp');
assert.equal(isWilpayViewerSource('javascript:alert(1)', { privateFile: true }), false);
assert.equal(isWilpayViewerSource('http://storage.example/file.pdf', { privateFile: true }), false);
assert.equal(isWilpayViewerSource('http://localhost/file.pdf', { privateFile: true }), true);
assert.equal(mimeFromViewerSource('data:text/html;base64,PGgxPk5vPC9oMT4='), '');
assert.equal(isWilpayViewerSource('data:text/html;base64,PGgxPk5vPC9oMT4='), false);

console.log('wilpayViewerSource tests passed');
