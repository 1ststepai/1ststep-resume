import { createHash } from 'node:crypto';
import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RUNNER_VERSION = '1ststep-employer-runner-v2';
const MAX_INPUT_BYTES = 128_000;
const MAX_FIELDS = 150;
const SAFE_PATH = /^\/tmp\/1ststep-employer-[a-f0-9]{32}\.(?:inspect\.)?(?:input|output)\.json$/;
const SAFE_FIELD_KEY = /^(?:name|firstName|lastName|email|phone|city|state|postalCode|linkedin|portfolio|currentEmployer|currentTitle)$/;
const SAFE_FILL_TYPE = new Set(['text', 'email', 'tel', 'url', 'textarea', 'select']);

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function clean(value, max = 200) { return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function hash(value, size = 16) { return createHash('sha256').update(String(value)).digest('hex').slice(0, size); }
function args() {
  const inputAt = process.argv.indexOf('--input');
  const outputAt = process.argv.indexOf('--output');
  if (inputAt < 0 || outputAt < 0 || inputAt + 1 >= process.argv.length || outputAt + 1 >= process.argv.length) fail('RUNNER_ARGUMENTS_INVALID');
  const input = process.argv[inputAt + 1];
  const output = process.argv[outputAt + 1];
  if (!SAFE_PATH.test(input) || !SAFE_PATH.test(output) || input === output) fail('RUNNER_PATH_INVALID');
  return { input, output };
}
async function readRequest(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_INPUT_BYTES) fail('RUNNER_INPUT_INVALID');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) fail('RUNNER_INPUT_PERMISSIONS_INVALID');
  const request = JSON.parse(await readFile(path, 'utf8'));
  if (request?.protocolVersion !== 1 || !['inspect-form-schema', 'fill-without-submit'].includes(request.operation)) fail('RUNNER_PROTOCOL_INVALID');
  if (request.constraints?.submit !== false || request.constraints?.retainValues !== false) fail('RUNNER_CONSTRAINTS_INVALID');
  if (request.operation === 'inspect-form-schema' && (request.constraints?.includeFieldValues !== false || request.constraints?.includePageText !== false || request.constraints?.clickControls !== false)) fail('RUNNER_CONSTRAINTS_INVALID');
  if (request.operation === 'fill-without-submit' && (request.constraints?.clickConsequentialControls !== false || !Array.isArray(request.fields) || request.fields.length > 120
    || request.fields.some(field => typeof field?.value !== 'string' || !field.value || field.value.length > 2_000))) fail('RUNNER_FIELD_SCOPE_INVALID');
  return request;
}
async function attestation(request) {
  const bytes = await readFile(fileURLToPath(import.meta.url));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (request?.runner?.version !== RUNNER_VERSION || String(request?.runner?.sha256 || '').toLowerCase() !== sha256) fail('RUNNER_ATTESTATION_FAILED');
  return sha256;
}
function verifiedTarget(target) {
  const url = new URL(String(target?.pageUrl || ''));
  const hostname = String(target?.hostname || '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLowerCase() !== hostname || url.port && url.port !== '443') fail('RUNNER_TARGET_INVALID');
  return { url: url.href, hostname };
}
function fieldKey(text) {
  const normalized = clean(text, 500).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (/\bfirst name\b|\bgiven name\b/.test(normalized)) return 'firstName';
  if (/\blast name\b|\bsurname\b|\bfamily name\b/.test(normalized)) return 'lastName';
  if (/\bfull name\b|^name$/.test(normalized)) return 'name';
  if (/\be ?mail\b/.test(normalized)) return 'email';
  if (/\bphone\b|\bmobile\b|\btelephone\b/.test(normalized)) return 'phone';
  if (/\bpostal\b|\bzip\b/.test(normalized)) return 'postalCode';
  if (/\blinkedin\b/.test(normalized)) return 'linkedin';
  if (/\bportfolio\b|\bpersonal website\b/.test(normalized)) return 'portfolio';
  if (/\bcurrent employer\b|\bcompany name\b/.test(normalized)) return 'currentEmployer';
  if (/\bcurrent title\b|\bjob title\b/.test(normalized)) return 'currentTitle';
  if (/\bcity\b/.test(normalized)) return 'city';
  if (/\bstate\b|\bprovince\b/.test(normalized)) return 'state';
  return `unrecognized_${hash(normalized || 'field')}`;
}
async function inspect(page) {
  return page.locator('input:not([type="hidden"]), select, textarea').evaluateAll((elements) => elements.slice(0, 150).map((element, index) => {
    const id = element.id || '';
    const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || '' : '';
    const wrapping = element.closest('label')?.textContent || '';
    const aria = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')?.split(/\s+/).map(ref => document.getElementById(ref)?.textContent || '').join(' ') || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const name = element.getAttribute('name') || '';
    const autocomplete = element.getAttribute('autocomplete') || '';
    const tag = element.tagName.toLowerCase();
    const inputType = tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : (element.getAttribute('type') || 'text').toLowerCase();
    return { index, id, name, autocomplete, label: explicit || aria || wrapping || placeholder || name || `Field ${index + 1}`, inputType, required: element.required === true || element.getAttribute('aria-required') === 'true' };
  }));
}
function descriptors(raw) {
  return raw.slice(0, MAX_FIELDS).map(item => {
    const semantic = [item.autocomplete, item.name, item.id, item.label].join(' ');
    const key = fieldKey(semantic);
    const stable = `${item.id}|${item.name}|${item.inputType}|${clean(item.label)}|${item.index}`;
    return { fieldRef: `field_${hash(stable, 24)}`, fieldKey: key, label: clean(item.label) || `Field ${item.index + 1}`, inputType: clean(item.inputType, 40).toLowerCase(), required: item.required === true, index: item.index };
  });
}
function schemaHash(fields) {
  const schema = fields.map(({ fieldRef, fieldKey, inputType, required }) => ({ fieldRef, fieldKey, inputType, required }));
  return createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}

async function freshField(page, requested) {
  const current = descriptors(await inspect(page));
  const field = current.find(item => item.fieldRef === requested.fieldRef && item.fieldKey === requested.fieldKey);
  if (!field || !SAFE_FIELD_KEY.test(field.fieldKey) || !SAFE_FILL_TYPE.has(field.inputType)) fail('RUNNER_FIELD_SCOPE_INVALID');
  return { field, locator: page.locator('input:not([type="hidden"]), select, textarea').nth(field.index) };
}

async function fillFreshField(page, requested) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { field, locator } = await freshField(page, requested);
    try {
      if (field.inputType === 'select') await locator.selectOption({ label: String(requested.value) }).catch(() => locator.selectOption(String(requested.value)));
      else await locator.fill(String(requested.value));
      return field.fieldKey;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  fail('RUNNER_DYNAMIC_FIELD_RETRY_EXHAUSTED');
}
async function main() {
  const paths = args();
  const request = await readRequest(paths.input);
  const runnerSha256 = await attestation(request);
  const target = verifiedTarget(request.target);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      try {
        const request = route.request();
        const sameHost = new URL(request.url()).hostname.toLowerCase() === target.hostname;
        const readOnlyMethod = ['GET', 'HEAD'].includes(request.method().toUpperCase());
        return sameHost && readOnlyMethod ? route.continue() : route.abort('blockedbyclient');
      }
      catch { return route.abort('blockedbyclient'); }
    });
    const page = await context.newPage();
    if (typeof page.routeWebSocket === 'function') await page.routeWebSocket('**/*', socket => socket.close());
    await page.addInitScript(() => {
      const block = () => undefined;
      Object.defineProperty(HTMLFormElement.prototype, 'submit', { value: block, configurable: false, writable: false });
      Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', { value: block, configurable: false, writable: false });
      document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
    });
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (new URL(page.url()).hostname.toLowerCase() !== target.hostname) fail('RUNNER_REDIRECT_HOST_MISMATCH');
    const fields = descriptors(await inspect(page));
    let result;
    if (request.operation === 'inspect-form-schema') {
      result = { protocolVersion: 1, operation: request.operation, runnerVersion: RUNNER_VERSION, runnerSha256, pageUrl: page.url(), fields: fields.map(({ index: _index, ...field }) => field), submitted: false, clickedControls: false, valuesRetained: false };
    } else {
      if (schemaHash(fields) !== request.fieldSchemaHash) fail('RUNNER_SCHEMA_MISMATCH');
      const byRef = new Map(fields.map(field => [field.fieldRef, field]));
      const filled = [];
      for (const requested of request.fields || []) {
        const field = byRef.get(requested.fieldRef);
        if (!field || field.fieldKey !== requested.fieldKey || !SAFE_FIELD_KEY.test(field.fieldKey) || !SAFE_FILL_TYPE.has(field.inputType)) fail('RUNNER_FIELD_SCOPE_INVALID');
        filled.push(await fillFreshField(page, requested));
      }
      result = { protocolVersion: 1, operation: request.operation, runnerVersion: RUNNER_VERSION, runnerSha256, pageUrl: page.url(), fieldSchemaHash: request.fieldSchemaHash, stagedFieldKeys: filled.sort(), submitted: false, clickedSubmit: false, valuesRetained: false };
    }
    await writeFile(paths.output, `${JSON.stringify(result)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(paths.output, 0o600);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch(error => {
  process.stderr.write(`${String(error?.code || error?.message || 'RUNNER_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 120)}\n`);
  process.exitCode = 1;
});
