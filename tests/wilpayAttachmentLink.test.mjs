import fs from'node:fs';import assert from'node:assert/strict';
const src=fs.readFileSync(new URL('../src/components/WilpayAttachmentLink.jsx',import.meta.url),'utf8');
assert.match(src,/openWilpayAttachmentForCurrentSession/,'component must use authenticated viewer session');
assert.match(src,/e\.preventDefault\(\)/,'component must not navigate directly');
assert.match(src,/disabled=\{busy\|\|!record\}/,'component must block duplicate/empty opens');
assert.match(src,/role="alert"/,'viewer failures must be visible to the user');
assert.doesNotMatch(src,/href=\{record\.data_url\}/,'component must not expose direct legacy/private href');
console.log('PASS wilpayAttachmentLink');
