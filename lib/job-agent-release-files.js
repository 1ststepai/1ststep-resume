import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { contentDigest } from './job-agent-release-evidence.js';

export function gitValue(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function filesUnder(root, path) {
  const absolute = resolve(root, path);
  const entries = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.DS_Store' || entry.name.endsWith('.zip')) continue;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else entries.push(fullPath);
    }
  }
  await walk(absolute);
  return entries.sort();
}

export async function directoryDigest(root, paths) {
  const entries = [];
  for (const path of paths) {
    for (const file of await filesUnder(root, path)) {
      entries.push({
        path: relative(root, file),
        sha256: createHash('sha256').update(await readFile(file)).digest('hex'),
      });
    }
  }
  return contentDigest(entries);
}

export async function localReleaseIdentity(root, env = process.env) {
  const extensionManifest = JSON.parse(await readFile(resolve(root, '1ststep-extension/manifest.json'), 'utf8'));
  return {
    commit: gitValue(root, 'rev-parse', 'HEAD'),
    dirty: gitValue(root, 'status', '--porcelain').length > 0,
    buildDigest: await directoryDigest(root, [env.JOB_AGENT_BUILD_DIRECTORY || '.public-web']),
    migrationDigest: await directoryDigest(root, ['migrations', 'supabase/migrations']),
    extensionVersion: extensionManifest.version,
    extensionDigest: await directoryDigest(root, ['1ststep-extension']),
  };
}
