import { applyApiHeaders, authenticateApiRequest, isOriginAllowed } from '../lib/api-security.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { jobAgentConsentPolicyConfiguration, publicJobAgentConsent } from '../lib/job-agent-consent-domain.js';
import { readJobAgentConsent } from '../lib/job-agent-consent-store.js';
import { jobAgentPilotAccessForSubject, publicJobAgentPilotAccess } from '../lib/job-agent-pilot-access.js';
import { jobAgentAccessAllowed, jobAgentEntitlementConfiguration } from '../lib/job-agent-entitlement.js';
import { isAdministratorSubject } from '../lib/admin-subject.js';

export function isAdminSubject(subject, env = process.env) {
  return isAdministratorSubject(subject, env);
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  const adminConsole = isAdminSubject(auth.subject);
  const runtime = jobAgentRuntimeConfiguration();
  const consentPolicy = jobAgentConsentPolicyConfiguration();
  const storedConsent = runtime ? await readJobAgentConsent({ ...runtime, subject: auth.subject }).catch(() => ({ consent: null, version: 0 })) : { consent: null, version: 0 };
  const jobAgentConsent = publicJobAgentConsent(storedConsent.consent, consentPolicy);
  const pilotAccess = auth.localDevelopment === true ? { ok: true, enforced: false } : jobAgentPilotAccessForSubject(auth.subject);
  const entitlementPolicy = jobAgentEntitlementConfiguration();
  return res.status(200).json({
    adminConsole,
    jobAgentAccess: jobAgentAccessAllowed(auth) && pilotAccess.ok,
    jobAgentAccessMode: entitlementPolicy.mode,
    jobAgentBillingEnabled: entitlementPolicy.dedicatedBillingEnabled,
    pilotAccess: publicJobAgentPilotAccess(pilotAccess),
    tier: auth.localDevelopment === true ? 'development' : auth.tier,
    sessionAuthentication: auth.authentication || (auth.localDevelopment ? 'development' : 'unknown'),
    sessionExpiresAt: Number.isFinite(auth.expiresAt) ? new Date(auth.expiresAt).toISOString() : null,
    sessionRenewalRecommended: auth.authentication === 'opaque-session' && Number(auth.expiresAt) - Date.now() < 24 * 60 * 60 * 1000,
    jobAgentConsent,
    jobAgentConsentVersion: Number(storedConsent.version) || 0,
    jobAgentConsentPolicyConfigured: consentPolicy.ready,
  });
}
