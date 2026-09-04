import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { assertNoApplicationSecrets } from './application-session-domain.js';
import { employerBrowserRunnerArtifactConfiguration, materializeApprovedEmployerFields, runEmployerBrowserArtifact, runEmployerBrowserInspectionArtifact } from './employer-browser-runner-protocol.js';

const SNAPSHOT_ID = /^snap_[A-Za-z0-9_-]{8,160}$/;
const SAFE_REF = /^[A-Za-z0-9:_-]{3,160}$/;
const ORDINARY_FIELD = /^(?:name|firstName|lastName|email|phone|city|state|postalCode|linkedin|portfolio|currentEmployer|currentTitle)$/;
const CREDENTIAL = /(?:password|passkey|sign[ -]?in|log[ -]?in|account access)/i;
const OTP = /(?:one[ -]?time|otp|verification code|security code|mfa|2fa)/i;
const CAPTCHA = /(?:captcha|security challenge|human verification)/i;
const IDENTITY = /(?:identity verification|government id|driver'?s license|passport|selfie)/i;
const CERTIFICATION = /(?:certif(?:y|ication)|electronic signature|attest|swear|under penalty)/i;
const OUTSIDE_EMPLOYMENT = /(?:outside employment|moonlight|conflict of interest|restrictive agreement|non[- ]?compete)/i;
const DOCUMENT_UPLOAD = /(?:resume|résumé|curriculum vitae|\bcv\b|cover letter|supporting document)/i;
const PROTECTED_OR_CONSEQUENTIAL = /(?:citizen|citizenship|clearance|export control|itar|criminal|conviction|disability|veteran|race|ethnicity|gender|sex|sexual orientation|religion|referral)/i;
const ELIGIBILITY_SCREEN = /(?:work authorization|authorized to work|sponsor|visa|citizen|citizenship|clearance|export control|itar|minimum years?|years? of experience|degree|education|required salary|salary expectation|travel requirement|willing to travel|relocat)/i;
const SAFE_AUTOFILL_INPUT = new Set(['text', 'email', 'tel', 'url', 'textarea', 'select']);

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function employerBrowserWorkerConfiguration(env = process.env) {
  if (String(env.EMPLOYER_BROWSER_WORKER_ENABLED || '').toLowerCase() !== 'true') return { enabled: false, reason: 'disabled' };
  const snapshotId = String(env.EMPLOYER_BROWSER_WORKER_SNAPSHOT_ID || '').trim();
  if (!SNAPSHOT_ID.test(snapshotId)) return { enabled: false, reason: 'snapshot-not-configured' };
  const accountDailyUnits = positiveInteger(env.EMPLOYER_BROWSER_ACCOUNT_DAILY_UNITS);
  const globalDailyUnits = positiveInteger(env.EMPLOYER_BROWSER_GLOBAL_DAILY_UNITS);
  if (!accountDailyUnits || !globalDailyUnits) return { enabled: false, reason: 'budget-not-configured' };
  const runner = employerBrowserRunnerArtifactConfiguration(env);
  if (!runner.ready) return { enabled: false, reason: runner.reason };
  if (String(env.EMPLOYER_BROWSER_DURABLE_EXECUTION_ENABLED || '').toLowerCase() !== 'true') return { enabled: false, reason: 'durable-execution-not-configured' };
  return { enabled: true, snapshotId, accountDailyUnits, globalDailyUnits, runner };
}

function verifiedUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('EMPLOYER_TARGET_INVALID');
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname)) throw new Error('EMPLOYER_TARGET_INVALID');
  url.hash = '';
  return url;
}

export function assertVerifiedEmployerNavigation(session, requestedUrl) {
  const authority = verifiedUrl(session?.role?.directEmployerUrl);
  const requested = verifiedUrl(requestedUrl || authority.href);
  if (requested.hostname.toLowerCase() !== authority.hostname.toLowerCase()) throw new Error('EMPLOYER_HOST_MISMATCH');
  return { href: requested.href, hostname: authority.hostname.toLowerCase() };
}

function fieldDescriptor(field = {}) {
  if (['value', 'answer', 'defaultValue', 'currentValue', 'secretValue'].some(key => Object.hasOwn(field, key))) throw new Error('EMPLOYER_FIELD_VALUES_FORBIDDEN');
  const fieldRef = String(field.fieldRef || '').trim();
  const fieldKey = String(field.fieldKey || '').trim();
  const label = String(field.label || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 200);
  const inputType = String(field.inputType || 'text').trim().toLowerCase().slice(0, 40);
  if (!SAFE_REF.test(fieldRef) || !SAFE_REF.test(fieldKey) || !label) throw new Error('EMPLOYER_FIELD_SCHEMA_INVALID');
  return { fieldRef, fieldKey, label, inputType, required: field.required === true };
}

