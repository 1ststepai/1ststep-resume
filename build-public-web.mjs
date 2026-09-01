import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, '.public-web');

const publicAssets = [
  'index.html',
  'app.html',
  'concierge.html',
  'pricing.html',
  'terms.html',
  'privacy.html',
  'funnel.html',
  'admin.html',
  'og-image.html',
  'demo-video-section.html',
  'extension-section.html',
  'style.css',
  'home.css',
  'persistent-concierge.css',
  'product-choice.css',
  'app.js',
  'home.js',
  'concierge.js',
  'resume-builder.js',
  'workday.js',
  'client/concierge-router.js',
  'client/concierge-domain.js',
  'client/job-intelligence.js',
  'client/job-mission-relevance.js',
  'client/interview-practice.js',
  'client/opportunity-paths.js',
  'client/subscriber-ui-model.js',
  'client/persistent-campaign.js',
  'client/prohibited-secret.js',
  'sitemap.xml',
  'robots.txt',
  '1ststep-logo.png',
  '1ststep-ai-icon.png',
  '1ststep_facebook_banner.jpg',
  '1ststep-app-image-ad.PNG',
  '1ststep-banner-linkedin.png',
  '1ststep-banner.png',
  '1ststep-fbook-banner--.png',
  'app 1st step icon-.png',
  'app_screenshot_linkedin.png',
  'Beta Test.png',
  'build your resume.png',
  'bulk tailoring.png',
  'chrome-extension-pic.png',
  'IMG_7715.png',
  'IMG_7716.png',
  'IMG_7717.png',
  'interview prep.png',
  'job search and tailor.png',
  'Modern 1stStep.ai logo design - linkedin.png',
  'optimize ur profile.png',
  'pick which flow.png',
  'Resume Tailor-.png',
  'slash commands.png',
  'Store Icon - Chrome Extension.png',
  'track your progress.png',
];

if (path.dirname(output) !== root || path.basename(output) !== '.public-web') {
  throw new Error('Refusing to clean an unexpected public output path.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const relativePath of publicAssets) {
  const source = path.join(root, relativePath);
  const sourceStat = await stat(source);
  if (!sourceStat.isFile()) throw new Error(`Public asset is not a file: ${relativePath}`);
  const destination = path.join(output, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(`Prepared ${publicAssets.length} intentional public assets in .public-web.`);
