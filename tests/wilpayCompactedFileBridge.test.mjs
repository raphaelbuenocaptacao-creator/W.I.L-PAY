import assert from 'node:assert/strict';

const { wilpayFileFromCompactedInput } = await import('../src/lib/wilpayPrivateUploadFlow.js');

const encoded = ['AQID', 'BA=='].join('');
const compacted = {
  name: 'document.jpg',
  type: 'image/jpeg',
  size: 4,
  data_url: `data:image/jpeg;base64,${encoded}`
};

const bridged = wilpayFileFromCompactedInput(compacted);
assert.equal(bridged.name, 'document.jpg');
assert.equal(bridged.type, 'image/jpeg');
assert.equal(bridged.size, 4);
assert.deepEqual([...new Uint8Array(await bridged.arrayBuffer())], [1, 2, 3, 4]);

assert.throws(
  () => wilpayFileFromCompactedInput({ ...compacted, type: 'image/png' }),
  /MIME type mismatch/
);
assert.throws(
  () => wilpayFileFromCompactedInput({ ...compacted, size: 5 }),
  /size mismatch/
);

console.log('wilpayCompactedFileBridge: PASS');
