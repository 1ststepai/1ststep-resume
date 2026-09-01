# Bounded staging capacity probe

This probe supplies repeatable, content-free transport evidence for a protected Vercel Preview. It does not prove production capacity, provider quotas, signed-user fairness, queue throughput, failover, or an SLO by itself.

## Safety contract

- GET only, with `/api/health/live` and `/api/app-config` as the complete allowlist.
- Vercel Preview hostnames only. `1ststep.ai`, `www.1ststep.ai`, and `app.1ststep.ai` are rejected.
- At most 25 requests and five concurrent requests per invocation.
- No response bodies, candidate values, tenant identifiers, URLs, credentials, or protection secrets are retained or printed.
- The protection bypass secret is accepted only from `VERCEL_AUTOMATION_BYPASS_SECRET`.
- The command requires the explicit `BOUNDED_CONTENT_FREE_STAGING_PROBE` confirmation string.
- A status mismatch, timeout, or p95 latency above the specified ceiling fails the command.

## Approved execution shape

After an operator supplies a scoped Preview protection-bypass secret in the protected shell, run:

```powershell
node scripts/staging-capacity-probe.mjs --base-url https://DEPLOYMENT.vercel.app --path /api/health/live --requests 10 --concurrency 2 --expected-status 200 --maximum-p95-ms 5000 --confirm BOUNDED_CONTENT_FREE_STAGING_PROBE
```

Increase neither the request count nor concurrency ceiling without a reviewed code change. Retain only the aggregate JSON result and bind it to the deployment ID, exact source commit, Vercel plan/region evidence, and UTC time. Run a separately approved signed-user fairness/queue exercise before beta expansion.

## Current state

The harness and its local safety/concurrency/failure tests pass. The linked project identity and Node 24 runtime were read from Vercel, but plan quotas were not exposed by that read-only inspection. No protected-Preview load result, signed-user fairness result, provider quota, saturation point, or production capacity claim exists yet.
