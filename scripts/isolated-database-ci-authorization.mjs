import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ISOLATED_TARGET_CONFIRMATION } from './isolated-data-readiness-preflight.mjs';

// CI scheduling only. Never relax the production or read-only readiness gates.
export function isolatedDatabaseCiAuthorization(env = process.env) {
  const target = env.JOB_AGENT_ISOLATED_TARGET_KIND || '';
  const confirmation = env.JOB_AGENT_ISOLATED_TARGET_CONFIRMATION || '';
  if ((target === '' || target === 'none') && confirmation === '') {
    return { authorized: false, reason: 'No isolated target authorized; drill skipped. This is not database verification evidence.' };
  }
  if (target !== 'local-supabase' || confirmation !== ISOLATED_TARGET_CONFIRMATION) {
    throw new Error('Invalid isolated target authorization. Select local-supabase and provide the exact nonproduction confirmation.');
  }
  return { authorized: true, reason: 'Disposable local Supabase drill authorized. All verification checks remain required.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = isolatedDatabaseCiAuthorization();
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `authorized=${result.authorized}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.reason}\n`);
    console.log(result.reason);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
