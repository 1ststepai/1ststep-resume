import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildJobAgentLaunchEvidence, JOB_AGENT_LAUNCH_EVIDENCE_KINDS } from '../lib/job-agent-launch-evidence.js';
import { buildJobAgentReleasePreflight } from '../lib/job-agent-release-preflight.js';
import { verifyJobAgentControlledBetaReleaseRecord } from '../lib/job-agent-release-record.js';

function argumentsByName(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = String(values[index] || '');
    if (!key.startsWith('--') || values[index + 1] === undefined) throw new Error('Arguments must use --name value pairs.');
    result[key.slice(2)] = values[index + 1];
  }
  return result;
}

const args = argumentsByName(process.argv.slice(2));
if (args.confirm !== 'RETAINED_EXTERNAL_EVIDENCE_REVIEWED') {
  throw new Error('Refusing to sign without --confirm RETAINED_EXTERNAL_EVIDENCE_REVIEWED.');
}
if (!JOB_AGENT_LAUNCH_EVIDENCE_KINDS.includes(args.kind)) {
  throw new Error(`--kind must be one of: ${JOB_AGENT_LAUNCH_EVIDENCE_KINDS.join(', ')}`);
}
const artifactPath = resolve(String(args.artifact || ''));
const artifact = await readFile(artifactPath);
if (!artifact.length) throw new Error('The retained evidence artifact is empty.');
if (args.kind === 'controlled-beta-release') {
  const preflight = await buildJobAgentReleasePreflight();
  const verification = verifyJobAgentControlledBetaReleaseRecord(artifact, { preflight });
  if (!verification.verified) throw new Error(`Refusing to sign an invalid controlled-beta release record (${verification.reason}).`);
}
const envelope = buildJobAgentLaunchEvidence({
  kind: args.kind,
  verifiedAt: args['verified-at'],
  evidenceId: args['evidence-id'],
  artifactSha256: createHash('sha256').update(artifact).digest('hex'),
});

process.stdout.write(`${JSON.stringify(envelope)}\n`);
