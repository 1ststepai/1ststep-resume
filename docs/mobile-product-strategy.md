# Mobile product strategy

## Product role

Mobile is the Job Agent control and exception surface, not a miniature resume desktop or ATS browser.

## Must support

- View one next action and why it matters.
- Review job fit, package summary, material resume changes, and known gaps.
- Answer one blocking question using tap-first choices when possible.
- Confirm/update facts, policies, and permissions.
- Pause/resume search and see last verified activity.
- Approve personal-data sharing and final action as separate steps.
- Record interview/rejection/follow-up outcomes.
- Receive privacy-safe Needs You notifications.
- Continue a desktop-required task with an exact resumable checkpoint.

## Must not include

- Full employer ATS rendering in a native webview.
- Extension installation/control as if available on mobile.
- Dense multi-column resume layout editing.
- Admin queue, lease, provider, cost, or audit-chain internals.
- “Autopilot” toggles without showing capability scope and blockers.

## Current assessment

The live 390x844 `/app` first-use path is readable, tap-first, and gives visible 1-of-7 progress. The legacy `/app/resume` remains much denser: a choice modal, five-item mobile bottom navigation, resume form, and nine-step checklist. It is usable but not a focused mobile control plane.

## Cross-device requirements

Career Profile, policy versions, permissions, application state, package versions, Needs You actions, schedules, receipts, and outcomes must be server-authoritative. Device-only drafts may exist temporarily but must be visibly labeled, expiring, and never silently override newer account state.

## Native-app decision

Do not start a native app until the responsive web control plane, notifications, deep links, and canonical state model are stable. A PWA/mobile web experience can validate behavior first. Native value would be notifications, secure local review, camera/file import, and OS shortcuts—not ATS automation.
