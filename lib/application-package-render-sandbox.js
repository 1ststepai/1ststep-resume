import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { reserveConfiguredJobAgentSpend, settleConfiguredJobAgentSpend } from './job-agent-spend-ledger.js';

const SNAPSHOT_ID = /^snap_[A-Za-z0-9_-]{8,160}$/;
const ARTIFACT_KEY = /^(?:resume|cover)_(?:docx|pdf)$/;
const MAX_INPUT_BYTES = 350_000;
const RENDER_SCRIPT = String.raw`import glob, hashlib, json, os, subprocess, sys
from PIL import Image

def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or 'render command failed')[:500])
    return result.stdout

def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(65536), b''):
            digest.update(chunk)
    return digest.hexdigest()

def page_metrics(path):
    with Image.open(path) as image:
        gray = image.convert('L')
        mask = gray.point(lambda value: 255 if value < 245 else 0)
        bbox = mask.getbbox()
        width, height = gray.size
        histogram = mask.histogram()
        ink = histogram[255]
        edge = 12
        edge_ink = 0
        if bbox:
            pixels = mask.load()
            for y in range(height):
                for x in range(width):
                    if (x < edge or y < edge or x >= width - edge or y >= height - edge) and pixels[x, y] == 255:
                        edge_ink += 1
        return {
            'width': width, 'height': height, 'blank': bbox is None,
            'contentBounds': list(bbox) if bbox else None,
            'inkRatio': round(ink / max(1, width * height), 6),
            'edgeInkPixels': edge_ink,
        }

manifest_path = sys.argv[1]
with open(manifest_path, 'r', encoding='utf-8') as stream:
    manifest = json.load(stream)
work = os.path.dirname(manifest_path)
reports = []
issues = []
for artifact in manifest['artifacts']:
    key = artifact['key']
    source = os.path.join(work, artifact['path'])
    if sha(source) != artifact['sha256']:
        raise RuntimeError('input integrity mismatch')
    render_dir = os.path.join(work, 'render-' + key)
    os.makedirs(render_dir, exist_ok=True)
    if key.endswith('_docx'):
        profile = 'file:///tmp/lo-' + key
        run(['soffice', '--headless', '-env:UserInstallation=' + profile, '--convert-to', 'pdf', '--outdir', render_dir, source])
        pdfs = glob.glob(os.path.join(render_dir, '*.pdf'))
        if len(pdfs) != 1:
            raise RuntimeError('DOCX conversion did not produce one PDF')
        pdf_path = pdfs[0]
    else:
        pdf_path = source
    text_path = os.path.join(render_dir, 'text.txt')
    run(['pdftotext', '-layout', pdf_path, text_path])
    prefix = os.path.join(render_dir, 'page')
    run(['pdftoppm', '-png', '-r', '144', pdf_path, prefix])
    page_paths = sorted(glob.glob(prefix + '-*.png'))
    pages = [page_metrics(path) for path in page_paths]
    expected = int(artifact.get('pageCount') or 0)
    artifact_issues = []
    if not pages or (expected and len(pages) != expected): artifact_issues.append('PAGE_COUNT_MISMATCH')
    if any(page['blank'] for page in pages): artifact_issues.append('BLANK_PAGE')
    if any(page['edgeInkPixels'] > 0 for page in pages): artifact_issues.append('EDGE_CLIPPING_RISK')
    if any(page['inkRatio'] < 0.002 or page['inkRatio'] > 0.38 for page in pages): artifact_issues.append('ABNORMAL_PAGE_DENSITY')
    with open(text_path, 'rb') as stream:
        extracted = stream.read()
    if len(extracted.strip()) < 80: artifact_issues.append('EXTRACTED_TEXT_TOO_SHORT')
    reports.append({
        'key': key, 'inputSha256': artifact['sha256'], 'renderedPdfSha256': sha(pdf_path),
        'extractedTextSha256': hashlib.sha256(extracted).hexdigest(), 'pageCount': len(pages),
        'pages': pages, 'issues': artifact_issues,
    })
    issues.extend(key + ':' + issue for issue in artifact_issues)
with open(os.path.join(work, 'report.json'), 'w', encoding='utf-8') as stream:
    json.dump({'version': 'sandbox-render-v1', 'complete': len(issues) == 0, 'issues': issues, 'artifacts': reports}, stream)
`;

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

function validateInputs(artifacts) {
  if (!Array.isArray(artifacts) || ![2, 4].includes(artifacts.length)) throw new Error('RENDER_ARTIFACT_SET');
  const keys = new Set();
  return artifacts.map(artifact => {
    const key = String(artifact?.key || '');
    if (!ARTIFACT_KEY.test(key) || keys.has(key)) throw new Error('RENDER_ARTIFACT_KEY');
    keys.add(key);
    const content = Buffer.from(String(artifact.contentBase64 || ''), 'base64');
    if (!content.length || content.length > MAX_INPUT_BYTES || content.length !== Number(artifact.bytes)) throw new Error('RENDER_ARTIFACT_SIZE');
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (!safeEqualHex(sha256, artifact.sha256)) throw new Error('RENDER_ARTIFACT_INTEGRITY');
    return { key, content, sha256, pageCount: Number(artifact.pageCount) || 0, path: `${key}.${key.endsWith('pdf') ? 'pdf' : 'docx'}` };
  });
}

