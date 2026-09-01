import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { buildControlledExtension } from './build-controlled-extension.mjs';

const directory = await mkdtemp(join(tmpdir(), '1ststep-extension-release-'));
try {
  const first = await buildControlledExtension({ outputDirectory: join(directory, 'first') });
  const second = await buildControlledExtension({ outputDirectory: join(directory, 'second') });
  assert.equal(first.sha256, second.sha256, 'controlled extension build must be reproducible');
  assert.equal(first.capability, 'supervised-greenhouse-no-submit');
  assert.equal(first.containsCandidateValues, false);

  const zip = await JSZip.loadAsync(await readFile(first.outputPath));
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort();
  assert.deepEqual(names, [
    'RELEASE-INTEGRITY.json', 'auth-bridge.js', 'background.js', 'content.js',
    'icons/icon-128.png', 'icons/icon-16.png', 'icons/icon-48.png', 'manifest.json',
    'popup.html', 'popup.js', 'sidepanel.html', 'sidepanel.js',
  ].sort());
  assert.equal(names.some(name => /(?:^|\/)(?:sites|utils)\//.test(name)), false);
  assert.equal(names.some(name => /screenshot|store_listing|testing_guide|hook|result/i.test(name)), false);

  const releaseManifest = JSON.parse(await zip.file('RELEASE-INTEGRITY.json').async('string'));
  assert.equal(releaseManifest.files.length, 11);
  assert.equal(releaseManifest.excludesLegacyModules, true);
  assert.equal(releaseManifest.containsCandidateValues, false);
  assert.equal(releaseManifest.capability, 'supervised-greenhouse-no-submit');
  for (const file of releaseManifest.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.bytes > 0);
  }

  for (const name of ['popup.html', 'sidepanel.html']) {
    const html = await zip.file(name).async('string');
    assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/i);
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i);
    assert.doesNotMatch(html, /<link[^>]+href=["']https?:\/\//i);
  }
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.deepEqual(manifest.host_permissions.sort(), ['https://*.greenhouse.io/*', 'https://app.1ststep.ai/*'].sort());
  assert.equal(manifest.permissions.includes('debugger'), false);
  assert.equal(manifest.permissions.includes('<all_urls>'), false);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Reproducible Greenhouse-only controlled extension release boundary tests passed.');
