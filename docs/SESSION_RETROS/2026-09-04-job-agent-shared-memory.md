# Job Agent shared-memory handoff

Date: 2026-09-04

## Summary

- Made `docs/AI_MEMORY.md` the shared Claude/Codex entry point for the Job Agent architecture and operational-memory contract.
- Added tenant-scoped canonical identity, atomic idempotency, duplicate reconciliation, receipt-only Submitted status, and no-retry outcome-unknown rules.
- Added a model-efficiency contract that keeps routine pipeline stages model-free, routes to the least expensive capable tier, caches versioned results, and enforces tenant/global token and cost budgets.
- Connected `CLAUDE.md` and `AGENTS.md` to the same memory and detailed runtime documents.
- Recorded the local supervised-search ledger as an input that must be reconciled into the app's durable state, not treated as a second production source of truth.

## Validation

- Documentation-only change; commands and runtime behavior were not changed.
- No tests run because this handoff does not modify executable code.

## Follow-up

- Future Job Agent changes must keep database constraints and all discovery/application entry points aligned with the identity and idempotency contract.
