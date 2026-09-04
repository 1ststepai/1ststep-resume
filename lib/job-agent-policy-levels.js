/* Policy-level gating.

   Engineering boundary change only. No legal language, policy version, authorization
   document or counsel approval is created, implied or asserted here.

   The defect: one counsel-bundle check guarded both "store the career facts this user
   just typed" and "submit an application in this user's name". Those need different
   permission, so the strict one was applied to both — which is simultaneously too
   strict for internal storage and indistinguishable from the control that matters.

   Levels:
     NONE          no persisted career data, no third-party effect.
     DATA_CONSENT  the user accepted the CURRENT Terms and Privacy versions and granted
                   the internal scopes. Sufficient to store and process their own data
                   inside their own workspace. Does NOT require the Job Agent
                   Authorization instrument, which governs acting on their behalf.
     AUTHORIZATION Terms + Privacy + Job Agent Authorization. The agent acts unattended.
     EXTERNAL      Full authorization plus every existing external-action safeguard.

   AUTHORIZATION and EXTERNAL delegate unchanged to jobAgentConsentGate, so external
   paths keep exactly the controls they have today. Unknown levels fail closed. */

import {
  jobAgentConsentGate,
  jobAgentConsentEnforcementRequired,
  readJobAgentConsent,
} from './job-agent-consent-store.js';
import { jobAgentPilotAccessForSubject } from './job-agent-pilot-access.js';
import { createJobAgentConsent } from './job-agent-consent-domain.js';

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;

export const JOB_AGENT_POLICY_LEVELS = Object.freeze({
  NONE: 'NONE',
  DATA_CONSENT: 'DATA_CONSENT',
  AUTHORIZATION: 'AUTHORIZATION',
  EXTERNAL: 'EXTERNAL',
});

/* Scopes required to persist and process the user's own career data. Deliberately a
   subset of REQUIRED_JOB_AGENT_CONSENT_SCOPES: it omits nothing the user did not
   already grant, it simply does not additionally demand the authorization instrument. */
export const JOB_AGENT_DATA_CONSENT_SCOPES = Object.freeze([
  'confirmed-profile-storage', 'ai-document-preparation', 'application-workspace',
]);

/* Terms + Privacy only. Authorization version and counsel approval are NOT consulted:
   they govern acting on the user's behalf, not storing what the user typed. */
export function jobAgentDataPolicyConfiguration(env = process.env) {
  const termsVersion = String(env.JOB_AGENT_TERMS_VERSION || '').trim();
  const privacyVersion = String(env.JOB_AGENT_PRIVACY_VERSION || '').trim();
  const ready = VERSION.test(termsVersion) && VERSION.test(privacyVersion);
  return { ready, termsVersion, privacyVersion };
}

/* The stored consent record must be active and bound to the CURRENT Terms and Privacy
   versions, with the internal scopes granted and all attestations affirmative. */
export function activeJobAgentDataConsent(existing, dataPolicy) {
  if (!dataPolicy?.ready) return { ok: false, code: 'JOB_AGENT_DATA_POLICY_NOT_CONFIGURED' };
  let record = null;
  try { record = existing ? createJobAgentConsent(existing) : null; } catch { return { ok: false, code: 'JOB_AGENT_CONSENT_INVALID' }; }
  if (record?.status !== 'active') return { ok: false, code: 'JOB_AGENT_DATA_CONSENT_REQUIRED' };
  const accepted = record.policy || {};
  if (String(accepted.termsVersion) !== dataPolicy.termsVersion || String(accepted.privacyVersion) !== dataPolicy.privacyVersion) {
    return { ok: false, code: 'JOB_AGENT_DATA_CONSENT_RENEWAL_REQUIRED' };
  }
  if (JOB_AGENT_DATA_CONSENT_SCOPES.some(scope => !record.scopes.includes(scope))) {
    return { ok: false, code: 'JOB_AGENT_DATA_CONSENT_SCOPE_MISSING' };
  }
  if (Object.values(record.attestations || {}).some(value => value !== true)) return { ok: false, code: 'JOB_AGENT_CONSENT_INVALID' };
  return { ok: true, grantedAt: record.grantedAt, policy: accepted };
}

function statusFor(code) {
  if (code === 'JOB_AGENT_DATA_POLICY_NOT_CONFIGURED') return 503;
  if (code === 'JOB_AGENT_PILOT_INVITE_REQUIRED') return 403;
  return 428; // consent required / renewal required — the user can resolve it
}

function messageFor(code) {
  if (code === 'JOB_AGENT_DATA_POLICY_NOT_CONFIGURED') return 'Terms and privacy versions are not configured.';
  if (code === 'JOB_AGENT_DATA_CONSENT_RENEWAL_REQUIRED') return 'Review and accept the current terms and privacy notice before continuing.';
  if (code === 'JOB_AGENT_PILOT_INVITE_REQUIRED') return 'This controlled beta is currently limited to invited members.';
  return 'Accept the current terms and privacy notice before continuing.';
}

/* The single entry point endpoints call. `level` must be an explicit, known level. */
export async function requireJobAgentPolicyLevel(level, { config, subject, env = process.env } = {}) {
  if (level === JOB_AGENT_POLICY_LEVELS.NONE) return { ok: true, level, enforced: false };

  if (level === JOB_AGENT_POLICY_LEVELS.AUTHORIZATION || level === JOB_AGENT_POLICY_LEVELS.EXTERNAL) {
    // Unchanged path. Every existing control is preserved for anything acting on the
    // user's behalf or on the outside world.
    const gate = await jobAgentConsentGate(config, subject, env);
    return { ...gate, level };
  }

  if (level !== JOB_AGENT_POLICY_LEVELS.DATA_CONSENT) {
    return { ok: false, level: level || null, status: 500, code: 'POLICY_LEVEL_UNKNOWN', error: 'Unknown policy level.' };
  }

  const pilot = jobAgentPilotAccessForSubject(subject, env);
  if (!pilot.ok) return { ...pilot, level, status: statusFor(pilot.code), error: messageFor(pilot.code) };

  if (!jobAgentConsentEnforcementRequired(env)) return { ok: true, level, bypassedOutsideProduction: true };

  const dataPolicy = jobAgentDataPolicyConfiguration(env);
  const stored = await readJobAgentConsent({ ...config, subject });
  const result = activeJobAgentDataConsent(stored.consent, dataPolicy);
  if (result.ok) return { ...result, level, version: stored.version };
  return { ...result, level, version: stored.version, status: statusFor(result.code), error: messageFor(result.code) };
}
