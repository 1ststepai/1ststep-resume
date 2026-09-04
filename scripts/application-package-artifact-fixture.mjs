import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildApplicationPackageArtifacts } from '../lib/application-package-artifacts.js';

const outputDir = resolve(process.argv[2] || 'tmp/application-package-artifact-fixture');
const experience = Array.from({ length: 28 }, (_, index) => `- Managed verified supplier relationship and contract workflow ${index + 1} across cross-functional business teams with clear status reporting.`).join('\n');
const resumeText = `JORDAN EXAMPLE
jordan@example.test | 555-010-2000 | New Jersey

PROFESSIONAL SUMMARY
Procurement professional with verified experience in strategic sourcing, supplier negotiations, contract workflows, and stakeholder partnership.

PROFESSIONAL EXPERIENCE
Procurement Manager | Example Corporation | 2021-Present
${experience}

EDUCATION
Example University | Bachelor of Arts | 2021

SKILLS
Strategic sourcing, supplier negotiations, contract workflows, stakeholder communication, and spreadsheet analysis.`;
const coverLetterText = `Dear Hiring Team,

I am applying for the Procurement Manager role at Example Employer. My background includes verified work in strategic sourcing, supplier negotiations, contract workflows, and cross-functional stakeholder partnership.

At Example Corporation, I managed supplier relationships and contract workflows while keeping business teams informed through clear status reporting. That experience aligns with the practical judgment and communication expected in this role.

I would welcome the opportunity to discuss how this background can support Example Employer's procurement organization.

Sincerely,
Jordan Example`;

const result = await buildApplicationPackageArtifacts({
  employer: 'Example Employer', title: 'Procurement Manager', documentVersion: 'fixture-v1', resumeText, coverLetterText,
});
await mkdir(outputDir, { recursive: true });
for (const artifact of result.artifacts) await writeFile(resolve(outputDir, artifact.filename), Buffer.from(artifact.contentBase64, 'base64'));
await writeFile(resolve(outputDir, 'qa.json'), `${JSON.stringify({ qa: result.qa, artifacts: result.artifacts.map(({ contentBase64: _contentBase64, ...metadata }) => metadata) }, null, 2)}\n`);
console.log(JSON.stringify({ outputDir, qa: result.qa, files: result.artifacts.map(artifact => artifact.filename) }));
