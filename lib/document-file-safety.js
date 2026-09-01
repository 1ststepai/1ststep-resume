import JSZip from 'jszip';

const MAX_ARTIFACT_BYTES = 350_000;
const MAX_ZIP_ENTRIES = 150;
const MAX_ZIP_UNCOMPRESSED_BYTES = 6_000_000;
const PDF_ACTIVE_CONTENT = /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|XFA|AcroForm)\b/i;
const DOCX_FORBIDDEN_PATH = /(?:^|\/)(?:vbaProject\.bin|embeddings\/|activeX\/|oleObject)/i;

function asBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  if (!buffer.length || buffer.length > MAX_ARTIFACT_BYTES) throw new Error('ARTIFACT_SIZE_UNSAFE');
  return buffer;
}

function expectedFormat(artifact = {}) {
  if (artifact.contentType === 'application/pdf' && String(artifact.filename || '').toLowerCase().endsWith('.pdf')) return 'pdf';
  if (artifact.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && String(artifact.filename || '').toLowerCase().endsWith('.docx')) return 'docx';
  throw new Error('ARTIFACT_TYPE_UNSAFE');
}

async function inspectDocx(buffer) {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('DOCX_MAGIC_INVALID');
  // Parse central-directory metadata first; CRC verification would inflate every
  // entry before the expansion limit can be enforced.
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  const entries = Object.values(zip.files);
  if (!entries.length || entries.length > MAX_ZIP_ENTRIES) throw new Error('DOCX_ENTRY_COUNT_UNSAFE');
  let uncompressed = 0;
  for (const entry of entries) {
    const name = String(entry.name || '').replace(/\\/g, '/');
    if (!name || name.startsWith('/') || name.split('/').includes('..') || DOCX_FORBIDDEN_PATH.test(name)) throw new Error('DOCX_ENTRY_UNSAFE');
    const entryBytes = Number(entry?._data?.uncompressedSize || 0);
    if (!Number.isSafeInteger(entryBytes) || entryBytes < 0) throw new Error('DOCX_ENTRY_SIZE_INVALID');
    uncompressed += entryBytes;
    if (uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) throw new Error('DOCX_EXPANSION_UNSAFE');
  }
  if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) throw new Error('DOCX_STRUCTURE_INVALID');
  const relationships = entries.filter(entry => /\.rels$/i.test(entry.name));
  for (const entry of relationships) {
    const xml = await entry.async('string');
    if (/TargetMode\s*=\s*["']External["']/i.test(xml)) throw new Error('DOCX_EXTERNAL_RELATIONSHIP');
  }
  const contentTypes = await zip.file('[Content_Types].xml').async('string');
  if (/macroEnabled|vbaProject|oleObject|activeX/i.test(contentTypes)) throw new Error('DOCX_ACTIVE_CONTENT');
  return { format: 'docx', entries: entries.length, uncompressedBytes: uncompressed };
}

function inspectPdf(buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('PDF_MAGIC_INVALID');
  const text = buffer.toString('latin1');
  if (!/%%EOF\s*$/i.test(text.slice(-1024))) throw new Error('PDF_STRUCTURE_INVALID');
  if (PDF_ACTIVE_CONTENT.test(text)) throw new Error('PDF_ACTIVE_CONTENT');
  return { format: 'pdf' };
}

export function malwareScannerConfiguration(env = process.env) {
  const production = String(env.VERCEL_ENV || '').toLowerCase() === 'production';
  const enabled = String(env.JOB_AGENT_MALWARE_SCANNER_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) return { enabled: false, required: production, reason: production ? 'SCANNER_DISABLED' : 'DEVELOPMENT_DETERMINISTIC_ONLY' };
  let url;
  try { url = new URL(String(env.JOB_AGENT_MALWARE_SCANNER_URL || '')); } catch { return { enabled: false, required: production, reason: 'SCANNER_URL_INVALID' }; }
  const allowedHost = String(env.JOB_AGENT_MALWARE_SCANNER_HOST || '').toLowerCase();
  const bearerToken = String(env.JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN || '');
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== allowedHost || !allowedHost || bearerToken.length < 24 || url.username || url.password) {
    return { enabled: false, required: production, reason: 'SCANNER_CONFIGURATION_INVALID' };
  }
  return { enabled: true, required: production, url: url.toString(), allowedHost, bearerToken };
}

async function scanWithConfiguredService(buffer, artifact, scanner, fetchImpl) {
  if (!scanner?.enabled) {
    if (scanner?.required) throw new Error('MALWARE_SCANNER_NOT_CONFIGURED');
    return { status: 'deterministic-only', engine: 'local-structure-inspector' };
  }
  const response = await fetchImpl(scanner.url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${scanner.bearerToken}`,
      'Content-Type': artifact.contentType,
      'Content-Length': String(buffer.length),
      'X-Content-SHA256': String(artifact.sha256 || ''),
    },
    body: buffer,
  });
  if (!response.ok) throw new Error('MALWARE_SCANNER_UNAVAILABLE');
  const result = await response.json();
  if (result?.clean !== true) throw new Error(result?.clean === false ? 'MALWARE_DETECTED' : 'MALWARE_SCANNER_AMBIGUOUS');
  return { status: 'clean', engine: String(result.engine || 'configured-scanner').slice(0, 60), signatureVersion: String(result.signatureVersion || '').slice(0, 80) };
}

export async function inspectDocumentArtifact({ artifact, bytes, scanner = malwareScannerConfiguration(), fetchImpl = fetch }) {
  const buffer = asBuffer(bytes);
  const format = expectedFormat(artifact);
  const structure = format === 'pdf' ? inspectPdf(buffer) : await inspectDocx(buffer);
  const malware = await scanWithConfiguredService(buffer, artifact, scanner, fetchImpl);
  return { structure, malware, bytes: buffer.length };
}
