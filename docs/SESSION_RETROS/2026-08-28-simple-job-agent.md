# Simple Job Agent implementation retro

## Scope

Reframed the Concierge from an operations console into a low-touch job-agent launch experience while preserving resume creation/upload, chat guidance, saved answers, application records, approval gates, simulated application recovery, and existing self-service tools.

## Decisions

- Made `Upload resume`, `Build mine`, one natural-language job request, and `Start my job search` the only primary setup choices.
- Moved campaign configuration and detailed evidence controls into a collapsed advanced section.
- Kept the chat visible below the launch form so the user can refine the mission and answer occasional targeted questions without opening the records interface.
- Added honest runner status because this static release does not contain a production job-discovery worker or external application executor.
- Kept all existing element IDs needed by the legacy records, campaign, readiness, and demo modules to avoid breaking preserved capabilities.

## Verification

- `npm run test:concierge`
- `npm run smoke`
- `git diff --check`
- Desktop browser inspection at 1440 x 1000
- Mobile browser inspection at 390 x 844
- Resume-upload overlay interaction check
- No browser console errors during responsive QA

## Follow-up

Production autonomy still requires an authenticated, tenant-isolated backend; live multi-source discovery; direct-employer verification; durable orchestration; document generation storage; and controlled browser/application execution. Those capabilities must retain the existing action-time approval, credential, OTP, CAPTCHA, and authoritative-receipt boundaries.
