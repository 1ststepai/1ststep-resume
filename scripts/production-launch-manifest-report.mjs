import { jobAgentLaunchManifest } from '../lib/job-agent-launch-manifest.js';
import { publicJobAgentLaunchActionPlan } from '../lib/job-agent-launch-plan.js';

const manifest = jobAgentLaunchManifest({ ...process.env, VERCEL_ENV: 'production' });
const report = {
  generatedAt: new Date().toISOString(),
  evaluationMode: 'production-rules-applied-to-current-process',
  environmentSource: String(process.env.JOB_AGENT_LAUNCH_REPORT_SOURCE || 'operator-process-unspecified').slice(0, 80),
  authoritativeProductionRuntimeEvidence: false,
  evidenceLimitations: [
    'Encrypted Vercel values may be unavailable to a local CLI process.',
    'Variable-name presence and a local process evaluation do not prove deployed runtime values or behavior.',
    'Use the authenticated deployed readiness endpoint and retained external evidence for release approval.',
  ],
  contentFree: true,
  containsCandidateValues: false,
  performsExternalCalls: false,
  writesProductionState: false,
  currentMode: manifest.currentMode,
  assistedExecutionMode: manifest.assistedExecutionMode,
  extensionHandoff: manifest.extensionHandoff,
  pilot: manifest.pilot,
  supportAndIncidentOwnership: manifest.supportAndIncidentOwnership,
  authoritativeReceiptCapture: manifest.authoritativeReceiptCapture,
  authoritativeReceiptVerification: manifest.authoritativeReceiptVerification,
  monetarySpendControl: manifest.monetarySpendControl,
  auditArchive: manifest.auditArchive,
  capabilities: manifest.capabilities,
  actionPlan: publicJobAgentLaunchActionPlan(manifest.actionPlan),
  evidence: manifest.evidence,
  externalApplicationExecution: manifest.externalApplicationExecution,
  submissionsEnabled: manifest.submissionsEnabled,
};

console.log(JSON.stringify(report, null, 2));