export function documentRenderSandboxConfiguration(env = process.env) {
  const enabled = String(env.DOCUMENT_RENDER_SANDBOX_ENABLED || '').toLowerCase() === 'true';
  const snapshotId = String(env.DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID || '').trim();
  if (!enabled) return { enabled: false, reason: 'disabled' };
  if (!SNAPSHOT_ID.test(snapshotId)) return { enabled: false, reason: 'snapshot-not-configured' };
  return { enabled: true, snapshotId };
}

function validateReport(report, inputs) {
  if (report?.version !== 'sandbox-render-v1' || !Array.isArray(report.artifacts)) throw new Error('RENDER_REPORT_SCHEMA');
  if (report.artifacts.length !== inputs.length) throw new Error('RENDER_REPORT_ARTIFACT_COUNT');
  for (const input of inputs) {
    const artifact = report.artifacts.find(item => item.key === input.key);
    if (!artifact || !safeEqualHex(artifact.inputSha256, input.sha256)) throw new Error('RENDER_REPORT_INTEGRITY');
    if (!Array.isArray(artifact.pages) || artifact.pages.length !== Number(artifact.pageCount)) throw new Error('RENDER_REPORT_PAGE_COUNT');
    for (const page of artifact.pages) {
      if (Number(page.width) < 500 || Number(page.height) < 700 || page.blank !== false || Number(page.edgeInkPixels) !== 0) throw new Error('RENDER_REPORT_PAGE_BOUNDS');
      if (!Array.isArray(page.contentBounds) || page.contentBounds.length !== 4) throw new Error('RENDER_REPORT_PAGE_BOUNDS');
    }
  }
  return {
    ...report, complete: report.complete === true && !(report.issues || []).length,
    visualPageInspection: report.complete === true && !(report.issues || []).length,
    renderedAt: new Date().toISOString(), renderer: 'vercel-sandbox-deny-all',
  };
}

export async function inspectApplicationPackageArtifacts({ artifacts, env = process.env, redis, SandboxImpl, now = new Date() } = {}) {
  const config = documentRenderSandboxConfiguration(env);
  if (!config.enabled) return { status: 'not-configured', reason: config.reason, visualPageInspection: false };
  const inputs = validateInputs(artifacts);
  // The ledger clock is injectable so a run's document-render charge is attributed to
  // the same UTC day as the rest of that run, and so spend accounting is testable.
  const spend = await reserveConfiguredJobAgentSpend({ category: 'document-render', operationId: `render:${randomUUID()}`, env, redis, now });
  if (!spend.ok) throw new Error(spend.code || 'MONETARY_SPEND_CONTROL_NOT_CONFIGURED');
  let sandbox;
  let providerCallStarted = false;
  try {
    const Sandbox = SandboxImpl || (await import('@vercel/sandbox')).Sandbox;
    providerCallStarted = true;
    sandbox = await Sandbox.create({
      source: { type: 'snapshot', snapshotId: config.snapshotId }, timeout: 120_000, networkPolicy: 'deny-all',
    });
    const work = '/vercel/sandbox/package-render';
    const manifest = { version: 'sandbox-render-v1', artifacts: inputs.map(({ content: _content, ...input }) => input) };
    await sandbox.writeFiles([
      { path: `${work}/inspect.py`, content: Buffer.from(RENDER_SCRIPT), mode: 0o700 },
      { path: `${work}/manifest.json`, content: Buffer.from(JSON.stringify(manifest)), mode: 0o600 },
      ...inputs.map(input => ({ path: `${work}/${input.path}`, content: input.content, mode: 0o600 })),
    ]);
    const command = await sandbox.runCommand('python3', [`${work}/inspect.py`, `${work}/manifest.json`]);
    if (Number(command.exitCode) !== 0) {
      const stderr = String(await command.stderr()).slice(0, 500);
      throw new Error(`RENDER_COMMAND_FAILED:${stderr.replace(/[\r\n]+/g, ' ')}`);
    }
    const reportBuffer = await sandbox.readFileToBuffer({ path: `${work}/report.json` });
    if (!reportBuffer || reportBuffer.length > 100_000) throw new Error('RENDER_REPORT_MISSING');
    return { status: 'verified', ...validateReport(JSON.parse(reportBuffer.toString('utf8')), inputs) };
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
    await settleConfiguredJobAgentSpend({ control: spend.control, providerCallStarted }).catch(error => {
      console.error(JSON.stringify({ type: 'monetary-spend-settlement-error', category: 'document-render', name: error?.name || 'unknown' }));
    });
  }
}
