import fs from "node:fs";
import vm from "node:vm";

const path = new URL(
  "../resume-tailor-landing/ghl-visual-journey-custom-code.html",
  import.meta.url,
);
const html = fs.readFileSync(path, "utf8");
const required = [
  'id="fs-journey"',
  "Save time on every application.",
  "Capture a supported job page.",
  "Get the Chrome extension",
  "Start My Job Agent",
  'href="https://app.1ststep.ai"',
  "https://www.instagram.com/1ststepdotai/",
  'aria-label="Instagram"',
  'href="https://x.com/1ststepai"',
  'aria-label="X"',
  'href="https://www.linkedin.com/company/105262286/"',
  'aria-label="LinkedIn"',
  'href="https://www.youtube.com/@1ststepdotai"',
  'aria-label="YouTube"',
  'href="https://partners.1ststep.ai"',
  ">Affiliates</a",
  "AI Job Application Assistant & Resume Builder | 1stStep.ai",
  "https://resume.1ststep.ai/ai-resume-builder",
  'schema.id = "fs-seo-schema"',
  '"@type": "SoftwareApplication"',
  '"@type": "WebPage"',
  "Captured from job page",
  "Capture once. Keep moving.",
  "See what you saved.",
  "Estimated time saved",
  "Estimate based on completed steps.",
  "Based on completed workflow steps.",
  "Your application. Your call.",
  "You submit",
  "prefers-reduced-motion:reduce",
  "gnbjcmennlcbkmakameknfcnioohnjkp",
  'data-stage="0"',
  'data-stage="3"',
  'data-theme="dark"',
  "data-theme-toggle",
  'localStorage.getItem("1ststep_theme")',
  "data-capture",
  'data-worktab="0"',
  'data-worktab="3"',
];

for (const value of required) {
  if (!html.includes(value))
    throw new Error(`Missing required landing contract: ${value}`);
}

const socialOrder = [
  'aria-label="X"',
  'aria-label="Instagram"',
  'aria-label="LinkedIn"',
  'aria-label="YouTube"',
].map((value) => html.indexOf(value));
if (
  socialOrder.some((index) => index < 0) ||
  socialOrder.some(
    (index, position) => position > 0 && index <= socialOrder[position - 1],
  )
) {
  throw new Error(
    "Footer social icons must appear as X, Instagram, LinkedIn, YouTube",
  );
}

for (const forbidden of [
  /guaranteed interview/i,
  /auto(?:matic(?:ally)?)?\s+submit/i,
  /bypass(?:es|ing)?\s+(?:a\s+)?captcha/i,
  /\d+\s*(?:hours?|minutes?)\s+saved/i,
]) {
  if (forbidden.test(html))
    throw new Error(`Unsafe marketing claim matched: ${forbidden}`);
}

if (html.includes("https://app.1ststep.ai/app/resume")) {
  throw new Error(
    "App CTA must use the canonical https://app.1ststep.ai entry point",
  );
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (match) => match[1],
);
if (scripts.length !== 1)
  throw new Error(
    `Expected exactly one inline script, found ${scripts.length}`,
  );
new vm.Script(scripts[0], { filename: "ghl-visual-journey-custom-code.html" });

const primaryCtas = (html.match(/Get the Chrome extension/g) || []).length;
if (primaryCtas < 3)
  throw new Error(
    `Expected at least three extension CTAs, found ${primaryCtas}`,
  );

for (const noisyMotion of [
  "@keyframes fsFloat",
  "@keyframes fsDrift",
  "@keyframes fsGaugeSpin",
  "@keyframes fsPacket",
]) {
  if (html.includes(noisyMotion))
    throw new Error(`Decorative motion returned: ${noisyMotion}`);
}

console.log(
  `Resume visual journey contract passed (${primaryCtas} extension CTAs).`,
);
