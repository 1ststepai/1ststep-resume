import { randomUUID } from 'node:crypto';
import { PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

const RUNNER_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_PATH = /^\/opt\/1ststep\/[A-Za-z0-9._/-]{3,180}$/;
const SAFE_FIELD = /^(?:name|firstName|lastName|email|phone|city|state|postalCode|linkedin|portfolio|currentEmployer|currentTitle)$/;
const SECRET_TEXT = PROHIBITED_SECRET_VALUE;
const MAX_VALUE_LENGTH = 2_000;
const MAX_RESULT_BYTES = 64_000;
const SAFE_REF = /^[A-Za-z0-9:_-]{3,160}$/;
const SAFE_INPUT_TYPE = /^(?:text|email|tel|url|password|number|select|radio|checkbox|textarea|file|captcha|date|hidden)$/;
const FORBIDDEN_INSPECTION_KEY = /^(?:value|values|answer|defaultValue|currentValue|secretValue|checked|selected|html|pageText|cookie|cookies|storage|token)$/i;

function text(value) { return String(value ?? '').trim(); }

export function employerBrowserRunnerArtifactConfiguration(env = process.env) {
  const runnerVersion = text(env.EMPLOYER_BROWSER_WORKER_RUNNER_VERSION);
  const runnerSha256 = text(env.EMPLOYER_BROWSER_WORKER_RUNNER_SHA256).toLowerCase();
  const runnerPath = text(env.EMPLOYER_BROWSER_WORKER_RUNNER_PATH || '/opt/1ststep/employer-browser-runner.mjs');
  if (!RUNNER_VERSION.test(runnerVersion)) return { ready: false, reason: 'runner-version-not-configured' };
  if (!SHA256.test(runnerSha256)) return { ready: false, reason: 'runner-digest-not-configured' };
  if (!SAFE_PATH.test(runnerPath) || runnerPath.includes('..')) return { ready: false, reason: 'runner-path-invalid' };
  return { ready: true, runnerVersion, runnerSha256, runnerPath };
}

export function materializeApprovedEmployerFields(plan, vault) {
  if (plan?.status !== 'ready-to-fill' || !Array.isArray(plan.stagedFields)) throw new Error('EMPLOYER_WORKER_PLAN_NOT_READY');
  if (vault?.consent?.status !== 'granted' || !vault.consent.scopes?.includes('confirmed-facts')) throw new Error('EMPLOYER_VAULT_CONSENT_REQUIRED');
  const activeFacts = new Map((vault.facts || []).filter(fact => fact?.status === 'active').map(fact => [fact.id, fact]));
  return plan.stagedFields.map(field => {
    if (!SAFE_FIELD.test(text(field.fieldKey))) throw new Error('EMPLOYER_FIELD_NOT_ORDINARY');
    const fact = activeFacts.get(field.factId);
    const version = fact?.versions?.find(item => Number(item.version) === Number(fact.currentVersion));
    const value = text(version?.value);
    if (!fact || fact.fieldKey !== field.fieldKey || !version || version.revokedAt || version.autoReuse !== true
      || !['user-confirmed', 'document-verified'].includes(version.verificationState) || Number(version.confidence) < 0.92) {
      throw new Error('EMPLOYER_VAULT_FACT_NO_LONGER_REUSABLE');
    }
    if (!value || value.length > MAX_VALUE_LENGTH || SECRET_TEXT.test(value)) throw new Error('EMPLOYER_VAULT_VALUE_INVALID');
    return { fieldRef: field.fieldRef, fieldKey: field.fieldKey, value };
  });
}

export function createEmployerBrowserRunnerRequest(plan, materializedFields, artifact) {
  if (!artifact?.ready) throw new Error('EMPLOYER_BROWSER_RUNNER_ARTIFACT_NOT_CONFIGURED');
  if (!Array.isArray(materializedFields) || materializedFields.length !== plan?.stagedFields?.length) throw new Error('EMPLOYER_MATERIALIZED_FIELD_MISMATCH');
  const expected = plan.stagedFields.map(item => `${item.fieldRef}:${item.fieldKey}`).sort();
  const actual = materializedFields.map(item => `${text(item.fieldRef)}:${text(item.fieldKey)}`).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('EMPLOYER_MATERIALIZED_FIELD_MISMATCH');
  return {
    protocolVersion: 1,
    operation: 'fill-without-submit',
    runner: { version: artifact.runnerVersion, sha256: artifact.runnerSha256 },
    target: plan.target,
    fieldSchemaHash: plan.fieldSchemaHash,
    fields: materializedFields,
    constraints: { submit: false, clickConsequentialControls: false, retainValues: false },
  };
}

export function createEmployerBrowserInspectionRequest(target, artifact) {
  if (!artifact?.ready) throw new Error('EMPLOYER_BROWSER_RUNNER_ARTIFACT_NOT_CONFIGURED');
  return {
    protocolVersion: 1,
    operation: 'inspect-form-schema',
    runner: { version: artifact.runnerVersion, sha256: artifact.runnerSha256 },
    target,
    constraints: { includeFieldValues: false, includePageText: false, submit: false, clickControls: false, retainValues: false },
  };
}

function assertInspectionContainsNoValues(value, path = 'inspection') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertInspectionContainsNoValues(item, `${path}.${index}`));
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_INSPECTION_KEY.test(key) && nested !== null && nested !== '' && nested !== false) throw new Error(`EMPLOYER_BROWSER_INSPECTION_VALUE_FORBIDDEN:${path}.${key}`);
    assertInspectionContainsNoValues(nested, `${path}.${key}`);
  }
}

