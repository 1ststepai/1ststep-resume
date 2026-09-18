#!/usr/bin/env node
/**
 * Collect factual Git state for Cursor ↔ Codex handoff.
 *
 * Writes:
 *   docs/agents/GIT-STATE.md          (generated; safe to overwrite)
 *   <!-- git-state:start --> blocks in CURRENT-STATE.md and HANDOFF.md
 *
 * Never writes:
 *   docs/agents/DECISIONS.md
 *   docs/agents/NEXT-ACTIONS.md
 *   agent-authored task/decision fields outside git-state markers
 *
 * Usage:
 *   node scripts/agent-handoff-status.mjs
 *   node scripts/agent-handoff-status.mjs --current-only
 *   node scripts/agent-handoff-status.mjs --print
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const agentsDir = join(root, 'docs', 'agents');
const gitStatePath = join(agentsDir, 'GIT-STATE.md');
const currentStatePath = join(agentsDir, 'CURRENT-STATE.md');
const handoffPath = join(agentsDir, 'HANDOFF.md');
const protectedPaths = [
  join(agentsDir, 'DECISIONS.md'),
  join(agentsDir, 'NEXT-ACTIONS.md'),
];

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  console.log(`Collect factual Git state for docs/agents/GIT-STATE.md.

  --current-only   Skip sibling worktree dirty scans
  --print          Print snapshot to stdout; still writes GIT-STATE.md
  --check          Exit 1 if git-state markers or required files are missing
`);
  process.exit(0);
}

const MARKER_START = '<!-- git-state:start -->';
const MARKER_END = '<!-- git-state:end -->';

function git(gitArgs, cwd = root) {
  return execFileSync('git', gitArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitOr(gitArgs, fallback = '', cwd = root) {
  try {
    return git(gitArgs, cwd);
  } catch {
    return fallback;
  }
}

function parseWorktrees(porcelain) {
  const trees = [];
  let current = null;
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) trees.push(current);
      current = { path: line.slice('worktree '.length), head: '', branch: 'detached', bare: false };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.branch = 'detached';
    }
  }
  if (current) trees.push(current);
  return trees;
}

function dirtyFiles(cwd) {
  try {
    const porcelain = git(['status', '--porcelain'], cwd);
    if (!porcelain) return [];
    return porcelain.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    return [`(git status failed: ${error.message.split('\n')[0]})`];
  }
}

function replaceMarker(filePath, innerMarkdown) {
  const original = readFileSync(filePath, 'utf8');
  const start = original.indexOf(MARKER_START);
  const end = original.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${filePath} is missing ${MARKER_START} ... ${MARKER_END} markers. Refusing to guess where Git state belongs.`);
  }
  const before = original.slice(0, start + MARKER_START.length);
  const after = original.slice(end);
  const next = `${before}\n${innerMarkdown.trim()}\n${after}`;
  if (next !== original) writeFileSync(filePath, next);
}

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : '(unknown)';
}

function capture() {
  const capturedAt = new Date().toISOString();
  const branch = gitOr(['branch', '--show-current'], '(detached)');
  const head = gitOr(['rev-parse', 'HEAD']);
  const remotes = gitOr(['remote', '-v']);
  const originUrl = gitOr(['remote', 'get-url', 'origin']);
  const upstream = gitOr(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const aheadBehind = upstream
    ? gitOr(['rev-list', '--left-right', '--count', `${upstream}...HEAD`])
    : '';
  const statusBranch = gitOr(['status', '--short', '--branch']);
  const currentDirty = dirtyFiles(root);
  const recent = gitOr(['log', '-12', '--oneline', '--decorate']);
  const worktreePorcelain = gitOr(['worktree', 'list', '--porcelain']);
  const worktrees = parseWorktrees(worktreePorcelain);
  const originMain = gitOr(['rev-parse', 'origin/main']);
  let mainAncestor = false;
  if (originMain) {
    try {
      git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
      mainAncestor = true;
    } catch {
      mainAncestor = false;
    }
  }

  const dirtyWorktrees = [];
  if (!args.has('--current-only')) {
    for (const tree of worktrees) {
      if (tree.bare) continue;
      const files = dirtyFiles(tree.path);
      if (files.length) {
        dirtyWorktrees.push({
          path: tree.path,
          branch: tree.branch,
          head: tree.head,
          files,
        });
      }
    }
  } else if (currentDirty.length) {
    dirtyWorktrees.push({
      path: root,
      branch,
      head,
      files: currentDirty,
    });
  }

  let ahead = '';
  let behind = '';
  if (aheadBehind) {
    const [left, right] = aheadBehind.split(/\s+/);
    behind = left || '0';
    ahead = right || '0';
  }

  return {
    capturedAt,
    root,
    branch: branch || '(detached)',
    head,
    originUrl,
    remotes,
    upstream: upstream || '(none)',
    ahead,
    behind,
    statusBranch,
    currentDirty,
    recent,
    worktrees,
    dirtyWorktrees,
    originMain,
    mainAncestor,
  };
}

function renderGitState(s) {
  const dirtyList = s.dirtyWorktrees.length
    ? s.dirtyWorktrees.map((tree) => {
      const files = tree.files.slice(0, 20).map((line) => `    - \`${line}\``).join('\n');
      const extra = tree.files.length > 20 ? `\n    - … ${tree.files.length - 20} more` : '';
      return `- \`${tree.path}\` (${tree.branch} ${shortSha(tree.head)})\n${files}${extra}`;
    }).join('\n')
    : '- none';
  const worktreeList = s.worktrees.map((tree) => `- \`${tree.path}\` ${tree.branch} \`${shortSha(tree.head)}\``).join('\n');
  const dirtyFilesList = s.currentDirty.length
    ? s.currentDirty.map((line) => `- \`${line}\``).join('\n')
    : '- none';
  return `# GIT-STATE (generated)

Do not edit this file by hand. Regenerated by \`npm run agent:handoff-status\`.
This snapshot is Git fact only. It does not record tasks, decisions, or next actions.

- Captured at: \`${s.capturedAt}\`
- Repository root: \`${s.root}\`
- Canonical remote: \`origin\` ${s.originUrl || '(missing)'}
- Current branch: \`${s.branch}\`
- HEAD SHA: \`${s.head}\`
- Upstream: \`${s.upstream}\`
- Ahead of upstream: \`${s.ahead || 'n/a'}\`
- Behind upstream: \`${s.behind || 'n/a'}\`
- origin/main: \`${s.originMain || '(missing)'}\`
- origin/main is ancestor of HEAD: \`${s.mainAncestor}\`

## Status

\`\`\`
${s.statusBranch || '(clean)'}
\`\`\`

## Dirty files in this worktree

${dirtyFilesList}

## Worktrees

${worktreeList || '- none'}

## Dirty worktrees

${dirtyList}

## Recent commits

\`\`\`
${s.recent || '(none)'}
\`\`\`
`;
}

function renderMarker(s) {
  const dirty = s.currentDirty.length ? s.currentDirty.join('; ') : 'none';
  const dirtyTrees = s.dirtyWorktrees.length
    ? s.dirtyWorktrees.map((tree) => `${tree.branch}@${shortSha(tree.head)} (${tree.files.length} dirty)`).join('; ')
    : 'none in scanned worktrees';
  return [
    `- Captured at: \`${s.capturedAt}\``,
    `- This worktree: \`${s.root}\``,
    `- Active branch: \`${s.branch}\``,
    `- HEAD SHA: \`${s.head}\``,
    `- Upstream: \`${s.upstream}\``,
    `- Ahead/behind upstream: \`${s.ahead || 'n/a'}\`/\`${s.behind || 'n/a'}\``,
    `- origin/main: \`${s.originMain || '(missing)'}\``,
    `- Dirty files in this worktree: \`${dirty}\``,
    `- Worktree count: \`${s.worktrees.length}\``,
    `- Dirty worktrees: \`${dirtyTrees}\``,
  ].join('\n');
}

function checkRequiredFiles() {
  const missing = [];
  for (const rel of [
    'AGENTS.md',
    'docs/agents/CURRENT-STATE.md',
    'docs/agents/NEXT-ACTIONS.md',
    'docs/agents/DECISIONS.md',
    'docs/agents/HANDOFF.md',
  ]) {
    try {
      readFileSync(join(root, rel), 'utf8');
    } catch {
      missing.push(rel);
    }
  }
  if (missing.length) {
    throw new Error(`Missing handoff files: ${missing.join(', ')}`);
  }
  for (const filePath of [currentStatePath, handoffPath]) {
    const text = readFileSync(filePath, 'utf8');
    if (!text.includes(MARKER_START) || !text.includes(MARKER_END)) {
      throw new Error(`${filePath} is missing git-state markers`);
    }
  }
}

if (args.has('--check')) {
  checkRequiredFiles();
  console.log('agent-handoff-status: required files and git-state markers present.');
  process.exit(0);
}

checkRequiredFiles();
mkdirSync(agentsDir, { recursive: true });
const snapshot = capture();
const generated = renderGitState(snapshot);
writeFileSync(gitStatePath, generated);
if (args.has('--print')) process.stdout.write(generated);

const marker = renderMarker(snapshot);
replaceMarker(currentStatePath, marker);
replaceMarker(handoffPath, marker);

console.log(`Wrote ${gitStatePath}`);
console.log(`Updated git-state markers in CURRENT-STATE.md and HANDOFF.md`);
console.log(`Left untouched: ${protectedPaths.join(', ')}`);
console.log(`HEAD ${snapshot.head} on ${snapshot.branch}`);
console.log(`Dirty files in this worktree: ${snapshot.currentDirty.length ? snapshot.currentDirty.length : 0}`);
console.log(`Dirty worktrees scanned: ${snapshot.dirtyWorktrees.length}`);
