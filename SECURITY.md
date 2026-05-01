# Security Policy

## Reporting a Vulnerability

Please report suspected vulnerabilities privately through GitHub's private vulnerability reporting flow for this repository.

Do not open a public issue for:

- Secrets, API keys, tokens, or credentials
- Authentication or authorization bypasses
- Payment, webhook, or subscription access issues
- User data exposure
- Denial-of-wallet or quota-draining abuse paths

If private vulnerability reporting is unavailable, email the repository owner using the support contact listed in the application.

## Secret Handling

Never commit real `.env` files, API keys, service account files, certificates, private keys, local browser profiles, local AI tool settings, or generated credential dumps.

If a secret is committed or shared accidentally:

1. Revoke or rotate it at the provider immediately.
2. Remove it from the working tree and Git index.
3. Treat Git history and any pushed copies as compromised.
4. Verify GitHub secret scanning and push protection are enabled before pushing again.

## Maintainer Checklist

- Keep `main` branch protection enabled.
- Keep secret scanning, push protection, Dependabot, CodeQL, and private vulnerability reporting enabled.
- Keep GitHub Actions restricted to GitHub-owned, SHA-pinned actions.
- Keep workflow token permissions read-only unless a workflow explicitly needs more.
- Set production secrets only in Vercel or the relevant provider dashboard, not in source files.