function inspectionField(field = {}) {
  assertInspectionContainsNoValues(field, 'field');
  const fieldRef = text(field.fieldRef);
  const fieldKey = text(field.fieldKey);
  const label = text(field.label).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 200);
  const inputType = text(field.inputType || 'text').toLowerCase().slice(0, 40);
  if (!SAFE_REF.test(fieldRef) || !SAFE_REF.test(fieldKey) || !label || !SAFE_INPUT_TYPE.test(inputType)) throw new Error('EMPLOYER_BROWSER_INSPECTION_SCHEMA_INVALID');
  return { fieldRef, fieldKey, label, inputType, required: field.required === true };
}

function validateInspectionEnvelope(request, result, artifact) {
  assertInspectionContainsNoValues(result);
  if (!result || result.protocolVersion !== 1 || result.operation !== 'inspect-form-schema') throw new Error('EMPLOYER_BROWSER_RUNNER_PROTOCOL_INVALID');
  if (result.runnerVersion !== artifact.runnerVersion || text(result.runnerSha256).toLowerCase() !== artifact.runnerSha256) throw new Error('EMPLOYER_BROWSER_RUNNER_ATTESTATION_FAILED');
  if (result.submitted === true || result.clickedControls === true || result.valuesRetained === true) throw new Error('EMPLOYER_BROWSER_RUNNER_CONSEQUENTIAL_RESULT_FORBIDDEN');
  const fields = Array.isArray(result.fields) ? result.fields.slice(0, 150).map(inspectionField) : null;
  if (!fields || result.fields.length > 150 || !text(result.pageUrl)) throw new Error('EMPLOYER_BROWSER_INSPECTION_SCHEMA_INVALID');
  return { pageUrl: text(result.pageUrl), fields, runnerVersion: result.runnerVersion, runnerSha256: text(result.runnerSha256).toLowerCase(), submitted: false, valuesRetained: false };
}

