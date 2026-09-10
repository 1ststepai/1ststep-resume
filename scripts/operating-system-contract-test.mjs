import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const documents = Object.fromEntries(await Promise.all([
  'OPERATING_SYSTEM.md', 'ROADMAP.md', 'ARCHITECTURE.md', 'CHANGELOG.md',
].map(async name => [name, await readFile(new URL(`../docs/${name}`, import.meta.url), 'utf8')])));

for (const section of [
  'Mission and product truth', 'Product boundaries and ownership', 'Priority system',
  'Definition of done', 'Security and privacy rules', 'Truth-safe AI rules',
  'Chrome extension standards', 'Agent execution loop',
]) assert.match(documents['OPERATING_SYSTEM.md'], new RegExp(`^## ${section}$`, 'm'));

for (const section of ['Now', 'Next', 'Later', 'Explicit non-goals']) {
  assert.match(documents['ROADMAP.md'], new RegExp(`^## ${section}$`, 'm'));
}
assert.match(documents['ROADMAP.md'], /^## Progress log .*append only$/m);
assert.match(documents['ARCHITECTURE.md'], /1ststepai\/1ststep-resume.*source of truth/);
assert.match(documents['OPERATING_SYSTEM.md'], /Only authoritative employer receipt evidence may produce `Submitted`/);
assert.match(documents['OPERATING_SYSTEM.md'], /Production services.*require explicit owner approval/);

console.log('1stStep ecosystem operating-system contract is present and release-safe.');
