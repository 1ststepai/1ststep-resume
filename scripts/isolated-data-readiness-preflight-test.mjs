import assert from 'node:assert/strict';
import { isolatedDataReadinessPreflight, ISOLATED_TARGET_CONFIRMATION } from './isolated-data-readiness-preflight.mjs';

const available = (_command, _args) => ({ available: true, version: 'synthetic-version' });
const noDocker = (command, _args) => command === 'supabase'
  ? { available: true, version: 'synthetic-version' }
  : { available: false, version: null };

const missing = await isolatedDataReadinessPreflight({}, { commandResult: noDocker });
assert.equal(missing.contentFree, true);
assert.equal(missing.performsExternalCalls, false);
assert.equal(missing.writesExternalState, false);
assert.equal(missing.readyForAuthorizedReadOnlyAudit, false);
assert.equal(missing.isolatedTargetProven, false);
assert.equal(missing.tooling.supabaseCliVersion, 'synthetic-version');
assert(missing.blockers.includes('ISOLATED_TARGET_KIND_UNCONFIRMED'));
assert(missing.blockers.includes('NONPRODUCTION_ATTESTATION_MISSING'));

const sameRef = 'a'.repeat(20);
const unsafeManaged = await isolatedDataReadinessPreflight({
  JOB_AGENT_ISOLATED_TARGET_KIND: 'isolated-supabase-project',
  JOB_AGENT_ISOLATED_SUPABASE_PROJECT_REF: sameRef,
  JOB_AGENT_PRODUCTION_SUPABASE_PROJECT_REF: sameRef,
  JOB_AGENT_ISOLATED_TARGET_CONFIRMATION: ISOLATED_TARGET_CONFIRMATION,
}, { commandResult: available });
assert.equal(unsafeManaged.readyForAuthorizedReadOnlyAudit, false);
assert(unsafeManaged.blockers.includes('ISOLATED_TARGET_EQUALS_PRODUCTION'));

const isolatedRef = 'b'.repeat(20);
const productionRef = 'c'.repeat(20);
const managed = await isolatedDataReadinessPreflight({
  JOB_AGENT_ISOLATED_TARGET_KIND: 'isolated-supabase-project',
  JOB_AGENT_ISOLATED_SUPABASE_PROJECT_REF: isolatedRef,
  JOB_AGENT_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
  JOB_AGENT_ISOLATED_TARGET_CONFIRMATION: ISOLATED_TARGET_CONFIRMATION,
}, { commandResult: available });
assert.equal(managed.readyForAuthorizedReadOnlyAudit, true);
assert.equal(managed.operatorAttestationReady, true);
assert.equal(managed.isolatedTargetProven, false, 'A local preflight must never claim that a remote target was proven.');
assert.equal(managed.liveRlsVerified, false);
assert.equal(managed.backupRestoreVerified, false);
assert.equal(JSON.stringify(managed).includes(isolatedRef), false, 'Raw project references must not enter retained output.');
assert.equal(JSON.stringify(managed).includes(productionRef), false, 'The Production project reference must not enter retained output.');

const localUnavailable = await isolatedDataReadinessPreflight({
  JOB_AGENT_ISOLATED_TARGET_KIND: 'local-supabase',
  JOB_AGENT_ISOLATED_TARGET_CONFIRMATION: ISOLATED_TARGET_CONFIRMATION,
}, { commandResult: noDocker });
assert.equal(localUnavailable.readyForAuthorizedReadOnlyAudit, false);
assert(localUnavailable.blockers.includes('LOCAL_SUPABASE_RUNTIME_UNAVAILABLE'));

const localReady = await isolatedDataReadinessPreflight({
  JOB_AGENT_ISOLATED_TARGET_KIND: 'local-supabase',
  JOB_AGENT_ISOLATED_TARGET_CONFIRMATION: ISOLATED_TARGET_CONFIRMATION,
}, { commandResult: available });
assert.equal(localReady.readyForAuthorizedReadOnlyAudit, true);
assert.equal(localReady.isolatedTargetProven, false);

console.log('Content-free isolated data preflight binds the canonical digest, rejects Production-equivalent targets, requires explicit nonproduction attestation, and never claims live proof.');
