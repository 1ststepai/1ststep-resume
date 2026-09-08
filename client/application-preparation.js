// Preparation creates a private draft. It does not verify candidate eligibility
// or authorize disclosure to an employer.
export function preparationCandidates(roles, { discoveryRunId, limit = 1 } = {}) {
  if (!discoveryRunId) return [];
  return (roles || []).filter(role =>
    role.discoveryRunId === discoveryRunId &&
    ['Found', 'Verified'].includes(role.status) &&
    role.sourceType === 'direct-employer' && role.applyPathActive === true &&
    role.requisitionId && role.jobDescription?.length >= 200 &&
    role.credibleInterviewPath === true && !(role.hardDisqualifiers || []).length &&
    !role.packageRunId && !role.packageDraft
  ).sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))
    .slice(0, Math.max(0, Math.min(10, Math.floor(Number(limit) || 0))));
}

export function automaticPreparationAuthorized(consent) {
  return consent?.status === 'active' && consent?.active === true &&
    consent.scopes?.includes('ai-document-preparation') === true;
}

export function preparationFailureCode(run) {
  const message = run?.lastErrorCode || '';
  if (/^[A-Z][A-Z0-9_]{0,79}$/.test(message)) return message;
  if (/Unexpected end of JSON|Unterminated string/i.test(message)) return 'PACKAGE_RESPONSE_TRUNCATED';
  if (/Unexpected token|Expected .*JSON|not valid JSON/i.test(message)) return 'PACKAGE_RESPONSE_INVALID';
  if (/reasoning effort/i.test(message)) return 'AI_REASONING_CONFIGURATION';
  if (/Unsupported AI provider/i.test(message)) return 'AI_PROVIDER_NAME_INVALID';
  if (/credentials/i.test(message)) return 'AI_CREDENTIALS_INCOMPLETE';
  if (/routing requires|routing is restricted/i.test(message)) return 'AI_ROUTING_CONFIGURATION';
  return 'PACKAGE_GENERATION_FAILED';
}

export function preparationRetryAllowed(run) {
  return run?.status === 'Failed' && /^(AI_RATE_LIMIT|AI_PROVIDER_TRANSIENT|AI_PROVIDER_NAME_INVALID|AI_REASONING_CONFIGURATION|PACKAGE_RESPONSE_INVALID|PACKAGE_RESPONSE_TRUNCATED)$/.test(preparationFailureCode(run));
}
