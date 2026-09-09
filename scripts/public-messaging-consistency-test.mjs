import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, partners, resume] = await Promise.all([
  read("index.html"),
  read("partners-landing/index.html"),
  read("resume-tailor-landing/ghl-visual-journey-custom-code.html"),
]);

for (const [name, source] of Object.entries({ app, partners, resume })) {
  assert.doesNotMatch(source, /Greenhouse/i, `${name} public marketing must stay vendor-neutral`);
  assert.match(source, /supported job page/i, `${name} must describe supported job-page capture`);
  assert.match(source, /review[^.]{0,80}submit|You review\. You submit\./i, `${name} must keep submission with the applicant`);
}

assert.match(app, /Find the right jobs\. Build better applications\./);
assert.match(partners, /find suitable roles, prepare better applications, and stay in control/i);
assert.match(resume, /Save time on every application\./);
assert.equal(
  (app.match(/href="https:\/\/partners\.1ststep\.ai\/">Affiliates<\/a>/g) || []).length,
  3,
  "App must link Affiliates in desktop navigation, compact navigation, and footer",
);

console.log("Public messaging is aligned across app, affiliates, and resume surfaces.");
