# Background application work

Deployed to app.1ststep.ai as `dpl_HMBB6EBHAHRpHen5EWT4wmK2WaHj` from the isolated `../release-job-agent-20260907` snapshot. Rollback: `dpl_Bj6QpHJgy8FpYwLgi1QMkdQW2MoH`. The Windows prebuilt candidate was rejected in staging for a missing Linux canvas binding; the verified release was built on Vercel Linux.

- Automatic draft requests now persist with `runNow: false`. The client continues queuing eligible matches when previous drafts are Searching or Preparing, instead of waiting for AI output. The existing API still checks authorization, rate limits, plan allowance, and fresh employer identity. Accepted automatic requests use Vercel waitUntil to start immediately after responding; cron retains interrupted-run recovery.
- Once accepted, a draft belongs to the durable worker and can run without the browser. Closing the page before requests are accepted still interrupts dispatch of the remaining matches.
- The worker restores the discovery record from the same tenant and rechecks the exact employer posting before generation. Closed or changed postings stop; temporary verification failures use the existing bounded retry path. Private document revisions do not make employer requests.
- Default worker drain increases from one to at most three runs per invocation, preserving tenant fairness and the existing 50-second deadline. Cron cadence is unchanged.

Remaining blockers to unattended daily applications:

1. Scheduled discovery still needs a server-side qualification and package-dispatch continuation. Current fit review and multi-match dispatch start in the browser. That continuation must use durable candidate preferences, shared plan accounting, and cross-history duplicate checks; blindly generating every discovered posting would bypass these controls.
2. Employer execution needs a configured and verified browser provider. The current extension route requires the applicant's browser.
3. Ordinary remembered screening answers are private references; supported employer-field mapping is still required to fill them.
4. Existing per-application transmission/final approvals and receipt verification remain required. No application was sent in this work.

Validation: background source-check tests, durable run tests, preparation selection tests, worker-cycle tests, discovery binding tests, six existing browser tests, public build, and smoke (zero failures, six existing warnings). No live worker or employer action was triggered.

Release verification: 86 regression suites, security scan, smoke, 18 relevant browser checks, 12 protected staging probes, and 22 live HTTP/asset checks passed. Live sign-in reaches the existing Clerk Google/email form. No real application or paid AI generation was initiated for verification. Existing Terms digest mismatch was preserved, not waived or changed; two excluded GHL proposal tests target an undeployed directory. Automatic answer-reference resolution was withheld until actual employer-field mapping exists.
