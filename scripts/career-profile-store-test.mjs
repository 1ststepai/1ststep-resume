import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLegacyCareerProfilePlan, publicLegacyCareerProfilePlan, reconcileLegacyPlanAgainstCanonical } from '../lib/career-profile-legacy-reconciliation.js';
import { careerProfilePostgresConfiguration } from '../lib/career-profile-postgres-store.js';

assert.equal(careerProfilePostgresConfiguration({}).reason, 'CAREER_PROFILE_PREVIEW_ONLY');
assert.equal(careerProfilePostgresConfiguration({ VERCEL_ENV: 'production', CAREER_PROFILE_PREVIEW_ENABLED: 'true', JOB_AGENT_POSTGRES_ENABLED: 'true', DATABASE_URL: 'postgres://example' }).reason, 'CAREER_PROFILE_PREVIEW_ONLY');
assert.equal(careerProfilePostgresConfiguration({ VERCEL_ENV: 'preview' }).reason, 'CAREER_PROFILE_PREVIEW_DISABLED');
assert.equal(careerProfilePostgresConfiguration({ VERCEL_ENV: 'preview', CAREER_PROFILE_PREVIEW_ENABLED: 'true' }).reason, 'POSTGRES_DISABLED');
assert.equal(careerProfilePostgresConfiguration({ VERCEL_ENV: 'preview', CAREER_PROFILE_PREVIEW_ENABLED: 'true', JOB_AGENT_POSTGRES_ENABLED: 'true' }).reason, 'DATABASE_URL_MISSING');
assert.equal(careerProfilePostgresConfiguration({ VERCEL_ENV: 'preview', CAREER_PROFILE_PREVIEW_ENABLED: 'true', JOB_AGENT_POSTGRES_ENABLED: 'true', DATABASE_URL: 'postgres://example' }, () => ({})).ready, true);

const vault = { facts: [
  { id: 'legacy-skills', fieldKey: 'skills', status: 'active', currentVersion: 1, versions: [{ version: 1, value: 'Procurement', provenance: 'candidate-reviewed', confidence: 1, verificationState: 'user-confirmed', confirmedAt: '2026-09-09T12:00:00.000Z', autoReuse: true, scope: { global: true } }] },
  { id: 'legacy-location', fieldKey: 'location', status: 'active', currentVersion: 1, versions: [{ version: 1, value: 'New Jersey', provenance: 'legacy', confidence: 1, verificationState: 'user-confirmed', confirmedAt: '2026-09-09T12:00:00.000Z' }] },
  { id: 'legacy-memory', fieldKey: 'memory_example', status: 'active', currentVersion: 1, versions: [{ version: 1, value: 'Never import', verificationState: 'user-confirmed' }] },
  { id: 'legacy-demo', fieldKey: 'demographics', status: 'active', currentVersion: 1, versions: [{ version: 1, value: 'Prefer not to answer', provenance: 'legacy', confidence: 1, verificationState: 'user-confirmed', confirmedAt: '2026-09-09T12:00:00.000Z' }] },
] };
const plan = buildLegacyCareerProfilePlan(vault);
assert.equal(plan.importable.length, 1);
assert.equal(plan.importable[0].value, 'Procurement');
assert.equal(plan.importable[0].sourceType, 'legacy-import');
assert.match(plan.importable[0].idempotencySeed, /^[a-f0-9]{64}$/);
assert.deepEqual(plan.reconcile[0].targetFields, ['city', 'region', 'country']);
assert.equal(plan.excluded.length, 1);
const publicPlan = publicLegacyCareerProfilePlan(plan, 7);
assert.equal(JSON.stringify(publicPlan).includes('Procurement'), false);
assert.equal(JSON.stringify(publicPlan).includes('candidate-reviewed'), false);
assert.equal(publicPlan.createsReuseGrants, false);
assert.equal(publicPlan.destructive, false);
const reconciled = reconcileLegacyPlanAgainstCanonical(plan, [{ fieldKey: 'skills', value: 'Canonical value must win' }]);
assert.equal(reconciled.importable.length, 0, 'existing canonical facts must never be overwritten by a legacy import');
assert.deepEqual(reconciled.alreadyPresent, [{ legacyFactId: 'legacy-skills', fieldKey: 'skills', legacyFactVersion: 1, reason: 'CAREER_PROFILE_FACT_ALREADY_PRESENT' }]);
assert.equal(JSON.stringify(reconciled.alreadyPresent).includes('Canonical value'), false, 'already-present analysis must remain value-free');

const [api, store] = await Promise.all([
  readFile(new URL('../api/career-profile-preview.js', import.meta.url), 'utf8'),
  readFile(new URL('../lib/career-profile-postgres-store.js', import.meta.url), 'utf8'),
]);
assert.match(api, /authenticateApiRequest\(req, \{ requireOpaqueSession: true \}\)/);
assert.match(api, /jobAgentPilotAccessForSubject/);
assert.match(api, /CAREER_PROFILE_PREVIEW/);
assert.match(api, /req\.body\?\.confirmed !== true/);
assert.match(store, /SET LOCAL ROLE job_agent_backend/);
assert.match(store, /set_config\('app\.tenant_id'/);
assert.match(store, /BEGIN ISOLATION LEVEL SERIALIZABLE/);
assert.match(store, /FOR UPDATE/);
assert.doesNotMatch(store, /INSERT INTO applicant_fact_reuse_scopes/i);

console.log('Preview-only Career Profile store and non-destructive legacy reconciliation boundaries passed.');
