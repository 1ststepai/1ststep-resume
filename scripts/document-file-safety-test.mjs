import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { inspectDocumentArtifact, malwareScannerConfiguration } from '../lib/document-file-safety.js';

const sha = 'a'.repeat(64);
const pdfArtifact = { filename: 'resume.pdf', contentType: 'application/pdf', sha256: sha };
const safePdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const local = await inspectDocumentArtifact({ artifact: pdfArtifact, bytes: safePdf, scanner: { enabled: false, required: false } });
assert.equal(local.structure.format, 'pdf');
assert.equal(local.malware.status, 'deterministic-only');
await assert.rejects(() => inspectDocumentArtifact({ artifact: pdfArtifact, bytes: Buffer.from('%PDF-1.4\n/OpenAction 2 0 R\n%%EOF'), scanner: { enabled: false, required: false } }), /PDF_ACTIVE_CONTENT/);

const zip = new JSZip();
zip.file('[Content_Types].xml', '<Types></Types>');
zip.file('word/document.xml', '<document>safe</document>');
zip.file('_rels/.rels', '<Relationships></Relationships>');
const safeDocx = await zip.generateAsync({ type: 'nodebuffer' });
const docxArtifact = { filename: 'resume.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sha256: sha };
assert.equal((await inspectDocumentArtifact({ artifact: docxArtifact, bytes: safeDocx, scanner: { enabled: false, required: false } })).structure.format, 'docx');

const externalZip = new JSZip();
externalZip.file('[Content_Types].xml', '<Types></Types>');
externalZip.file('word/document.xml', '<document/>');
externalZip.file('word/_rels/document.xml.rels', '<Relationship TargetMode="External" Target="https://example.test"/>');
const externalDocx = await externalZip.generateAsync({ type: 'nodebuffer' });
await assert.rejects(() => inspectDocumentArtifact({ artifact: docxArtifact, bytes: externalDocx, scanner: { enabled: false, required: false } }), /DOCX_EXTERNAL_RELATIONSHIP/);

const scanner = malwareScannerConfiguration({
  VERCEL_ENV: 'production', JOB_AGENT_MALWARE_SCANNER_ENABLED: 'true',
  JOB_AGENT_MALWARE_SCANNER_URL: 'https://scanner.internal.test/v1/scan', JOB_AGENT_MALWARE_SCANNER_HOST: 'scanner.internal.test',
  JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN: 's'.repeat(32),
});
assert.equal(scanner.enabled, true);
let outbound;
const scanned = await inspectDocumentArtifact({ artifact: pdfArtifact, bytes: safePdf, scanner, fetchImpl: async (url, options) => {
  outbound = { url, options };
  return { ok: true, json: async () => ({ clean: true, engine: 'fixture', signatureVersion: '2026-08-30' }) };
} });
assert.equal(scanned.malware.status, 'clean');
assert.equal(outbound.url, scanner.url);
assert.equal(outbound.options.headers['Content-Length'], String(safePdf.length));
assert.equal(outbound.options.headers.Authorization, `Bearer ${scanner.bearerToken}`);
await assert.rejects(() => inspectDocumentArtifact({ artifact: pdfArtifact, bytes: safePdf, scanner, fetchImpl: async () => ({ ok: true, json: async () => ({ clean: false }) }) }), /MALWARE_DETECTED/);
await assert.rejects(() => inspectDocumentArtifact({ artifact: pdfArtifact, bytes: safePdf, scanner: { enabled: false, required: true } }), /MALWARE_SCANNER_NOT_CONFIGURED/);
assert.equal(malwareScannerConfiguration({ VERCEL_ENV: 'production', JOB_AGENT_MALWARE_SCANNER_ENABLED: 'true', JOB_AGENT_MALWARE_SCANNER_URL: 'http://scanner.internal.test', JOB_AGENT_MALWARE_SCANNER_HOST: 'scanner.internal.test', JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN: 's'.repeat(32) }).enabled, false);

console.log('Bounded PDF/DOCX structure inspection and fail-closed malware scanner adapter tests passed.');
