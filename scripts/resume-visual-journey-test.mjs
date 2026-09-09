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
  "Capture a supported Greenhouse job.",
  "Get the Chrome extension",
  "Start My Job Agent",
  'href="https://app.1ststep.ai"',
  "https://www.instagram.com/1ststepdotai/",
  'aria-label="Instagram"',
  'class="fs-social"',
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
