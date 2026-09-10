# Job Agent policy engine

## Decision pipeline

```text
canonical job -> duplicate/freshness -> hard policy -> fact availability
-> execution coverage -> evidence confidence -> risk -> AUTO / REVIEW / ASK / REJECT
```

## Policy classes

| Class | Examples | Evaluation |
| --- | --- | --- |
| Hard reject | salary below floor, incompatible work authorization, excluded employer/type/location, excessive travel, duplicate/reapplied requisition | deterministic |
| Auto-eligible preparation | all hard rules pass, source current, resume truthfully supported, package budget available | deterministic gate then bounded generation |
| Review | salary absent, unusual career shift, ambiguous required qualification, high-impact wording | deterministic trigger plus explanation |
| Ask | missing fact, contextual employer question, unclear permission | one typed Human Action |
| Never automate | protected-trait ranking, passwords/OTP/CAPTCHA, unconfirmed attestations, fabricated claims, blind retry | fixed prohibition |

## Policy version

Every decision records `tenant_id`, `policy_version`, canonical job/version, profile version, result, rule trace, evidence references, timestamp, and engine version. A changed hard rule invalidates pending automatic decisions; it does not rewrite history.

## Confidence components

Confidence is a structured report:

- fact coverage and verification age;
- exact required-qualification coverage;
- source freshness and identity certainty;
- adapter/version historical success rate;
- package truth/render/ATS validation results;
- prior user corrections to the same concept;
- unresolved/unsupported fields;
- receipt-channel availability;
- failure and outcome-unknown history.

A model-provided probability is advisory only and cannot override a deterministic blocker.

## Example output

```json
{
  "decision": "REVIEW",
  "hardRulesPassed": true,
  "blockers": ["salary_not_published"],
  "supportedFacts": 9,
  "requiredFacts": 10,
  "adapter": { "name": "greenhouse", "version": "1.4.0", "coverage": "fill_only" },
  "nextAction": "Confirm whether to continue when salary is not published"
}
```

## Enforcement

The server evaluates policy at discovery, package admission, personal-data transmission, final action, retry, and receipt reconciliation. The extension consumes an immutable task; it never reimplements business policy.
