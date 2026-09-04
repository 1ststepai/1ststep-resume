import { jobAgentTenantId } from '../lib/job-agent-run-store.js';

const partitionSecret = String(process.env.RATE_LIMIT_HASH_SECRET || process.env.TIER_SECRET || '');
if (partitionSecret.length < 32) {
  console.error('A 32-character tenant partition secret is required.');
  process.exit(1);
}
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const subject = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8').trim().toLowerCase();
if (!/^[^\s@|]{1,128}@[^\s@|]{1,190}$/.test(subject)) {
  console.error('Provide one candidate email through standard input.');
  process.exit(1);
}
console.log(JSON.stringify({ tenantId: jobAgentTenantId(subject, partitionSecret), containsRawSubject: false }));
