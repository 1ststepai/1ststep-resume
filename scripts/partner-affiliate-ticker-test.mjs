import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, styles, config] = await Promise.all([
  readFile(new URL('../partners-landing/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../partners-landing/assets/partner-31049497a76d.js', import.meta.url), 'utf8'),
  readFile(new URL('../partners-landing/assets/partner-52563e68615b.css', import.meta.url), 'utf8'),
  readFile(new URL('../partners-landing/vercel.json', import.meta.url), 'utf8'),
]);
const source = `${html}\n${script}\n${styles}\n${config}`;

assert.match(source, /https:\/\/app\.1ststep\.ai\/api\/affiliates/);
assert.match(source, /verified referrals tracked/);
assert.match(source, /active partner codes/);
assert.match(source, /referred paid subscribers/);
assert.match(source, /Live referral totals will appear here when verified tracking is available/);
assert.match(html, /Apply inside your 1stStep\.ai account/);
assert.match(html, /https:\/\/app\.1ststep\.ai\/login\.html\?mode=sign-up/);
assert.match(html, /https:\/\/app\.1ststep\.ai\/login\.html/);
assert.doesNotMatch(html, /id="partnerEmail"|id="partnerTerms"|id="savePartnerBtn"/);
assert.doesNotMatch(script, /action:\s*'register'|contactEmail|firststep_growth_partner/);
assert.match(styles, /@keyframes partnerTicker/);
assert.match(config, /connect-src 'self' https:\/\/app\.1ststep\.ai/);
assert.match(html, /30% recurring commission/i);
assert.match(html, /60 days/i);
assert.match(html, /30-day payment confirmation period/i);
assert.match(html, /Minimum payout threshold:\s*\$50/i);
assert.doesNotMatch(html, /Founder Partner Bonus/i);
assert.doesNotMatch(source, /data-ticker="(?:referrals|partners|paid)"[^>]*>[^<]*(?:email|name|customer)/i);

console.log('Account-routed partner landing, aggregate-only live ticker, unavailable-state honesty, and current published terms tests passed.');
