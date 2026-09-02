import { auditVercelEnvironmentNames } from '../lib/vercel-environment-name-audit.js';

const environmentIndex = process.argv.indexOf('--environment');
const environment = environmentIndex >= 0 ? process.argv[environmentIndex + 1] : 'production';
try {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) throw new Error('Vercel environment inventory exceeds the bounded input limit.');
    chunks.push(chunk);
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  process.stdout.write(`${JSON.stringify(auditVercelEnvironmentNames(payload, { environment }), null, 2)}\n`);
} catch {
  process.stderr.write('Vercel environment name audit failed without emitting inventory values.\n');
  process.exitCode = 1;
}