function action(type, field, summary, metadata = {}) {
  return { type, fieldRef: field.fieldRef, fieldKey: field.fieldKey, summary, ...metadata };
}

function approvalIsCurrent(session, now) {
  const approval = session?.approvals?.transmission;
  const timestamp = new Date(now).getTime();
  return Boolean(approval && !approval.consumedAt && approval.documentVersion === session.documentVersion
    && timestamp >= new Date(approval.confirmedAt).getTime() && timestamp <= new Date(approval.expiresAt).getTime());
}

export function planEmployerFormStep({ session, pageUrl, fields = [], now = new Date() } = {}) {
  assertNoApplicationSecrets({ session, fields }, 'employerWorker');
  if (session?.stage !== 'employer_form' || !approvalIsCurrent(session, now)) throw new Error('CURRENT_TRANSMISSION_APPROVAL_REQUIRED');
  const target = assertVerifiedEmployerNavigation(session, pageUrl);
  const normalized = fields.slice(0, 150).map(fieldDescriptor);
  const proposals = new Map((session.proposedFields || []).map(item => [item.fieldKey, item]));
  const stagedFields = [];
  const leftUnanswered = [];
  const actions = [];

  for (const field of normalized) {
    const semantic = `${field.label} ${field.fieldKey} ${field.inputType}`;
    if (field.inputType === 'password' || CREDENTIAL.test(semantic)) actions.push(action('LOGIN', field, 'Sign in directly on the verified employer page. Credentials are never collected by 1stStep.'));
    else if (field.inputType === 'file' || DOCUMENT_UPLOAD.test(semantic)) actions.push(action('DOCUMENT_UPLOAD', field, 'Upload the exact approved résumé or cover-letter version on the verified employer page.'));
    else if (OTP.test(semantic)) actions.push(action('OTP', field, 'Enter the latest verification code directly on the employer page.'));
    else if (field.inputType === 'captcha' || CAPTCHA.test(semantic)) actions.push(action('CAPTCHA', field, 'Complete the security challenge directly on the employer page.'));
    else if (IDENTITY.test(semantic)) actions.push(action('IDENTITY_VERIFICATION', field, 'Complete identity verification directly with the employer.'));
    else if (OUTSIDE_EMPLOYMENT.test(semantic)) actions.push(action('OUTSIDE_EMPLOYMENT_CONFLICT', field, 'Review this employer-specific conflict or restrictive-agreement question.'));
    else if (CERTIFICATION.test(semantic)) actions.push(action('NONSTANDARD_CERTIFICATION', field, 'Review this certification or attestation before continuing.'));
    else if (field.required && ELIGIBILITY_SCREEN.test(semantic)) actions.push(action('AMBIGUOUS_FACT', field, 'Potential eligibility screen: answer the exact employer question truthfully. An unsupported answer may end the application; you can skip this job instead.', { riskCategory: 'eligibility-screening', canSkipJob: true }));
    else if (PROTECTED_OR_CONSEQUENTIAL.test(semantic)) {
      if (field.required) actions.push(action('AMBIGUOUS_FACT', field, 'Answer this consequential employer question explicitly; the agent will not infer it.'));
      else leftUnanswered.push({ fieldRef: field.fieldRef, fieldKey: field.fieldKey, reason: 'optional-consequential-question' });
    } else {
      const proposal = proposals.get(field.fieldKey);
      if (ORDINARY_FIELD.test(field.fieldKey) && SAFE_AUTOFILL_INPUT.has(field.inputType) && proposal?.ordinaryVerified === true && Number(proposal.confidence) >= 0.92 && proposal.factId) {
        stagedFields.push({ fieldRef: field.fieldRef, fieldKey: field.fieldKey, factId: proposal.factId });
      } else if (field.required) actions.push(action('AMBIGUOUS_FACT', field, 'Confirm this required answer before the agent fills it.'));
      else leftUnanswered.push({ fieldRef: field.fieldRef, fieldKey: field.fieldKey, reason: 'no-exact-confirmed-fact' });
    }
  }

  const schema = normalized.map(({ fieldRef, fieldKey, inputType, required }) => ({ fieldRef, fieldKey, inputType, required }));
  return {
    status: actions.length ? 'waiting-for-user' : 'ready-to-fill',
    target: { hostname: target.hostname, pageUrl: target.href },
    fieldSchemaHash: createHash('sha256').update(JSON.stringify(schema)).digest('hex'),
    stagedFields, leftUnanswered, actions,
    credentialCollection: false, challengeValueCollection: false,
    transmissionAuthorized: true, finalSubmissionAuthorized: false,
    externalApplicationExecution: false,
  };
}

