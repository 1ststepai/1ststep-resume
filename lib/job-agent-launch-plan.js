const DEFINITIONS = Object.freeze({
  DURABLE_RUNTIME_NOT_CONFIGURED: ['platform', 'runtime-drill', 'Configure encrypted Redis persistence, tenant partitioning, audit signing, and private scanned object storage; then pass the authorized synthetic production lifecycle drill.'],
  PRIVATE_DOCUMENT_STORAGE_NOT_CONFIGURED: ['platform', 'runtime-drill', 'Configure private encrypted object storage and the exact-host malware scanner, then verify write, read, integrity, scan, and deletion.'],
  PRIVATE_DOCUMENT_STORAGE_DRILL_NOT_VERIFIED: ['security', 'signed-external-evidence', 'Run the approved synthetic private-storage lifecycle drill, retain its content-free result, and sign evidence bound to the active storage, scanner, environment, and encryption key ID.'],
  COUNSEL_APPROVED_CONSENT_NOT_CONFIGURED: ['legal', 'reviewed-approval', 'Record counsel-approved Terms, Privacy, authorization versions, and enforce renewal when any reviewed fingerprint changes.'],
  BACKGROUND_SCHEDULING_NOT_CONFIGURED: ['platform', 'configuration', 'Enable the bounded daily scheduler with an approved global run cap and verify idempotent enqueue, consent pause, and cap deferral.'],
  NEEDS_YOU_NOTIFICATIONS_NOT_CONFIGURED: ['operations', 'configuration', 'Configure the generic Needs You sender without employer, role, question, or candidate content.'],
  NEEDS_YOU_SUPPRESSION_NOT_CONFIGURED: ['operations', 'configuration', 'Configure the signed Resend bounce/complaint webhook so permanent failures and spam complaints create encrypted pseudonymous suppression records before email is enabled.'],
  NEEDS_YOU_DELIVERY_NOT_VERIFIED: ['operations', 'signed-external-evidence', 'Verify actual delivery and opt-out with an operator-owned synthetic mailbox, retain the artifact, and sign scope-bound evidence.'],
  AUDIT_ARCHIVE_NOT_CONFIGURED: ['security', 'configuration', 'Configure the approved exact-host retention archive, separate signing and acknowledgement secrets, retention period, and legal-hold policy.'],
  AUDIT_ARCHIVE_NOT_VERIFIED: ['security', 'signed-external-evidence', 'Archive a synthetic content-free signed head, independently verify the immutable object version and retention lock, retain the result, and sign scope-bound evidence.'],
  OPERATOR_ALERTING_NOT_CONFIGURED: ['operations', 'configuration', 'Configure the allowlisted incident receiver and reviewed content-free alert contract.'],
  OPERATOR_ALERT_DELIVERY_NOT_VERIFIED: ['operations', 'signed-external-evidence', 'Verify receiver-side handling for every supported critical event, retain the artifact, and sign scope-bound evidence.'],
  STRIPE_WEBHOOK_IDEMPOTENCY_NOT_CONFIGURED: ['platform', 'runtime-drill', 'Configure durable pseudonymous Stripe webhook claims and verify concurrent delivery, retry, and completed replay without duplicate fulfillment.'],
  RECOVERY_DRILL_NOT_VERIFIED: ['security', 'signed-external-evidence', 'Run the approved production recovery drill, retain independent results, and sign evidence bound to the active store, storage mode, and encryption key ID.'],
  BACKUP_RESTORE_NOT_VERIFIED: ['security', 'signed-external-evidence', 'Complete a provider-managed backup and isolated restore exercise, retain independent results, and sign scope-bound evidence.'],
  COST_LIMITS_NOT_APPROVED: ['finance', 'reviewed-approval', 'Approve invoice-backed unit ceilings and a versioned cost policy before enabling paid provider work.'],
  MONETARY_SPEND_CONTROL_NOT_CONFIGURED: ['finance', 'configuration', 'Configure the approved global and per-category integer-cent caps for AI, documents, browser sessions, email, and storage.'],
  RECEIPT_INGESTION_NOT_CONFIGURED: ['security', 'configuration', 'Configure the separate server-only receipt-ingestion signing boundary; do not expose it to subscriber clients.'],
  CONTROLLED_BETA_NOT_APPROVED: ['product-owner', 'reviewed-approval', 'Record the controlled-beta approval version and an explicit one-to-ten seat limit after all prerequisite evidence is reviewed.'],
  CONTROLLED_BETA_RELEASE_NOT_VERIFIED: ['product-owner', 'signed-external-evidence', 'Retain the reviewed release record and sign approval evidence bound to the exact commit, runtime digest, pilot, policies, budgets, support contract, and execution mode.'],
  PILOT_ADMISSION_CONTROL_NOT_CONFIGURED: ['security', 'configuration', 'Configure the reviewed pseudonymous tenant allowlist and enforce the approved pilot seat limit.'],
  JOB_AGENT_ACCESS_POLICY_NOT_CONFIGURED: ['product-owner', 'configuration', 'Configure the versioned controlled-beta Job Agent entitlement policy. Legacy paid tiers must not imply Job Agent access without an explicit server-issued grant.'],
  SUPPORT_AND_INCIDENT_OWNERSHIP_NOT_CONFIGURED: ['operations', 'reviewed-approval', 'Approve the versioned support and incident contract, assign monitored support and incident owners, record coverage and escalation policies, and bind the exact reviewed runbook fingerprint.'],
  DOCUMENT_RENDER_SANDBOX_NOT_CONFIGURED: ['platform', 'runtime-drill', 'Enable the fixed-budget deny-all render sandbox and verify versioned DOCX/PDF generation, ATS extraction, page inspection, integrity, and teardown.'],
  EMPLOYER_BROWSER_CONFIGURATION_NOT_READY: ['platform', 'runtime-drill', 'Build and configure the isolated no-submit browser runner with exact-host networking, private artifacts, and bounded teardown.'],
  EMPLOYER_BROWSER_RUNNER_EVIDENCE_NOT_VERIFIED: ['security', 'signed-external-evidence', 'Run supervised synthetic runner fixtures, retain the exact snapshot/version/digest artifact, and sign scope-bound evidence.'],
  EMPLOYER_TERMS_REVIEW_NOT_RECORDED: ['legal', 'reviewed-approval', 'Complete and version the employer and ATS terms review before any live assisted application.'],
  ASSISTED_APPLICATION_NOT_APPROVED: ['product-owner', 'reviewed-approval', 'Approve the supervised assisted-application pilot separately from discovery and package preparation.'],
  ASSISTED_EXECUTION_MODE_INVALID: ['product-owner', 'configuration', 'Select exactly greenhouse-extension for the first controlled beta or cloud-browser for the later isolated-provider path.'],
  GREENHOUSE_EXTENSION_HANDOFF_NOT_CONFIGURED: ['platform', 'configuration', 'Configure the server-only signed Greenhouse extension handoff. Keep candidate values transient and consume the exact sharing approval before release.'],
  GREENHOUSE_EXTENSION_REVIEW_NOT_RECORDED: ['security', 'reviewed-approval', 'Complete and version the supervised synthetic Greenhouse extension review before enabling any live employer use.'],
  GREENHOUSE_EXTENSION_ARTIFACT_NOT_VERIFIED: ['security', 'configuration', 'Build the reviewed Greenhouse-only extension artifact and configure its exact pinned SHA-256 digest.'],
  EMPLOYER_BROWSER_REMOTE_STREAM_NOT_READY: ['platform', 'configuration', 'Provision the reviewed interactive remote-stream provider with exact endpoint, origin, cost approval, CSP approval, and no wildcard framing.'],
  EMPLOYER_BROWSER_SESSION_RECOVERY_NOT_VERIFIED: ['security', 'signed-external-evidence', 'Verify create ambiguity, restore, outage, expiry, revocation, and provider-confirmed teardown; retain and sign provider-bound evidence.'],
  FINAL_SUBMISSION_EXECUTION_NOT_CONFIGURED: ['security', 'configuration', 'Configure the independently approved exact-scope submission provider; keep it disabled until supervised evidence is current.'],
  FINAL_SUBMISSION_DURABLE_EXECUTION_NOT_CONFIGURED: ['platform', 'configuration', 'Configure the single-use durable submission worker with approval expiry, consent rechecks, and outcome-unknown recovery.'],
  FINAL_SUBMISSION_SUPERVISED_EXECUTION_NOT_VERIFIED: ['security', 'signed-external-evidence', 'Run the separately authorized supervised synthetic execution matrix, retain the artifact, and sign evidence bound to every consequential control.'],
  AUTHORITATIVE_RECEIPT_CAPTURE_NOT_CONFIGURED: ['platform', 'configuration', 'Configure the approved exact-host read-only receipt capture connector and authority allowlist.'],
  AUTHORITATIVE_RECEIPT_WORKER_NOT_CONFIGURED: ['platform', 'runtime-drill', 'Configure and exercise the durable read-only receipt worker; exhaustion must create Verify employer receipt and never retry submission.'],
});

