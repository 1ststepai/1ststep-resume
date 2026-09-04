import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = file => readFile(path.join(root, file), 'utf8');

const routePolicies = Object.freeze({
  'account-data.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'ai.js': /authenticateApiRequestOrGuest/,
  'app-config.js': /analytics: \{ enabled: false \}/,
  'applicant-vault.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'application-audit.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'application-package-artifact.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'application-package-render.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'application-packages.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'application-receipts.js': /verifyInternalWorkerRequest/,
  'application-sessions.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'beta-expiry-check.js': /safeEquals\(authHeader, `Bearer \$\{cronSecret\}`\)/,
  'beta.js': /enforceDurableRateLimit/,
  'claude.js': /authenticateApiRequest\(req, \{ allowExtensions: true/,
  'concierge-discovery.js': /authenticateApiRequestOrGuest/,
  'concierge-preview-smoke.js': /VERCEL_ENV === 'production'.*404/,
  'concierge-state.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'employer-browser-session.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'extension-application-handoff.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'ghl-stage.js': /authenticateApiRequest/,
  'health.js': /safeEquals\(.*cronSecret/,
  'health/dependencies.js': /isAdminSubject/,
  'health/live.js': /status: 'healthy', alive: true/,
  'health/ready.js': /jobAgentDependencyHealth/,
  'health/workers.js': /isAdminSubject/,
  'job-agent-consent.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'job-agent-email-events.js': /verifyJobAgentResendWebhook/,
  'job-agent-learning.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'job-agent-notifications.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'job-agent-operations.js': /isAdminSubject/,
  'job-agent-readiness.js': /authenticateApiRequest/,
  'job-agent-runs.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'job-agent-schedule.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'job-agent-worker.js': /safeEquals\(req\.headers\?\.authorization, expected\)/,
  'jobs.js': /authenticateApiRequest/,
  'notify-signup.js': /authenticateApiRequest/,
  'session-capabilities.js': /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/,
  'stripe-webhook.js': /stripe\.webhooks\.constructEvent/,
  'subscription.js': /verifyRestoreChallenge/,
  'tally-webhook.js': /verifyTallySignature/,
  'track-event.js': /authenticateApiRequest/,
  'user-session.js': /authenticateApiRequest/,
});

async function listApiFiles(directory = path.join(root, 'api'), prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? listApiFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`)
    : Promise.resolve(entry.name.endsWith('.js') ? [`${prefix}${entry.name}`] : [])));
  return nested.flat().sort();
}
const apiFiles = await listApiFiles();
const routes = [];
const apiSources = {};
for (const file of apiFiles) {
  const source = await read(`api/${file}`);
  apiSources[file] = source;
  if (/export default/.test(source)) routes.push(file);
}
assert.deepEqual(routes, Object.keys(routePolicies).sort(), 'Every API route must have an explicitly reviewed authentication policy.');
for (const route of routes) assert.match(apiSources[route], routePolicies[route], `${route} does not satisfy its reviewed authentication policy.`);

const apiSecurity = await read('lib/api-security.js');
const sessions = await read('lib/user-session-store.js');
assert.match(apiSecurity, /HttpOnly; SameSite=Lax/);
assert.match(apiSecurity, /expiry > Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000/);
assert.match(apiSecurity, /recordConfiguredJobAgentOperationalEvent\('authentication_failure'/);
assert.match(sessions, /SESSION_TTL_SECONDS = 7 \* 24 \* 60 \* 60/);
assert.match(sessions, /revokeAllUserSessions/);
assert.doesNotMatch(Object.entries(apiSources).filter(([file]) => file !== 'application-receipts.js').map(([, source]) => source).join('\n'), /req\.(?:body|query)\??\.tenantId/);
assert.match(apiSources['application-receipts.js'], /verifyInternalWorkerRequest[\s\S]*const tenantId = String\(req\.body\?\.tenantId/);
for (const route of ['applicant-vault.js', 'application-audit.js', 'application-package-artifact.js', 'application-package-render.js', 'application-packages.js', 'application-sessions.js', 'concierge-state.js', 'employer-browser-session.js', 'extension-application-handoff.js', 'job-agent-consent.js', 'job-agent-learning.js', 'job-agent-notifications.js', 'job-agent-runs.js', 'job-agent-schedule.js']) {
  assert.match(apiSources[route], /auth\.subject/, `${route} must resolve tenant ownership from the authenticated subject.`);
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const trackedSensitiveFiles = tracked.filter(file => /(?:^|\/)(?:\.env(?!\.example)|[^/]+\.(?:pem|key|p12|pfx))$/i.test(file));
assert.deepEqual(trackedSensitiveFiles, [], 'Tracked secret-bearing environment or key files are forbidden.');
const sourceFiles = tracked.filter(file => /^(?:api|lib|1ststep-extension)\/.+\.(?:js|json)$/.test(file) || /^[^/]+\.(?:js|html)$/.test(file));
const highConfidenceSecret = /(?:sk_(?:live|test)_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s@]+@)/;
const currentSourceEntries = [];
for (const file of sourceFiles) {
  const source = await read(file).catch(() => null);
  if (source === null) continue;
  currentSourceEntries.push([file, source]);
  assert.doesNotMatch(source, highConfidenceSecret, `${file} contains a high-confidence hardcoded secret pattern.`);
}
const clientBundle = [await read('api/app-config.js'), await read('concierge.js'), await read('1ststep-extension/background.js'), await read('1ststep-extension/content.js')].join('\n');
assert.doesNotMatch(clientBundle, /(?:STRIPE_SECRET_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|TIER_SECRET|BETA_DATA_ENCRYPTION_KEY|CRON_SECRET|JOB_AGENT_EXTENSION_HANDOFF_SECRET|CLERK_SECRET_KEY|CLERK_JWT_KEY|DATABASE_URL|CLOUDFLARE_R2_SECRET_ACCESS_KEY)/);

const packageJson = JSON.parse(await read('package.json'));
for (const [name, version] of Object.entries({ ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) })) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `${name} must be pinned to an exact version.`);
}
assert.equal(packageJson.packageManager, undefined, 'Unreviewed package-manager indirection is forbidden.');
const lock = JSON.parse(await read('package-lock.json'));
assert.ok(Number(lock.lockfileVersion) >= 3 && lock.packages?.[''], 'An npm lockfile v3 root record is required.');
assert.deepEqual(lock.packages[''].dependencies, packageJson.dependencies);
assert.deepEqual(lock.packages[''].devDependencies, packageJson.devDependencies);
assert.doesNotMatch(JSON.stringify(packageJson), /(?:git\+|https?:\/\/|file:)/);

const unapprovedDatabaseImports = /(?:from\s+['"](?:pg|mysql2?|sqlite3?|mongoose|sequelize|@prisma\/client)['"]|require\(['"](?:pg|mysql2?|sqlite3?|mongoose|sequelize|@prisma\/client)['"]\))/;
const productionSource = currentSourceEntries.map(([, source]) => source).join('\n');
const backendSource = currentSourceEntries.filter(([file]) => /^(?:api|lib)\/.+\.js$/.test(file)).map(([, source]) => source).join('\n');
assert.doesNotMatch(productionSource, unapprovedDatabaseImports, 'Only the reviewed Neon serverless client is approved for the relational migration foundation.');
assert.doesNotMatch(backendSource, /(?:\.query|\.execute|\$queryRaw|\$executeRaw)\(\s*`[^`]*\$\{/i, 'Interpolated raw database query construction is forbidden.');
const postgresStore = await read('lib/postgres-tenant-store.js');
const clerkIdentity = await read('lib/clerk-identity.js');
const r2Storage = await read('lib/cloudflare-r2-private-storage.js');
const postgresMigration = await read('migrations/001_job_agent_authoritative_store.sql');
const learningMigration = await read('migrations/002_job_agent_continuous_improvement.sql');
assert.match(postgresStore, /from '@neondatabase\/serverless'/);
assert.match(postgresStore, /sql`select set_config\('app\.tenant_id'/);
assert.doesNotMatch(postgresStore, /\.query\(|\.unsafe\(|stringify\(.*sql/i, 'The Neon integration must use parameterized tagged templates only.');
assert.match(postgresMigration, /force row level security/);
assert.match(postgresMigration, /revoke all on all tables in schema public from public/);
assert.match(learningMigration, /force row level security/);
assert.match(learningMigration, /revoke all on candidate_preferences/);
assert.match(clerkIdentity, /authorizedParties/);
assert.match(clerkIdentity, /verification\?\.status/);
assert.doesNotMatch(clerkIdentity, /console\.(?:log|error|warn)/);
assert.match(r2Storage, /IfNoneMatch: options\.allowOverwrite === false \? '\*'/);
assert.doesNotMatch(r2Storage, /ACL:\s*['"]public/i);

const vercel = JSON.parse(await read('vercel.json'));
const globalHeaders = Object.fromEntries(vercel.headers.find(item => item.source === '/(.*)').headers.map(item => [item.key.toLowerCase(), item.value]));
for (const key of ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy']) assert.ok(globalHeaders[key], `${key} is required.`);
assert.match(globalHeaders['strict-transport-security'], /includeSubDomains/);
assert.equal(globalHeaders['x-frame-options'], 'DENY');
const conciergeHeaders = vercel.headers.filter(item => ['/concierge', '/concierge.html'].includes(item.source));
assert.equal(conciergeHeaders.length, 2);
for (const entry of conciergeHeaders) {
  const csp = entry.headers.find(item => item.key === 'Content-Security-Policy')?.value || '';
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
}
assert.equal(tracked.some(file => file.endsWith('.map')), false, 'Production source maps must not be tracked for deployment.');

const responseLeak = /res\.status\([^)]*\)\.(?:json|send)\([^\n]*(?:err\.message|error\.message)/;
const sensitiveLog = /console\.(?:log|error|warn)\([^\n]*(?:contact\.email|customer\.(?:id|email)|JSON\.stringify\((?:data|body|payload|contact|customer)|body\.slice|errorBody)/;
for (const [file, source] of Object.entries(apiSources)) {
  assert.doesNotMatch(source, responseLeak, `${file} returns an internal exception message to the client.`);
  assert.doesNotMatch(source, sensitiveLog, `${file} logs raw upstream or person-linked values.`);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)\([^\n]*(?:password|otp|captcha|accessToken|refreshToken)/i, `${file} may log secret-bearing values.`);
}

console.log(JSON.stringify({
  schemaVersion: 1,
  review: 'sherlock-seven-security-prompts',
  passed: true,
  categories: {
    authentication: { passed: true, passwordStorage: 'not-applicable-passwordless-and-provider-auth', opaqueRevocableSessions: true },
    authorization: { passed: true, explicitlyReviewedRoutes: routes.length, tenantOwnershipFromAuthenticatedSubject: true },
    secrets: { passed: true, trackedSensitiveFiles: 0, highConfidenceSourceMatches: 0 },
    injection: { passed: true, databaseModel: 'redis-coordination-plus-disabled-neon-tenant-store', sqlClients: 1, parameterizedTaggedTemplates: true, forcedTenantRls: true },
    headers: { passed: true, strictConciergeCsp: true, sourceMapsTracked: false },
    dependencies: { passed: true, exactDirectVersions: true, lockfileVersion: lock.lockfileVersion },
    errorHandling: { passed: true, rawExceptionResponses: 0, rawPersonLinkedLogs: 0 },
  },
}));
