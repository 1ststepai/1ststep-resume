import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const release = path.resolve(root, 'output/clerk-production-20260906');
await mkdir(release, { recursive: true });
const archive = path.resolve(root, 'output/clerk-production-20260906.zip');
execFileSync('git', ['archive', '--format=zip', '-o', archive, 'HEAD'], { cwd: root });
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${release.replaceAll("'", "''")}' -Force`]);
const files = ['api/subscription.js','api/user-session.js','lib/public-authentication-configuration.js','build-public-web.mjs','concierge.js','concierge.html','login.html','login.js','login.css','scripts/clerk-identity-test.mjs','scripts/clerk-subscription-test.mjs','scripts/app-config-test.mjs'];
for (const file of files) await copyFile(path.join(root,file),path.join(release,file));
// Preserve the baseline security configuration and add only the login-page policy.
const config = JSON.parse(execFileSync('git', ['show','HEAD:vercel.json'], { cwd: root, encoding:'utf8' }));
const current = JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
config.headers.splice(1,0,current.headers.find(item=>item.source==='/login.html'));
await writeFile(path.join(release,'vercel.json'),JSON.stringify(config,null,2)+'\n');
// Update the existing pricing expectation without copying unrelated pending tests.
const test = await readFile(path.join(release,'scripts/concierge-test.mjs'),'utf8');
await writeFile(path.join(release,'scripts/concierge-test.mjs'),test.replace('/Dedicated pricing is being measured/','/Job Agent: \\$39\\/month\\./'));
await mkdir(path.join(release,'.vercel'),{recursive:true});
await copyFile(path.join(root,'.vercel/project.json'),path.join(release,'.vercel/project.json'));
await writeFile(path.join(release,'RELEASE_SCOPE.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files,configuration:'login.html policy only',excluded:'unrelated uncommitted vault, CSS, analytics CSP and test changes'},null,2));
console.log(release);