export function validateEmployerWorkerCheckpoint(plan, result = {}) {
  assertNoApplicationSecrets(result, 'employerWorkerResult');
  if (plan?.status !== 'ready-to-fill') throw new Error('EMPLOYER_WORKER_PLAN_BLOCKED');
  const target = assertVerifiedEmployerNavigation({ role: { directEmployerUrl: plan.target.pageUrl } }, result.pageUrl);
  if (target.hostname !== plan.target.hostname || result.fieldSchemaHash !== plan.fieldSchemaHash) throw new Error('EMPLOYER_WORKER_RESULT_MISMATCH');
  const stagedFieldKeys = Array.isArray(result.stagedFieldKeys) ? result.stagedFieldKeys : [];
  const expected = plan.stagedFields.map(item => item.fieldKey).sort();
  if (JSON.stringify([...stagedFieldKeys].sort()) !== JSON.stringify(expected)) throw new Error('EMPLOYER_WORKER_RESULT_MISMATCH');
  if (result.submitted === true || result.receipt || result.fieldValues) throw new Error('EMPLOYER_WORKER_CONSEQUENTIAL_RESULT_FORBIDDEN');
  return {
    pageUrl: target.href, fieldSchemaHash: plan.fieldSchemaHash, stagedFieldKeys: expected,
    checkpointStatus: 'preserved', transmission: 'not-recorded', submission: 'none',
    externalApplicationExecution: false,
  };
}

export async function executeEmployerBrowserInspection({ session, pageUrl, env = process.env, SandboxImpl, run } = {}) {
  const config = employerBrowserWorkerConfiguration(env);
  if (!config.enabled) return { status: 'not-configured', reason: config.reason, externalApplicationExecution: false };
  const target = assertVerifiedEmployerNavigation(session, pageUrl || session?.role?.directEmployerUrl);
  const Sandbox = SandboxImpl || (await import('@vercel/sandbox')).Sandbox;
  let sandbox;
  try {
    sandbox = await Sandbox.create({
      source: { type: 'snapshot', snapshotId: config.snapshotId },
      timeout: 120_000,
      networkPolicy: { allow: [target.hostname] },
    });
    const result = typeof run === 'function'
      ? await run(sandbox, { target: { hostname: target.hostname, pageUrl: target.href }, operation: 'inspect-form-schema' })
      : await runEmployerBrowserInspectionArtifact(sandbox, { target: { hostname: target.hostname, pageUrl: target.href }, artifact: config.runner });
    assertNoApplicationSecrets(result, 'employerInspectionResult');
    const verified = assertVerifiedEmployerNavigation(session, result?.pageUrl);
    if (!Array.isArray(result?.fields) || result.fields.length > 150) throw new Error('EMPLOYER_BROWSER_INSPECTION_SCHEMA_INVALID');
    const fields = result.fields.map(fieldDescriptor);
    return { status: 'inspected', pageUrl: verified.href, fields, externalApplicationExecution: false };
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}

export async function executeEmployerBrowserCheckpoint({ plan, vault, env = process.env, SandboxImpl, run } = {}) {
  if (plan?.status !== 'ready-to-fill') return { status: 'waiting-for-user', actions: plan?.actions || [], externalApplicationExecution: false };
  const config = employerBrowserWorkerConfiguration(env);
  if (!config.enabled) return { status: 'not-configured', reason: config.reason, externalApplicationExecution: false };
  const target = assertVerifiedEmployerNavigation({ role: { directEmployerUrl: plan.target?.pageUrl } }, plan.target?.pageUrl);
  const Sandbox = SandboxImpl || (await import('@vercel/sandbox')).Sandbox;
  let sandbox;
  try {
    sandbox = await Sandbox.create({
      source: { type: 'snapshot', snapshotId: config.snapshotId },
      timeout: 120_000,
      networkPolicy: { allow: [target.hostname] },
    });
    const materializedFields = typeof run === 'function' ? null : materializeApprovedEmployerFields(plan, vault);
    const result = typeof run === 'function'
      ? await run(sandbox, { target: { hostname: target.hostname, pageUrl: target.href }, fieldSchemaHash: plan.fieldSchemaHash, stagedFields: plan.stagedFields })
      : await runEmployerBrowserArtifact(sandbox, { plan, materializedFields, artifact: config.runner });
    return { status: 'checkpoint-preserved', checkpoint: validateEmployerWorkerCheckpoint(plan, result), externalApplicationExecution: false };
  } finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
}
