# Release-bound evidence

`npm run release:evidence` creates one signed, content-free artifact that binds a Job Agent release to its exact source and operational evidence. It does not deploy or change an environment.

The command fails closed when the Git worktree is dirty or any required identity is missing. Run it only after the release commit, build output, tests, candidate deployment, and rollback target all exist.

## Required environment

- `JOB_AGENT_RELEASE_EVIDENCE_SECRET`: signing secret of at least 32 characters. Never store it in the artifact or repository.
- `VERCEL_DEPLOYMENT_ID`: exact candidate deployment ID.
- `VERCEL_DEPLOYMENT_URL`: exact candidate deployment URL.
- `JOB_AGENT_ROLLBACK_DEPLOYMENT_ID`: exact currently safe rollback deployment.
- `JOB_AGENT_RELEASE_FLAGS_JSON`: JSON object containing only release-relevant, non-secret flag names and values.
- `JOB_AGENT_RELEASE_TESTS_JSON`: JSON array of passing evidence records. Each record has `name`, a SHA-256 `sha256`, and ISO `passedAt`.

The default build directory is `.public-web`. Override it with `JOB_AGENT_BUILD_DIRECTORY` when the candidate output is elsewhere. Migration evidence includes both `migrations/` and `supabase/migrations/`; extension evidence includes the unpacked `1ststep-extension/` directory and its manifest version.

## Artifact handling

Use `npm run release:evidence -- --output=<path>` to select a new output file. Existing files are never overwritten. The artifact contains hashes and release metadata only—never applicant data, generated application content, credentials, or secret values.

Before promotion, verify the signature and compare the artifact to the exact production alias, deployment ID, commit, asset digest, migration digest, extension version/digest, flags, test evidence, and rollback target. A mismatch, expired artifact, or unknown field is a blocker rather than evidence of readiness.

Run `npm run release:evidence:verify -- <artifact-path>` from the exact release checkout with the same signing secret and deployment/rollback identifiers. Verification recomputes the local source, build, migration, and extension identity and rejects a dirty checkout.
