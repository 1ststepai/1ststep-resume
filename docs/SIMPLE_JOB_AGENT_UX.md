# Subscriber Job Agent UX

## Product intent

The authenticated concierge uses the existing dark 1stStep identity and static frontend. It adds only the selected Watermelon/shadcn interaction ideas: a restrained application shell, tabbed job views, a responsive Needs You sheet, employer-specific confirmation dialogs, consistent status badges, modest toasts, persisted mission statistics, and a compact configuration summary.

The primary flow remains: upload or restore a resume, choose a job path, confirm essential criteria, then start the agent. The interface derives resume readiness, mission settings, run state, job cards, actions, and receipt-backed counts from the existing canonical state stores rather than parallel UI-only counters.

Setup is intentionally split into 15 short reusable core facts and 10 targeted questions that appear only when a verified employer application requires them. Exact address, employer-specific conflicts, certifications, screening, references, account creation, and privacy terms do not block initial discovery. Invalid secret-shaped answers stay unsaved without advancing, and consequential answers require review each time.

A signed user returning on a new browser does not need to remember or paste a run ID. The client restores the tenant’s latest encrypted discovery mission and truthful run state after access verification; package-document runs remain separate and are restored only through their exact application records.

## Subscriber surfaces

- Navigation: My Jobs, Needs You, Saved Info, and Agent Status. Admin evidence remains hidden unless the signed session returns `adminConsole: true`.
- My Jobs tabs: Matches, Preparing, Needs You, Submitted, and Interviews.
- Status sequence: Found, Verified, Package Ready, Applying, Needs You, Submitted, Receipt Verified. A role with a local `Submitted` label but no authoritative receipt remains Applying in the subscriber view.
- Needs You: one focused action per item with explicit preserved-state and resume-after-answer copy.
- Confirmation: employer, role, requisition, masked information categories, material risk, exact action, and version-specific scope appear before personal-data sharing or final submission approval.
- Feedback: reversible successes may use a toast; errors and required actions remain visible in their panel or dialog.
- Mission statistics: verified matches, packages ready, Needs You, Submitted, and Interviews. Submitted counts only authoritative non-simulated receipts.

## Responsive and accessibility rules

- Desktop uses a compact top navigation. Mobile uses a four-destination fixed navigation and keeps access/admin controls out of the subscriber rail.
- Dialogs receive focus, support Escape, and wrap Tab focus. The underlying application dialog is hidden from assistive technology while a consequence confirmation is open.
- Text and color both communicate status. Focus outlines, semantic labels, overflow handling, and reduced-motion behavior are explicit.
- Local UI fixtures run only on `localhost` or `127.0.0.1`; they are visibly synthetic and cannot enable employer execution.

## Known backend limits

- Employer-browser execution and personal-data transmission remain disabled in production.
- The receipt verifier has deterministic synthetic coverage for direct employer pages, authenticated employer email, and signed allowlisted ATS responses, but no live receipt-capture connector is configured.
- Durable account persistence requires verified Job Agent access and configured production storage. Signed-out device state remains local and is described honestly.
- Operator alerts, isolated document rendering, and browser-worker providers remain unconfigured until their destinations, snapshots, budgets, and terms are approved.
