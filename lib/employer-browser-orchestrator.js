import { addApplicationAction, pauseApplicationSession, preserveApplicationFormCheckpoint } from './application-session-domain.js';
import { executeEmployerBrowserCheckpoint, planEmployerFormStep } from './employer-browser-worker.js';

function workerState(mode, isolated, status) {
  return { mode, isolated, status, browserSessionReference: null, valuesRetained: false, submitted: false };
}

function preservePlan(session, plan, now) {
  return preserveApplicationFormCheckpoint(session, {
    pageUrl: plan.target.pageUrl, stepKey: 'employer-form', fieldSchemaHash: plan.fieldSchemaHash,
    stagedFieldKeys: plan.stagedFields.map(item => item.fieldKey),
  }, now);
}

export function applyEmployerInspectionPlan(session, plan, now = new Date()) {
  let updated = preservePlan(session, plan, now);
  if (plan.status === 'waiting-for-user') {
    for (const item of plan.actions) {
      updated = addApplicationAction(updated, { type: item.type, summary: item.summary, metadata: { fieldKey: item.fieldKey, fieldRef: item.fieldRef, riskCategory: item.riskCategory || null, canSkipJob: item.canSkipJob === true } }, now);
    }
    return { ...updated, worker: workerState('waiting-for-user', true, 'inspection-blocked') };
  }
  if (plan.status !== 'ready-to-fill' || !plan.stagedFields.length) throw new Error('EMPLOYER_BROWSER_NO_APPROVED_FIELDS');
  return { ...updated, state: 'Preparing', worker: workerState('durable-queue', true, 'inspection-complete') };
}

export async function orchestrateEmployerBrowserCheckpoint({ session, pageUrl, fields, env = process.env, now = new Date(), execute = executeEmployerBrowserCheckpoint } = {}) {
  const plan = planEmployerFormStep({ session, pageUrl, fields, now });
  let updated = preservePlan(session, plan, now);
  if (plan.status === 'waiting-for-user') {
    for (const item of plan.actions) {
      updated = addApplicationAction(updated, { type: item.type, summary: item.summary, metadata: { fieldKey: item.fieldKey, fieldRef: item.fieldRef, riskCategory: item.riskCategory || null, canSkipJob: item.canSkipJob === true } }, now);
    }
    return { session: { ...updated, worker: workerState('waiting-for-user', false, 'blocked') }, planStatus: plan.status, executionStatus: 'not-started' };
  }
  const execution = await execute({ plan, env });
  if (execution.status === 'not-configured') {
    updated = pauseApplicationSession(updated, 'The isolated employer browser is not configured. The schema-only checkpoint remains saved.', now);
    return { session: { ...updated, worker: workerState('disabled', false, 'not-configured') }, planStatus: plan.status, executionStatus: execution.status };
  }
  if (execution.status !== 'checkpoint-preserved' || !execution.checkpoint) throw new Error('EMPLOYER_BROWSER_CHECKPOINT_INVALID');
  updated = preserveApplicationFormCheckpoint(updated, {
    pageUrl: execution.checkpoint.pageUrl, stepKey: 'employer-form', fieldSchemaHash: execution.checkpoint.fieldSchemaHash,
    stagedFieldKeys: execution.checkpoint.stagedFieldKeys,
  }, now);
  return {
    session: { ...updated, state: 'Preparing', worker: workerState('isolated-checkpoint', true, 'checkpoint-preserved') },
    planStatus: plan.status, executionStatus: execution.status,
  };
}
