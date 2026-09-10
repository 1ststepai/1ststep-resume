# Product simplification backlog

## P0 — stop adding complexity

- Do not add another top-level product tool, tracker, applicant profile, or application state store.
- Do not expand Bulk Apply or use volume quotas as the primary value story.
- Do not expose remote-browser, queue, lease, provider, or internal readiness states to applicants.
- Do not claim support from dormant adapter files or fixture tests.
- Do not create an aggregate Autopilot percentage without job-segment coverage data.

## P1 — consolidate the experience

1. Make `/app` the canonical Home and route `/concierge` there without a separate product identity.
2. Consolidate Resume Workspace, Job Search, Tracker, Applied, and Application Concierge into contextual My Jobs actions.
3. Move Saved Info to Career Profile: facts, documents, answers, preferences, policy, permissions.
4. Show one prominent next action and hide Activity/configuration internals behind details.
5. Replace Bulk Apply with “Review qualified applications” and individually reasoned cards.
6. Add extension status/version only when a desktop task needs it.

## P1 — remove manual transfer

- Extension captures directly to My Jobs as unverified observations.
- Selected job automatically supplies exact description/source to package creation.
- Package automatically selects relevant verified evidence and shows a diff.
- Tracker updates from canonical application/receipt state.
- Interview Prep uses the exact submitted package and job.

## P2 — legacy retirement

- Import browser resume/profile/tracker/history with a reconciliation screen.
- Preserve advanced resume editing and export behind “Advanced tools.”
- Remove duplicate navigation only for migrated cohorts first.
- Keep rollback and local JSON export until restore/deletion proof is stable.

## Acceptance measures

- One primary navigation concept per user goal.
- First verified job in <=7 taps for a returning user.
- Routine supported application requires <=2 deliberate user actions.
- No browser-only authoritative application status.
- No visible internal state code without a plain-language next action.
- No claim of Submitted without receipt evidence.
