import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { careerProfilePostgresConfiguration, probeCareerProfileRuntime } from '../lib/career-profile-postgres-store.js';

if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'preview') throw new Error('CAREER_PROFILE_RUNTIME_PREVIEW_REQUIRED');
const configuration = careerProfilePostgresConfiguration();
if (!configuration.ready) throw new Error(configuration.reason || 'CAREER_PROFILE_RUNTIME_NOT_CONFIGURED');
const dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env);
const result = await probeCareerProfileRuntime({ dataEncryptionKey, configuration });
if (result.status !== 'healthy' || result.syntheticFixtureDeleted !== true) throw new Error('CAREER_PROFILE_RUNTIME_UNAVAILABLE');
console.log(JSON.stringify({ ok: true, environment: 'preview', ...result }));
