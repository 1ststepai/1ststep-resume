import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { documentRenderSandboxConfiguration, inspectApplicationPackageArtifacts } from '../lib/application-package-render-sandbox.js';

const bytes = Buffer.from('%PDF-1.4 synthetic private fixture');
const artifact = key => ({ key, contentBase64: bytes.toString('base64'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), pageCount: 1 });
assert.deepEqual(documentRenderSandboxConfiguration({}), { enabled: false, reason: 'disabled' });
assert.deepEqual(documentRenderSandboxConfiguration({ DOCUMENT_RENDER_SANDBOX_ENABLED: 'true' }), { enabled: false, reason: 'snapshot-not-configured' });
assert.equal((await inspectApplicationPackageArtifacts({ artifacts: [artifact('resume_docx'), artifact('resume_pdf')], env: {} })).status, 'not-configured');

let stopped = false;
let createOptions;
const report = {
  version: 'sandbox-render-v1', complete: true, issues: [], artifacts: ['resume_docx', 'resume_pdf'].map(key => ({
    key, inputSha256: artifact(key).sha256, renderedPdfSha256: 'c'.repeat(64), extractedTextSha256: 'd'.repeat(64), pageCount: 1,
    pages: [{ width: 1224, height: 1584, blank: false, contentBounds: [90, 90, 1100, 1400], inkRatio: 0.08, edgeInkPixels: 0 }], issues: [],
  })),
};
class FakeSandbox {
  static async create(options) {
    createOptions = options;
    return {
      async writeFiles(files) { assert.equal(files.length, 4); assert.ok(files.every(file => file.mode)); },
      async runCommand(command, args) { assert.equal(command, 'python3'); assert.equal(args.length, 2); return { exitCode: 0, stderr: async () => '' }; },
      async readFileToBuffer() { return Buffer.from(JSON.stringify(report)); },
      async stop() { stopped = true; },
    };
  }
}
const verified = await inspectApplicationPackageArtifacts({
  artifacts: [artifact('resume_docx'), artifact('resume_pdf')],
  env: { DOCUMENT_RENDER_SANDBOX_ENABLED: 'true', DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID: 'snap_synthetic_fixture' }, SandboxImpl: FakeSandbox,
});
assert.equal(createOptions.networkPolicy, 'deny-all');
assert.equal(verified.status, 'verified');
assert.equal(verified.visualPageInspection, true);
assert.equal(stopped, true);
await assert.rejects(() => inspectApplicationPackageArtifacts({ artifacts: [{ ...artifact('resume_pdf'), sha256: '0'.repeat(64) }], env: { DOCUMENT_RENDER_SANDBOX_ENABLED: 'true', DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID: 'snap_synthetic_fixture' }, SandboxImpl: FakeSandbox }), /RENDER_ARTIFACT_SET|INTEGRITY/);
console.log('Isolated document-render configuration, deny-all networking, integrity, report validation, and teardown tests passed.');
