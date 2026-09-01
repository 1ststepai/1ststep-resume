# Staging observability evidence

Use only a protected Vercel Preview deployment and synthetic, content-free requests. The collector first verifies the exact deployment ID, expected project, Preview target, Ready state, and Vercel Preview URL. It then keeps only GET request metadata for liveness, fail-closed readiness, public app configuration, and the synthetic discovery smoke route.

```powershell
npm run security:preview-log-evidence -- --deployment-id <deployment-id> --expected-project 1ststep-resume --since 10m --limit 100
```

The output contains only route/status counts. Raw messages, nested logs, request IDs, domains, trace IDs, candidate values, employer content, and response bodies are never emitted or retained. The command fails closed if any expected route is missing, a status is absent/unsettled/unexpected, or an allowlisted record contains an application message or nested log entry. Expected synthetic outcomes are liveness `200`, fail-closed readiness `503`, public app configuration `200`, and Preview discovery smoke `200`. It cannot prove provider retention, log-drain delivery, alert delivery, on-call response, Production behavior, capacity, or user fairness; those require separate approved evidence.
