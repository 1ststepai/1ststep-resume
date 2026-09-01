import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyApplicationAuditHeadExport } from '../lib/application-audit-head-export.js';

const inputPath = String(process.argv[2] || '').trim();
const exportSigningSecret = String(process.env.JOB_AGENT_AUDIT_EXPORT_SECRET || '');

if (!inputPath) {
  console.error('Usage: npm run security:verify-audit-head -- <audit-head-export.json>');
  process.exit(2);
}

if (exportSigningSecret.length < 32) {
  console.error('JOB_AGENT_AUDIT_EXPORT_SECRET must contain at least 32 characters.');
  process.exit(2);
}

try {
  const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const result = verifyApplicationAuditHeadExport(input, exportSigningSecret);
  console.log(JSON.stringify(result, null, 2));
  if (!result.verified) process.exitCode = 1;
} catch (error) {
  console.error(`Audit-head verification failed: ${String(error?.message || error)}`);
  process.exitCode = 1;
}
