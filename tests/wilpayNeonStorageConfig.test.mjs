import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../neon.ts', import.meta.url), 'utf8');

assert.match(config, /defineConfig/);
assert.match(config, /"wilpay-private-documents"\s*:\s*\{\s*\}/);
assert.doesNotMatch(config, /public_read/);
assert.doesNotMatch(config, /captapro|gamifica/i);
assert.doesNotMatch(config, /(secret|service_role|token|password)\s*[:=]/i);

console.log('W.I.L Pay Neon storage config isolation: PASS');
