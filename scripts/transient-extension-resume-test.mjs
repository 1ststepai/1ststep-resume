import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildTransientExtensionResume } from '../lib/transient-extension-resume.js';

const resumeText = `Jordan Example
Procurement Manager
New Jersey | jordan@example.test

PROFESSIONAL SUMMARY
Procurement professional with more than ten years of experience in strategic sourcing, supplier negotiations, competitive bidding, and contract execution.

EXPERIENCE
Example Manufacturing
Senior Procurement Analyst
- Managed competitive sourcing events and supplier negotiations.
- Coordinated engineering, operations, finance, and vendors.
- Improved purchasing controls and documented award decisions.

EDUCATION
Bachelor of Science

SKILLS
Strategic sourcing; supplier management; contract negotiation; spend analysis`;
const session = {
  documentVersion: 'resume-reviewed-v1',
  role: { employer: 'Fixture Company', title: 'Procurement Manager' },
};
const run = {
  taskType: 'application_package', status: 'Finished', result: {
    documentVersion: session.documentVersion,
    resumeText,
    resumeSha256: createHash('sha256').update(resumeText).digest('hex'),
    qa: { issues: [] },
  },
};

const first = await buildTransientExtensionResume(run, session);
const second = await buildTransientExtensionResume(run, session);
assert.equal(first.delivery, 'transient-reviewed-source');
assert.equal(first.artifact.contentType, 'application/pdf');
assert.equal(first.artifact.bytes, first.bytes.length);
assert.equal(first.artifact.sha256, createHash('sha256').update(first.bytes).digest('hex'));
assert.equal(first.artifact.sha256, second.artifact.sha256, 'transient PDF must be reproducible across prepare and document calls');
assert.deepEqual(first.bytes, second.bytes);
await assert.rejects(() => buildTransientExtensionResume({ ...run, result: { ...run.result, resumeSha256: 'f'.repeat(64) } }, session), /RESUME_NOT_READY/);
await assert.rejects(() => buildTransientExtensionResume({ ...run, status: 'Waiting for You' }, session), /RESUME_NOT_READY/);

console.log('Reviewed text-only packages produce reproducible integrity-checked extension PDFs without object storage.');
