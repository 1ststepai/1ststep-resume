import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { CONTROLLED_GREENHOUSE_EXTENSION_SHA256, CONTROLLED_GREENHOUSE_EXTENSION_VERSION } from '../lib/controlled-extension-release.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, '1ststep-extension');
const RELEASE_FILES = Object.freeze([
  'manifest.json',
  'background.js',
  'content.js',
  'auth-bridge.js',
  'popup.html',
  'popup.js',
  'sidepanel.html',
  'sidepanel.js',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
]);
const FIXED_ARCHIVE_DATE = new Date('2026-01-01T00:00:00.000Z');
const ALLOWED_HOST_PERMISSIONS = Object.freeze([
  'https://*.greenhouse.io/*',
  'https://app.1ststep.ai/*',
]);

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function sorted(value) { return [...value].sort((left, right) => left.localeCompare(right)); }
function canonicalReleaseValue(name, value) {
  if (!/\.(?:html|js|json)$/i.test(name)) return value;
  return Buffer.from(value.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

function validateManifest(manifest) {
  if (manifest.manifest_version !== 3) throw new Error('Controlled extension must use Manifest V3.');
  if (!/^1\.\d+\.\d+$/.test(String(manifest.version || ''))) throw new Error('Controlled extension version is invalid.');
  if (JSON.stringify(sorted(manifest.host_permissions || [])) !== JSON.stringify(sorted(ALLOWED_HOST_PERMISSIONS))) {
    throw new Error('Controlled extension host permissions changed outside the reviewed Greenhouse and 1stStep boundary.');
  }
  const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  if (contentScripts.length !== 2) throw new Error('Controlled extension content-script boundary changed.');
  const employerScript = contentScripts.find(entry => (entry.js || []).includes('content.js'));
  const bridgeScript = contentScripts.find(entry => (entry.js || []).includes('auth-bridge.js'));
  if (!employerScript || JSON.stringify(employerScript.matches) !== JSON.stringify(['https://*.greenhouse.io/*'])) throw new Error('Employer content script must remain Greenhouse-only.');
  if (!bridgeScript || JSON.stringify(bridgeScript.matches) !== JSON.stringify(['https://app.1ststep.ai/*'])) throw new Error('Authentication bridge must remain 1stStep-only.');
  if ((manifest.permissions || []).some(permission => ['debugger', 'cookies', 'webRequest', 'webRequestBlocking', '<all_urls>'].includes(permission))) {
    throw new Error('Controlled extension requests a forbidden broad permission.');
  }
}

function validateReleaseSource(name, value) {
  if (/\.(?:html|js|json)$/i.test(name)) {
    const text = value.toString('utf8');
    if (/https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/i.test(text)) throw new Error(`${name} contains remote hosted presentation code.`);
    if (/<script[^>]+src=["']https?:\/\//i.test(text) || /<link[^>]+href=["']https?:\/\//i.test(text)) throw new Error(`${name} loads remote hosted code.`);
    if (/\b(?:sites|utils)\//.test(text)) throw new Error(`${name} references a legacy extension module.`);
  }
}

export async function buildControlledExtension({ outputDirectory = join(ROOT, 'dist') } = {}) {
  const entries = [];
  for (const name of RELEASE_FILES) {
    const value = canonicalReleaseValue(name, await readFile(join(SOURCE, ...name.split('/'))));
    validateReleaseSource(name, value);
    entries.push({ name, value, sha256: sha256(value), bytes: value.length });
  }
  validateManifest(JSON.parse(entries.find(entry => entry.name === 'manifest.json').value.toString('utf8')));
  const manifest = JSON.parse(entries.find(entry => entry.name === 'manifest.json').value.toString('utf8'));
  if (manifest.version !== CONTROLLED_GREENHOUSE_EXTENSION_VERSION) throw new Error('Controlled extension version does not match the reviewed release contract.');
  const integrity = {
    schemaVersion: 1,
    product: '1ststep-job-agent-controlled-greenhouse-extension',
    version: manifest.version,
    capability: 'supervised-greenhouse-no-submit',
    files: entries.map(({ name, sha256: digest, bytes }) => ({ name, sha256: digest, bytes })),
    excludesLegacyModules: true,
    containsCandidateValues: false,
  };
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.name, entry.value, { date: FIXED_ARCHIVE_DATE, createFolders: false });
  zip.file('RELEASE-INTEGRITY.json', `${JSON.stringify(integrity, null, 2)}\n`, { date: FIXED_ARCHIVE_DATE });
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' });
  const archiveDigest = sha256(archive);
  if (archiveDigest !== CONTROLLED_GREENHOUSE_EXTENSION_SHA256) throw new Error(`Controlled extension release artifact changed (${archiveDigest}); review it and update the pinned digest intentionally.`);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `1ststep-job-agent-greenhouse-v${manifest.version}.zip`);
  await writeFile(outputPath, archive, { mode: 0o600 });
  return {
    outputPath,
    version: manifest.version,
    sha256: archiveDigest,
    bytes: archive.length,
    fileCount: entries.length + 1,
    capability: integrity.capability,
    containsCandidateValues: false,
  };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const result = await buildControlledExtension();
  console.log(JSON.stringify(result, null, 2));
}
