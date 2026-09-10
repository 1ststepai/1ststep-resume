# Autopilot readiness

## Model

Readiness is a capability graph, not a personality level or vanity score. Each capability returns `READY`, `LIMITED`, `NEEDS_INPUT`, `DISABLED`, or `UNSUPPORTED` plus prerequisites, evidence version, blockers, and next action.

An optional aggregate may be shown only as a summary of capability coverage across the user's likely jobs:

```text
overall = sum(capability_weight × eligible_job_coverage × prerequisite_completion)
          / sum(capability_weight)
```

Hard blockers set the affected capability to zero regardless of other scores. Coverage must come from observed job/ATS distribution; without it, coverage is `unknown` and no percentage is shown.

## Current matrix

| Capability | Knowledge | Verification | Permission | Risk | Current support | Human review | Autopilot eligible | Blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Find jobs | target path/location | public source/freshness | search consent for background | Low | READY for cataloged GH/Lever/Ashby/SR | No | Yes, bounded | shared ingestion/coverage |
| Reject bad jobs | hard policy | current job facts | active policy | Medium | LIMITED | ambiguity | Partial | missing salary/sponsorship/travel data |
| Rank jobs | verified profile/preferences | evidence coverage | analysis consent | Medium | LIMITED | top candidates | Partial | no live quality telemetry |
| Select resume evidence | Career Profile | fact/source versions | package consent | High | LIMITED | Yes | No | document-centric legacy state |
| Tailor resume | verified facts/job | source map + ATS/render QA | package consent | High | READY internally when gates configured | Yes | Draft only | render/object-store production proof |
| Generate answers | answer/profile evidence | field classification | package consent | High | LIMITED | Yes | Routine draft only | semantic canonicalization and ATS maps |
| Reuse answers | confirmed scoped answer | active version/expiry | reuse scope | High | exact matching exists | consequential | Partial | broader classifier not proven |
| Cover letter | verified evidence | source map/QA | package consent | Medium | READY internally | Yes | Draft only | same as package |
| Upload resume | exact artifact | hash/control match | single-use sharing approval | High | LIMITED to Greenhouse | Yes | No | store/source version and coverage |
| Fill application | mapped approved fields | schema/checkpoint | single-use sharing approval | High | LIMITED to Greenhouse | Yes | No | one adapter; production evidence |
| Answer custom question | profile/answer | semantic/context check | scoped sharing | High | NEEDS_INPUT when ambiguous | Yes | No | unsafe to infer |
| Submit application | exact final form/package | preserved checkpoint | action-time final approval | Critical | DISABLED in production | Always today | No | provider, counsel, recovery, receipt proof |
| Retry failed submit | outcome proof | authoritative non-submit evidence | new approval | Critical | outcome-unknown blocks retry | Always | No | reconciliation source |
| Track application | canonical app/receipt | authoritative evidence | n/a | Medium | LIMITED | private outcomes | Partial | receipt connector coverage |

## Readiness tasks

Show no more than three, ordered by additional qualifying-job coverage and risk reduction:

1. **Confirm work authorization and sponsorship** — unlocks deterministic eligibility for roles that state those requirements.
2. **Confirm salary, relocation, and travel boundaries** — prevents unsuitable applications and reduces review questions.
3. **Reconcile resume/profile into secure Career Profile** — unlocks repeatable package preparation across devices.

Use measured language: “This may allow the agent to process more qualifying jobs without asking.” Quantify only after real job-corpus coverage exists.

## Full Autopilot definition

A user is Full Autopilot capable for a defined job/ATS segment when every required fact, policy, permission, adapter, recovery mechanism, and receipt channel is current and verified, with an acceptable observed failure history. Full Autopilot always remains exception-based and revocable.