const PHASES = Object.freeze([
  ['signed-beta', 'signedBeta', 0],
  ['package-ready', 'packageReady', 1],
  ['assisted-application', 'assistedApplication', 2],
  ['final-submission', 'finalSubmission', 3],
]);

export const JOB_AGENT_LAUNCH_BLOCKERS = Object.freeze(Object.keys(DEFINITIONS));

export function jobAgentLaunchActionPlan(capabilities = {}) {
  const seen = new Set();
  const actions = [];
  for (const [stage, key, priority] of PHASES) {
    for (const blocker of capabilities[key]?.blockers || []) {
      if (seen.has(blocker)) continue;
      seen.add(blocker);
      const [owner, proof, summary] = DEFINITIONS[blocker] || ['security', 'unknown-blocker', 'Stop release and investigate this unrecognized launch blocker before changing configuration.'];
      actions.push({ blocker, stage, priority, owner, proof, summary });
    }
  }
  const nextStage = PHASES.find(([, key]) => capabilities[key]?.eligible !== true)?.[0] || 'ready';
  const stageCounts = Object.fromEntries(PHASES.map(([stage]) => [stage, actions.filter(action => action.stage === stage).length]));
  return {
    schemaVersion: 1,
    contentFree: true,
    containsCandidateValues: false,
    nextStage,
    remainingActions: actions.length,
    stageCounts,
    nextAction: actions[0] || null,
    actions,
  };
}

export function publicJobAgentLaunchActionPlan(plan = {}, limit = 5) {
  const boundedLimit = Number.isSafeInteger(limit) ? Math.min(10, Math.max(1, limit)) : 5;
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  return {
    schemaVersion: Number(plan.schemaVersion) || 1,
    contentFree: plan.contentFree === true,
    containsCandidateValues: false,
    nextStage: String(plan.nextStage || 'unknown'),
    remainingActions: Math.max(0, Number(plan.remainingActions) || 0),
    stageCounts: plan.stageCounts && typeof plan.stageCounts === 'object' ? plan.stageCounts : {},
    nextAction: plan.nextAction || null,
    topActions: actions.slice(0, boundedLimit),
    truncated: actions.length > boundedLimit,
  };
}
