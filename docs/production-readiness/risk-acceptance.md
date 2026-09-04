# Risk acceptance policy

Risk acceptance is an accountable, temporary decision—not a way to convert missing evidence into `Pass`.

## Rules

- A `Critical` cannot be accepted for production in this beta methodology. It must be remediated and verified.
- A `Warning` may be accepted only when the product/safety owner names the risk, affected users/data/capability, compensating controls, owner, monitoring trigger, rollback, and expiration date.
- Acceptance expires after at most 30 days unless a shorter control-specific period applies.
- Expired acceptance is invalid and the layer returns to its underlying status.
- Accepted risk cannot enable employer-browser execution, personal-data transmission, final submission, object storage, email, billing, or legal-policy capability without that capability's separate approval contract.
- Evidence that is unknown remains `Unknown`; acceptance changes the release decision, not the evidence state.
- Every acceptance is reviewed again after a security incident, dependency/provider change, schema migration, auth change, policy change, or material workflow change.

## Required record

```json
{
  "riskId": "PR-RISK-000",
  "layer": 0,
  "status": "Warning",
  "decisionOwner": "named accountable owner",
  "acceptedAt": "ISO-8601 timestamp",
  "expirationDate": "ISO-8601 timestamp within 30 days",
  "scope": "exact release/capability/environment",
  "userAndDataImpact": "bounded impact",
  "reason": "why remediation cannot precede release",
  "compensatingControls": ["control"],
  "monitoringTrigger": "observable rollback threshold",
  "rollback": "exact reversible action",
  "evidence": ["content-free evidence reference"]
}
```

## Current decisions

No risk is accepted. All `acceptedRisk` fields in the machine-readable scorecard are `false`. Layers 3, 8, and 13 therefore block production approval.
