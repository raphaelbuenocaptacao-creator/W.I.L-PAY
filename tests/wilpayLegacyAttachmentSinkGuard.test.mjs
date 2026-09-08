import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const srcRoot = new URL('../src/', import.meta.url);
const appV3 = readFileSync(new URL('../src/AppV3.jsx', import.meta.url), 'utf8');

const directAttachmentInsert = /neon\.from\('wilpay_loans'\)\.insert\(\{record_type:'ATTACHMENT'[^}]*data_url:/g;
const appV3LegacySinks = [...appV3.matchAll(directAttachmentInsert)];

// Migration baseline: AppV3 still has exactly two legacy binary sinks today:
// 1) client documents/selfies/guarantees, 2) ADM payout receipt.
// This guard prevents any new direct base64/database upload path from being added.
assert.equal(
  appV3LegacySinks.length,
  2,
  `Legacy attachment sink count changed (${appV3LegacySinks.length}). New binary/base64 persistence is forbidden; migrate through wilpayAppAttachmentAdapter instead.`
);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const srcPath = srcRoot.pathname;
const offenders = [];
for (const path of walk(srcPath)) {
  if (!/\.(?:js|jsx|mjs|ts|tsx)$/.test(path)) continue;
  const rel = relative(srcPath, path).replaceAll('\\', '/');
  const source = readFileSync(path, 'utf8');
  const count = [...source.matchAll(directAttachmentInsert)].length;
  if (count && rel !== 'AppV3.jsx') offenders.push(`${rel}:${count}`);
}

assert.deepEqual(
  offenders,
  [],
  `Direct ATTACHMENT data_url persistence found outside the migration baseline: ${offenders.join(', ')}`
);

const adapter = readFileSync(new URL('../src/lib/wilpayAppAttachmentAdapter.js', import.meta.url), 'utf8');
assert.match(adapter, /persistWilpayAttachmentForRuntime/);
assert.match(adapter, /storage_mode:\s*'private'/);
assert.match(adapter, /getWilpayAureonAccessToken/);

console.log('PASS wilpayLegacyAttachmentSinkGuard');
