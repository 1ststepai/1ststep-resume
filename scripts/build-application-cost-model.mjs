import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = new URL('../output/application-cost-model/', import.meta.url);
await mkdir(out, { recursive: true });
// Each row represents total resources consumed across its attempts, not a retry multiplier on unrelated work.
const scenarios = [
 ['No qualifying jobs',0,0,0,0,0,0,0,'No completion; discovery/hosting overhead still applies.'],
 ['Duplicate or closed job rejected before generation',0,0,0,0,0,0,0,'No completion; include screening costs in the cohort.'],
 ['Resume only, straightforward form',5000,1800,10000,1000,5,1,1,'No cover letter required.'],
 ['Resume + cover letter, straightforward form',8000,3000,20000,2000,10,2,1,'Baseline assumption, not a live benchmark.'],
 ['Existing documents reused',0,0,20000,2000,10,2,1,'Reuse only for the same approved job/profile/document version.'],
 ['One cover-letter regeneration',12000,4000,20000,2000,10,2,1,'Increment: 4000 input + 1000 output tokens.'],
 ['One resume regeneration',13000,4800,20000,2000,10,2,1,'Increment: 5000 input + 1800 output tokens.'],
 ['Both documents regenerated once',16000,6000,20000,2000,10,2,1,'One additional complete package generation.'],
 ['Both documents regenerated three times',32000,12000,20000,2000,10,2,1,'Four package calls total.'],
 ['Manual text correction',8000,3000,20000,2000,10,2,1,'No extra AI tokens; revision storage/rendering may cost extra.'],
 ['Browser retry, documents reused',8000,3000,40000,4000,20,4,1,'Two browser attempts; one document package.'],
 ['Entire process retried once',16000,6000,40000,4000,20,4,1,'Two full attempts produce one completion.'],
 ['Complex multi-page form',8000,3000,60000,6000,30,6,1,'More questions, navigation and model context.'],
 ['30-minute idle OTP wait',8000,3000,20000,2000,40,2,1,'Memory billed during idle; no added CPU assumed. Stop/suspend instead where supported.'],
 ['Three browser attempts, two document regenerations',24000,9000,60000,6000,30,6,1,'Compounded retry example.'],
 ['Heavy visual reasoning / repeated context',8000,3000,200000,20000,45,10,1,'Token equivalent only; image/tool-specific charges must be added separately.'],
 ['Provider output generated but later abandoned',8000,3000,0,0,0,0,0,'Spent money with no completion.'],
 ['Browser attempt fails after generation',8000,3000,20000,2000,10,2,0,'Spent money with no completion.'],
 ['Submission result unknown',8000,3000,20000,2000,10,2,0,'Not counted as complete; reconcile before any retry.'],
 ['Receipt reconciliation succeeds',8000,3000,24000,2400,12,2.4,1,'Extra inspection, no second submission.'],
 ['Employer rejects after confirmed submission',8000,3000,20000,2000,10,2,1,'Still a completed application; a job outcome is separate.'],
];
function cost(s, input=.2, output=1.2) { return ((s[1]+s[3])*input+(s[2]+s[4])*output)/1e6+s[5]*4*.0212/60+s[6]*.128/60; }
assert.ok(Math.abs(cost(scenarios[3])-.030000000000000002)<1e-10);
assert.ok(Math.abs(cost(scenarios[7])-cost(scenarios[3])-.0052)<1e-10);
assert.equal(scenarios[18][7],0);
const money=x=>'$'+x.toFixed(4);
const table = scenarios.map(s=>`| ${s[0]} | ${money(cost(s))} | ${money(cost(s,2,12))} | ${s[7]?'1':'0'} | ${s[8]} |`).join('\n');
const notes = `# Application cost model — September 6, 2026

These are resource-based scenarios, not measured production costs or upper bounds. No finite list can cover every employer, failure or provider. The calculator exposes rates and consumption so new combinations can be evaluated. Hosted execution is not yet active.

Rates: Luna $0.20 input / $1.20 output per million tokens; Terra $2 / $12. Vercel Sandbox starting rates $0.128 per active core-hour and $0.0212 per GB-hour. 4 GB memory assumed. CPU minutes mean total core-minutes, not wall minutes. All table costs ignore included credits and exclude unpriced services. Terra column assumes ALL document and form reasoning uses Terra, rather than claiming a particular escalation policy.

Sources: https://developers.openai.com/api/docs/models/gpt-5.6-luna ; https://developers.openai.com/api/docs/models/gpt-5.6-terra ; https://vercel.com/pricing

| Scenario | Luna subtotal | Terra subtotal | Completed | Assumption |
|---|---:|---:|---:|---|
${table}

## Full accounting

Total cohort cost = document AI + form AI + screening/ranking AI + OCR/image/tool fees + browser CPU + provisioned memory + browser/session service + rendering + scanning + storage + requests + transfer + snapshots + database + queues/workflows + monitoring/reconciliation + email/SMS + allocated fixed subscriptions + payment fees + support labor + refunds/chargebacks.

Cost per completed application = ALL costs for successful, failed, abandoned and unresolved work / unique employer-receipt-verified completions. Zero completions makes this undefined, not zero. Never count retransmissions, status refreshes, or later interview/rejection events as another completed application.

Optional items must be marked not applicable only when verified. Unknown amounts are not zero costs. The HTML uses a separately labeled allowance for these items; a zero allowance is explicitly an incomplete subtotal. Do not add a third-party browser fee on top of Vercel compute if that fee already includes compute. Track document and browser retries independently. A timeout can consume the full request cost even without a usable response. Do not automatically retry an ambiguous employer submission.

Included usage/credits lower a specific invoice but should not be treated as permanent zero marginal cost. Allocate only this product's share of fixed subscriptions. At low volume fixed fees dominate. Currency, region, taxes, provider commitments and contract-specific rates can change totals. A $39 subscription is revenue, not a $39 operating budget; payment fees, support and margins must be funded too.

## No-match and completion-rate economics

If all attempts average $0.03, provider subtotal per completion is $0.03 at 100% completion, $0.0375 at 80%, $0.05 at 60%, $0.10 at 30%, and $0.30 at 10%. This simplifying example assumes failed attempts cost as much as successes; use actual stage costs instead when available. With zero suitable jobs, screening and account overhead may still accrue and there is no per-completion denominator. Never loosen fit criteria to improve this metric.

## Proposed operating policy (not activated by this report)

Measure each stage and actual billed tokens, distinguish estimates/reservations/settled usage, reconcile unknown costs, and stop at account/global spend limits. Cache by canonical job/profile/document version. Retry transient safe work with bounded attempts; do not repeatedly regenerate all documents for a cover-letter-only change. Suspend idle sessions where safe; route challenges/missing facts to the user. Count internally caused repair attempts as operating cost, not new submitted applications. Any consumer usage-credit treatment must be defined explicitly before billing.

## Customer wording

“Your job search, guided by fit. 1stStep.ai finds suitable openings and prepares tailored application materials using your criteria. Application volume varies with suitable openings, employer requirements, required approvals and plan limits; it may be zero. A usage limit is maximum capacity, not a guaranteed number of applications, interviews or offers. We do not weaken your criteria or duplicate applications to meet a quota.”

Only describe form filling/submission as available after it is operational and verified. Paid Job Agent billing remains disabled in current source; $39/month is the planned recurring price. Do not imply unused application capacity is a guaranteed delivery debt or invent rollover/refund terms.

Implementation: clarified the pricing-page Job Agent section, dashboard explanation, criteria summary and target-setting confirmation. Existing throughput policy already takes the minimum of requested target, eligible supply, plan capacity, provider budget and system capacity, with separate approval/receipt gates. This change does not activate billing, execution, new limits or new paid services.
`;
await writeFile(new URL('cost-model.md',out),notes);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>1stStep.ai — Application economics</title><style>body{font:16px system-ui;background:#f2f6f4;color:#18382f;max-width:1180px;margin:40px auto;padding:0 22px}h1{font-size:36px}p{line-height:1.6}section{background:white;border:1px solid #d6e2dc;border-radius:16px;padding:24px;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px}label{display:block;font-size:14px}input,select{display:block;width:90%;padding:9px;margin-top:7px;font:inherit}strong.big{display:block;font-size:30px;margin:10px 0}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:12px;border-bottom:1px solid #ddd}small{color:#50675d}.scroll{overflow:auto}.note{background:#fff4d6;padding:15px;border-radius:10px}a{color:#166749}</style><h1>What does a completed application cost?</h1><p>1stStep.ai • Planning model • September 6, 2026<br>Adjust resource use, failures and overhead. These are estimates, not your actual invoice or guaranteed maximums.</p><p class="note">The earlier $0.10–$0.25 allowance is not a ceiling. Unknown service fees are excluded until entered below. Hosted application execution is not active yet.</p><section><h2>Rates and allocation</h2><div class="grid"><label>AI input / million tokens ($)<input id="input" type="number" min="0" step=".01" value=".2"></label><label>AI output / million tokens ($)<input id="output" type="number" min="0" step=".01" value="1.2"></label><label>CPU / core-hour ($)<input id="cpu" type="number" min="0" step=".001" value=".128"></label><label>Memory / GB-hour ($)<input id="ramRate" type="number" min="0" step=".0001" value=".0212"></label><label>Allocated memory (GB)<input id="ram" type="number" min="0" step="1" value="4"></label><label>Other cost per attempt ($; unknown by default)<input id="other" type="number" min="0" step=".01" value="0"></label><label>Monthly allocated fixed/shared cost ($)<input id="fixed" type="number" min="0" step="1" value="0"></label></div><p><small>Other costs: rendering, scanning, storage, transfer, browser-service surcharge, tools, screening, notifications. Fixed/shared costs: subscriptions, database, payment fees, support. Enter only costs not already included elsewhere. Zero does not establish those services are free.</small></p></section><section><h2>Your monthly completion economics</h2><div class="grid"><label>Successful-work scenario<select id="scenario"></select></label><label>Verified completions / month<input id="completed" type="number" min="0" step="1" value="100"></label><label>Additional failed/abandoned attempts<input id="failed" type="number" min="0" step="1" value="25"></label><label>Average failed-attempt resource cost ($)<input id="failureCost" type="number" min="0" step=".001" value=".03"></label></div><div class="grid"><div>Modeled monthly cost<strong class="big" id="monthly"></strong></div><div>Cost per confirmed completion<strong class="big" id="unit"></strong></div><div>Completions possible within $12 variable spend*<strong class="big" id="capacity"></strong></div></div><p id="coverage" class="note"></p><small>*Illustrative operating budget, not a customer allowance or activated limit. Excludes fixed allocation from this capacity calculation. Job fit can reduce actual volume to zero.</small></section><section><h2>Scenario explorer</h2><p>All figures include only modeled AI and browser resources plus your per-attempt allowance. Failed rows incur costs but produce no completion. Assumes one allowance per row; enter extra retry-related service charges into the allowance or monthly total as needed.</p><div class="scroll"><table><thead><tr><th>Scenario</th><th>Cost</th><th>Completions</th><th>Details</th></tr></thead><tbody id="rows"></tbody></table></div></section><section><h2>What we promise customers</h2><p><strong>Your job search, guided by fit.</strong> Application volume depends on suitable openings, your criteria, employer requirements, required approvals and plan limits. It may be lower than your target, including zero. Usage limits are maximum capacity—not a guaranteed number of applications, interviews or offers.</p><p>We do not weaken your criteria or duplicate applications to meet a quota. Drafts and confirmed submissions are tracked separately.</p><p>Form filling/submission must only be advertised as available after verified activation.</p></section><p>Sources: <a href="https://developers.openai.com/api/docs/models/gpt-5.6-luna">Luna</a> · <a href="https://developers.openai.com/api/docs/models/gpt-5.6-terra">Terra</a> · <a href="https://vercel.com/pricing">Vercel</a> · <a href="cost-model.md">Full assumptions and cost inventory</a></p><script>const scenarios=${JSON.stringify(scenarios)};const el=id=>document.getElementById(id);const num=id=>Math.max(0,Number(el(id).value)||0);const dollars=x=>'$'+x.toFixed(4);function resource(s){return ((s[1]+s[3])*num('input')+(s[2]+s[4])*num('output'))/1e6+s[5]*num('ram')*num('ramRate')/60+s[6]*num('cpu')/60}scenarios.forEach((s,i)=>{if(s[7]){const o=document.createElement('option');o.value=i;o.textContent=s[0];el('scenario').appendChild(o)}});el('scenario').value=3;function render(){const c=Math.floor(num('completed')),f=Math.floor(num('failed')),s=scenarios[Number(el('scenario').value)],variable=c*(resource(s)+num('other'))+f*(num('failureCost')+num('other')),total=variable+num('fixed');el('monthly').textContent=dollars(total);el('unit').textContent=c?dollars(total/c):'Undefined — no completions';el('capacity').textContent=c&&variable>0?Math.floor(12/(variable/c)):'Not calculable';el('coverage').textContent=num('other')===0||num('fixed')===0?'Incomplete subtotal: one or more additional cost allocations are zero/unpriced. No maximum cost is guaranteed.':'Includes your entered allowances, which are estimates rather than verified bills. Reconcile against actual usage.';el('rows').replaceChildren();scenarios.forEach(s=>{const tr=document.createElement('tr');[s[0],dollars(resource(s)+num('other')),s[7],s[8]].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});el('rows').appendChild(tr)})}document.querySelectorAll('input,select').forEach(n=>n.addEventListener('input',render));render();</script></html>`;
await writeFile(new URL('index.html',out),html);
await writeFile(new URL('scenarios.json',out),JSON.stringify(scenarios.map(s=>({scenario:s[0],documentInput:s[1],documentOutput:s[2],agentInput:s[3],agentOutput:s[4],wallMinutes:s[5],activeCoreMinutes:s[6],completions:s[7],lunaSubtotal:cost(s),terraSubtotal:cost(s,2,12),assumption:s[8]})),null,2));
console.log('Created 21-scenario cost model, interactive calculator, and assumptions report. Formula checks passed.');
