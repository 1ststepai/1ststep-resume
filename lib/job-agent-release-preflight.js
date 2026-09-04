import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const RELEASE_FILES = Object.freeze([
  'package.json', 'package-lock.json', 'vercel.json', '.vercelignore',
  'index.html', 'app.js', 'style.css', 'concierge.html', 'concierge.js', 'persistent-concierge.css',
  'admin.html', 'funnel.html', 'pricing.html', 'privacy.html', 'terms.html', 'resume-builder.js',
]);
const RELEASE_DIRECTORIES = Object.freeze(['api', 'lib']);
const HASHED_ACCEPTANCE_FILES = Object.freeze(['index.html', 'app.js', 'concierge.html', 'concierge.js']);
const REQUIRED_IGNORE_RULES = Object.freeze(['.env*', '.mcp.json', 'node_modules/', 'docs/', 'scripts/', 'sandbox/', 'test-results/', 'projects/', '1ststep-extension/']);

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function normalizedPath(root, path) { return relative(root, path).split(sep).join('/'); }

async function runtimeFiles(root) {
  const files = [];
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Runtime release surface contains a symbolic link: ${normalizedPath(root, child)}`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  for (const file of RELEASE_FILES) files.push(join(root, file));
  for (const directory of RELEASE_DIRECTORIES) await visit(join(root, directory));
  return [...new Set(files)].sort((left, right) => normalizedPath(root, left).localeCompare(normalizedPath(root, right)));
}

async function gitLines(root, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  return String(stdout).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

export async function currentGitReleaseSnapshot(root) {
  const [branch, head, unstaged, staged, untracked] = await Promise.all([
    gitLines(root, ['branch', '--show-current']), gitLines(root, ['rev-parse', 'HEAD']),
    gitLines(root, ['diff', '--name-only']), gitLines(root, ['diff', '--cached', '--name-only']),
    gitLines(root, ['ls-files', '--others', '--exclude-standard']),
  ]);
  const digest = values => sha256([...values].sort().join('\n'));
  return {
    branch: branch[0] || 'detached', head: head[0] || null,
    unstagedCount: unstaged.length, stagedCount: staged.length, untrackedCount: untracked.length,
    unstagedPathDigest: digest(unstaged), stagedPathDigest: digest(staged), untrackedPathDigest: digest(untracked),
  };
}

export async function buildJobAgentReleasePreflight({ root = process.cwd(), gitSnapshot } = {}) {
  const repositoryRoot = resolve(root);
  const issues = [];
  const snapshot = gitSnapshot || await currentGitReleaseSnapshot(repositoryRoot);
  if (snapshot.unstagedCount) issues.push('WORKTREE_HAS_UNSTAGED_CHANGES');
  if (snapshot.stagedCount) issues.push('WORKTREE_HAS_STAGED_CHANGES');
  if (snapshot.untrackedCount) issues.push('WORKTREE_HAS_UNTRACKED_FILES');
  let ignoreRules = [];
  try { ignoreRules = (await readFile(join(repositoryRoot, '.vercelignore'), 'utf8')).split(/\r?\n/).map(value => value.trim()).filter(Boolean); } catch { issues.push('VERCELIGNORE_MISSING'); }
  for (const rule of REQUIRED_IGNORE_RULES) if (!ignoreRules.includes(rule)) issues.push(`VERCELIGNORE_RULE_MISSING:${rule}`);
  if (ignoreRules.some(rule => /^!\.env/i.test(rule))) issues.push('VERCELIGNORE_ENV_REINCLUSION_FORBIDDEN');

  const entries = [];
  const keyHashes = {};
  try {
    for (const path of await runtimeFiles(repositoryRoot)) {
      const stat = await lstat(path);
      if (!stat.isFile()) throw new Error(`Release path is not a regular file: ${normalizedPath(repositoryRoot, path)}`);
      const bytes = await readFile(path);
      const name = normalizedPath(repositoryRoot, path);
      const hash = sha256(bytes);
      entries.push({ name, bytes: bytes.length, sha256: hash });
      if (HASHED_ACCEPTANCE_FILES.includes(name)) keyHashes[name] = hash;
    }
  } catch (error) {
    issues.push('RUNTIME_SURFACE_INVALID');
    issues.push(`RUNTIME_SURFACE_REASON:${sha256(String(error.message || error)).slice(0, 16)}`);
  }
  const runtimeDigest = sha256(entries.map(entry => `${entry.name}\0${entry.bytes}\0${entry.sha256}`).join('\n'));
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), ok: issues.length === 0,
    contentFree: true, containsCandidateValues: false, performsWrites: false, deploys: false,
    git: snapshot,
    runtime: { fileCount: entries.length, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), sha256: runtimeDigest, keyHashes },
    ignorePolicy: { configured: ignoreRules.length > 0, requiredRuleCount: REQUIRED_IGNORE_RULES.length, verified: REQUIRED_IGNORE_RULES.every(rule => ignoreRules.includes(rule)) },
    issues,
  };
}
