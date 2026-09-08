import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safeAppReturnPath } from '../login.js';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const concierge = await readFile(new URL('../concierge.js', import.meta.url), 'utf8');
const conciergeHtml = await readFile(new URL('../concierge.html', import.meta.url), 'utf8');

const resumeRewrite = vercel.rewrites.find(rule => rule.source === '/app/resume');
assert.deepEqual(resumeRewrite, { source: '/app/resume', destination: '/concierge.html' });
assert.ok(vercel.redirects.some(rule => rule.source === '/app.html' && rule.destination === '/app/resume'));
assert.match(concierge, /function isResumeWorkspaceRoute/);
assert.match(concierge, /await hydrateAccountWorkflow\(\);\s*openRequestedAccountWorkspace\(\);/);
assert.match(concierge, /if \(!hasApiSession\(\) \|\| !hasJobAgentAccess\(\)\)/);
assert.match(concierge, /location\.replace\(`\/funnel\?\$\{query\.toString\(\)\}`\)/);
assert.match(concierge, /openResumeSetup\(\);/);
assert.match(conciergeHtml, />Resume and experience</);
assert.doesNotMatch(conciergeHtml, /Open full Resume Workspace/);
assert.match(conciergeHtml, /href="\/app">Back to Job Agent</);
assert.equal(safeAppReturnPath('/app/resume'), '/app/resume');
assert.equal(safeAppReturnPath('/concierge?view=resume'), '/concierge?view=resume');
assert.equal(safeAppReturnPath('//evil.example'), '/app');
assert.equal(safeAppReturnPath('/admin'), '/app');

console.log('Resume workspace consolidation checks passed: Job Agent route, signed-session gate, safe Clerk return, and canonical editor.');
