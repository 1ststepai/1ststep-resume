import { applyApiHeaders } from '../lib/api-security.js';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { careerProfilePostgresConfiguration, probeCareerProfileRuntime } from '../lib/career-profile-postgres-store.js';

export const maxDuration = 30;

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  const configuration = careerProfilePostgresConfiguration();
  if (!configuration.enabled) return res.status(404).json({ error: 'Not found.' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const limit = await enforceDurableRateLimit(req, { scope: 'career-profile-preview-smoke', ipRule: { limit: 3, window: '1 m' }, globalRule: { limit: 30, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Career Profile Preview verification limit reached.');
  let dataEncryptionKey;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env); } catch { return res.status(503).json({ ok: false, careerProfileStore: 'unavailable' }); }
  const result = await probeCareerProfileRuntime({ dataEncryptionKey, configuration });
  const ok = result.status === 'healthy' && result.syntheticFixtureDeleted === true;
  return res.status(ok ? 200 : 503).json({ ok, careerProfileStore: result.status, encryptedRoundTrip: result.encryptedRoundTrip === true,
    idempotentReplay: result.idempotentReplay === true, staleWriteRejected: result.staleWriteRejected === true, tenantIsolation: result.tenantIsolation === true,
    reuseGrantsCreated: 0, syntheticFixtureDeleted: result.syntheticFixtureDeleted === true, productionEnabled: false });
}
