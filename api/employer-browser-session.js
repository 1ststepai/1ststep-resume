import { applyApiHeaders, authenticateApiRequest, hasJsonContentType, isOriginAllowed, jobAgentAccessAllowed } from '../lib/api-security.js';
import { createEmployerBrowserHandoff, employerBrowserSessionProviderConfiguration, resumeEmployerBrowserHandoff } from '../lib/employer-browser-session-provider.js';
import { createEmployerBrowserSession, readEmployerBrowserSessionForApplication } from '../lib/employer-browser-session-store.js';
import { BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED, closeEmployerBrowserSessionBeforeDelete } from '../lib/employer-browser-session-lifecycle.js';
import { readDurableApplicationSession } from '../lib/application-session-store.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentConsentGate } from '../lib/job-agent-consent-store.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';

export const maxDuration = 30;

function publicProvider(configuration) {
  return {
    available: configuration.enabled === true, viewMode: configuration.enabled ? configuration.viewMode : null,
    interactive: configuration.enabled ? configuration.interactive === true : false,
    costMode: configuration.enabled ? configuration.costMode : null,
    streamOrigin: configuration.enabled && configuration.provider === 'remote-stream' ? configuration.streamOrigin : null,
    reason: configuration.enabled ? null : configuration.reason,
  };
}

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Secure browser handoff persistence is not configured.', code: 'BROWSER_HANDOFF_RUNTIME_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, {
    scope: 'employer-browser-session', subject: auth.subject,
    ipRule: { limit: 12, window: '5 m' }, accountRule: { limit: 60, window: '1 d' }, globalRule: { limit: 500, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Browser handoff requests are temporarily limited. Your application checkpoint remains saved.');
  const applicationSessionId = String(req.query?.applicationSessionId || req.body?.applicationSessionId || '');
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(applicationSessionId)) return res.status(400).json({ error: 'A safe application session is required.' });

  try {
    const applicationSession = await readDurableApplicationSession({ ...config, subject: auth.subject, sessionId: applicationSessionId });
    if (!applicationSession) return res.status(404).json({ error: 'Application session not found.' });
    const providerConfiguration = employerBrowserSessionProviderConfiguration();
    if (req.method === 'GET') {
      const consent = await jobAgentConsentGate(config, auth.subject);
      if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code, session: null, view: null, externalApplicationExecution: false, submissionsEnabled: false });
      const browserSession = await readEmployerBrowserSessionForApplication({ ...config, subject: auth.subject, applicationSessionId, includeProviderReference: true });
      if (!browserSession) return res.status(200).json({ session: null, view: null, provider: publicProvider(providerConfiguration), externalApplicationExecution: false, submissionsEnabled: false });
      if (browserSession.status === 'expired') {
        try {
          await closeEmployerBrowserSessionBeforeDelete({ config, subject: auth.subject, applicationSessionId });
        } catch (error) {
          if (error?.code === BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED) return res.status(503).json({ error: 'The expired browser session could not be safely closed. Its recovery reference remains encrypted for retry.', code: BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED, provider: publicProvider(providerConfiguration), externalApplicationExecution: false, submissionsEnabled: false });
          throw error;
        }
        return res.status(410).json({ session: null, view: { status: 'expired', containsCandidateFieldValues: false, submitted: false }, provider: publicProvider(providerConfiguration), externalApplicationExecution: false, submissionsEnabled: false });
      }
      const view = await resumeEmployerBrowserHandoff({ session: applicationSession, browserSession });
      const { provider: _provider, providerSessionReference: _providerSessionReference, ...publicSession } = browserSession;
      return res.status(view.status === 'expired' ? 410 : 200).json({ session: publicSession, view, provider: publicProvider(providerConfiguration), externalApplicationExecution: false, submissionsEnabled: false });
    }
    if (req.method === 'DELETE') {
      const browserSession = await readEmployerBrowserSessionForApplication({ ...config, subject: auth.subject, applicationSessionId, includeProviderReference: true });
      let cleanup;
      try {
        cleanup = await closeEmployerBrowserSessionBeforeDelete({ config, subject: auth.subject, applicationSessionId });
      } catch (error) {
        if (error?.code === BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED) return res.status(503).json({ error: 'The browser provider did not confirm teardown. The encrypted recovery reference was preserved for retry.', code: BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED, provider: publicProvider(providerConfiguration), externalApplicationExecution: false, submissionsEnabled: false });
        throw error;
      }
      return res.status(200).json({ ...cleanup, externalApplicationExecution: false, submissionsEnabled: false });
    }
    if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    if (JSON.stringify(req.body || {}).length > 2_000) return res.status(413).json({ error: 'Browser handoff request is too large.' });
    const consent = await jobAgentConsentGate(config, auth.subject);
    if (!consent.ok) return res.status(consent.status).json({ error: consent.error, code: consent.code });
    const existing = await readEmployerBrowserSessionForApplication({ ...config, subject: auth.subject, applicationSessionId, includeProviderReference: true });
    if (existing && existing.status !== 'expired') {
      const view = await resumeEmployerBrowserHandoff({ session: applicationSession, browserSession: existing });
      const { provider: _provider, providerSessionReference: _providerSessionReference, ...publicSession } = existing;
      return res.status(200).json({ session: publicSession, view, replayed: true, provider: publicProvider(providerConfiguration), externalApplicationExecution: false, submissionsEnabled: false });
    }
    if (existing?.status === 'expired') {
      try {
        await closeEmployerBrowserSessionBeforeDelete({ config, subject: auth.subject, applicationSessionId });
      } catch (error) {
        if (error?.code === BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED) return res.status(503).json({ error: 'The expired browser session could not be safely closed. Its encrypted recovery reference was preserved for retry.', code: BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED, provider: publicProvider(providerConfiguration) });
        throw error;
      }
    }
    if (!providerConfiguration.enabled) return res.status(503).json({ error: 'The resumable browser handoff is not enabled.', code: 'BROWSER_HANDOFF_NOT_CONFIGURED', provider: publicProvider(providerConfiguration) });
    const handoff = await createEmployerBrowserHandoff({ session: applicationSession, redis: config.redis });
    if (handoff.status !== 'ready') return res.status(503).json({ error: 'The browser handoff could not be started.', code: 'BROWSER_HANDOFF_NOT_CONFIGURED', provider: publicProvider(providerConfiguration) });
    const created = await createEmployerBrowserSession({
      ...config, subject: auth.subject, applicationSessionId, employerHostname: handoff.employerHostname, pageUrl: handoff.pageUrl,
      provider: handoff.provider, providerSessionReference: handoff.providerSessionReference, viewMode: handoff.viewMode,
      interactive: handoff.interactive, fieldSchemaHash: handoff.fieldSchemaHash, expiresAt: handoff.expiresAt,
    });
    const { provider: _provider, providerSessionReference: _providerSessionReference, ...view } = handoff;
    return res.status(created.replayed ? 200 : 201).json({ ...created, view, provider: publicProvider(providerConfiguration), externalApplicationExecution: false, submissionsEnabled: false });
  } catch (error) {
    const message = String(error?.message || '');
    if (/(?:MONETARY_SPEND|MONETARY_BUDGET|GLOBAL_MONETARY_BUDGET|CATEGORY_MONETARY_BUDGET)_.*(?:CONFIGURED|EXHAUSTED|UNAVAILABLE)/.test(message)) return res.status(message.includes('EXHAUSTED') ? 429 : 503).json({ error: 'The secure browser handoff is paused by its approved spending limit.', code: message });
    if (/safe|exact verified|limited to|invalid|required/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'employer-browser-handoff-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The secure browser handoff could not be restored.' });
  }
}
