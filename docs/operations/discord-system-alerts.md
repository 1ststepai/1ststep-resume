# Private Discord system alerts

Use a private Discord channel such as `#1ststep-ops-alerts`. Limit channel and webhook access to the owner and designated operators. Do not use a public support or customer channel.

## What the application sends

The existing durable operator-alert outbox sends allowlisted event names, severity, environment, and timestamp to `/api/job-agent-discord-relay`. The relay rejects candidate-bearing payloads and posts a compact message to Discord. It never includes names, email addresses, phone numbers, addresses, resumes, application answers, passwords, OTPs, CAPTCHA answers, webhook URLs, or tokens.

Delivery is deduplicated, leased, retried with backoff, and marked failed after the existing retry limit. Discord delivery being configured does not enable job applications, browser automation, email, object storage, or final submission.

## Configuration names

Store values as encrypted Vercel environment variables. Never paste their values into source, logs, tickets, or chat.

- `JOB_AGENT_DISCORD_ALERTS_APPROVED=true`
- `JOB_AGENT_DISCORD_WEBHOOK_URL` — the private Discord channel webhook
- `JOB_AGENT_ALERT_WEBHOOK_URL=https://app.1ststep.ai/api/job-agent-discord-relay`
- `JOB_AGENT_ALERT_ALLOWED_HOSTS=app.1ststep.ai`
- `JOB_AGENT_ALERT_BEARER_TOKEN` — one random secret of at least 32 characters, shared only between the outbox and relay
- `JOB_AGENT_ALERT_CONTRACT_VERSION` — reviewed version identifier
- `JOB_AGENT_ALERT_RETENTION_DAYS`
- `JOB_AGENT_ALERT_ACKNOWLEDGEMENT_MINUTES`
- `JOB_AGENT_ALERT_COOLDOWN_SECONDS`

Do not configure Production until the channel permissions, operator owner, escalation policy, and retention policy are approved. After configuration, send one synthetic allowlisted event, verify the exact Discord receipt, verify no candidate values were present, and store signed operator-alert delivery evidence through the existing release-evidence process.

## Whole-application outage coverage

The app cannot report when its entire Vercel runtime is unavailable. Configure a separate external uptime monitor on a free plan to check `https://app.1ststep.ai/api/health/live` and deliver outage and recovery notices to the same private Discord channel. Keep the monitor's Discord credentials in the provider's secret store, not in a public URL or this repository.

Use a five-minute interval initially. Alert only after two consecutive failures, and send one recovery notice after two consecutive successes. Treat `/api/health/live` as liveness only; dependency, queue, and readiness problems continue through the application's internal alerts.