function validateRunnerEnvelope(request, result, artifact) {
  if (!result || result.protocolVersion !== 1 || result.operation !== 'fill-without-submit') throw new Error('EMPLOYER_BROWSER_RUNNER_PROTOCOL_INVALID');
  if (result.runnerVersion !== artifact.runnerVersion || text(result.runnerSha256).toLowerCase() !== artifact.runnerSha256) throw new Error('EMPLOYER_BROWSER_RUNNER_ATTESTATION_FAILED');
  if (result.submitted === true || result.clickedSubmit === true || result.fieldValues || result.valuesRetained === true) throw new Error('EMPLOYER_BROWSER_RUNNER_CONSEQUENTIAL_RESULT_FORBIDDEN');
  if (result.fieldSchemaHash !== request.fieldSchemaHash) throw new Error('EMPLOYER_BROWSER_RUNNER_SCHEMA_MISMATCH');
  return result;
}

export async function runEmployerBrowserArtifact(sandbox, { plan, materializedFields, artifact }) {
  if (!sandbox?.writeFiles || !sandbox?.runCommand || !sandbox?.readFileToBuffer) throw new Error('EMPLOYER_BROWSER_SANDBOX_INTERFACE_INVALID');
  const request = createEmployerBrowserRunnerRequest(plan, materializedFields, artifact);
  const nonce = randomUUID().replaceAll('-', '');
  const inputPath = `/tmp/1ststep-employer-${nonce}.input.json`;
  const outputPath = `/tmp/1ststep-employer-${nonce}.output.json`;
  try {
    await sandbox.writeFiles([{ path: inputPath, content: JSON.stringify(request), mode: 0o600 }]);
    const command = await sandbox.runCommand('node', [artifact.runnerPath, '--input', inputPath, '--output', outputPath], { timeoutMs: 90_000 });
    if (command?.exitCode !== 0) throw new Error('EMPLOYER_BROWSER_RUNNER_FAILED');
    const output = await sandbox.readFileToBuffer({ path: outputPath });
    if (!output || output.byteLength > MAX_RESULT_BYTES) throw new Error('EMPLOYER_BROWSER_RUNNER_RESULT_INVALID');
    let result;
    try { result = JSON.parse(output.toString('utf8')); } catch { throw new Error('EMPLOYER_BROWSER_RUNNER_RESULT_INVALID'); }
    return validateRunnerEnvelope(request, result, artifact);
  } finally {
    await sandbox.runCommand('rm', ['-f', inputPath, outputPath], { timeoutMs: 5_000 }).catch(() => {});
  }
}

export async function runEmployerBrowserInspectionArtifact(sandbox, { target, artifact }) {
  if (!sandbox?.writeFiles || !sandbox?.runCommand || !sandbox?.readFileToBuffer) throw new Error('EMPLOYER_BROWSER_SANDBOX_INTERFACE_INVALID');
  const request = createEmployerBrowserInspectionRequest(target, artifact);
  const nonce = randomUUID().replaceAll('-', '');
  const inputPath = `/tmp/1ststep-employer-${nonce}.inspect.input.json`;
  const outputPath = `/tmp/1ststep-employer-${nonce}.inspect.output.json`;
  try {
    await sandbox.writeFiles([{ path: inputPath, content: JSON.stringify(request), mode: 0o600 }]);
    const command = await sandbox.runCommand('node', [artifact.runnerPath, '--input', inputPath, '--output', outputPath], { timeoutMs: 90_000 });
    if (command?.exitCode !== 0) throw new Error('EMPLOYER_BROWSER_RUNNER_FAILED');
    const output = await sandbox.readFileToBuffer({ path: outputPath });
    if (!output || output.byteLength > MAX_RESULT_BYTES) throw new Error('EMPLOYER_BROWSER_RUNNER_RESULT_INVALID');
    let result;
    try { result = JSON.parse(output.toString('utf8')); } catch { throw new Error('EMPLOYER_BROWSER_RUNNER_RESULT_INVALID'); }
    return validateInspectionEnvelope(request, result, artifact);
  } finally {
    await sandbox.runCommand('rm', ['-f', inputPath, outputPath], { timeoutMs: 5_000 }).catch(() => {});
  }
}
