export const READINESS_DRILL_CONFIRMATION = 'CREATE_RESTORE_DELETE_SYNTHETIC_RECORDS';

export function readinessDrillRequested(query = {}) {
  return ['session', 'notification', 'audit', 'deep', 'package'].some(key => String(query?.[key] || '') === '1');
}

export function authorizeReadinessDrillRequest(req, authorization) {
  if (!readinessDrillRequested(req.query)) return { ok: true, requested: false };
  if (authorization?.actor !== 'cron') return { ok: false, status: 403, code: 'DRILL_OPERATOR_REQUIRED' };
  if (String(req.headers?.['x-job-agent-readiness-drill'] || '') !== READINESS_DRILL_CONFIRMATION) {
    return { ok: false, status: 403, code: 'DRILL_CONFIRMATION_REQUIRED' };
  }
  return { ok: true, requested: true };
}
