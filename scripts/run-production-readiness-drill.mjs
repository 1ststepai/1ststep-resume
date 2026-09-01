import { runProductionReadinessDrill } from '../lib/job-agent-readiness-drill-client.js';

try {
  console.log(JSON.stringify(await runProductionReadinessDrill()));
} catch (error) {
  console.error(JSON.stringify({
    ok: false, synthetic: true, contentFree: true, containsCandidateValues: false,
    outcomeUnknown: error?.outcomeUnknown === true,
    error: String(error?.message || 'Production readiness drill failed.').replace(/[^A-Za-z0-9_=.-]/g, '_').slice(0, 180),
    requestAttempts: Number(error?.requestAttempts) === 1 ? 1 : 0,
  }));
  process.exit(error?.outcomeUnknown === true ? 2 : 1);
}
