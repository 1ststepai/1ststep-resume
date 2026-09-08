# Low-attention Job Agent experience

Product acceptance standard supplied by the user. Applies to mobile and desktop.

- One main decision per screen. Lead with what needs attention now.
- Use short familiar sentences, readable contrast and type, generous spacing,
  keyboard focus and screen-reader labels. Controls should be at least 44px high.
- Show at most three decision facts before optional details. A job card groups
  employer/role, remote/base pay, and why it matches, followed by one next action.
- Label actions specifically: Review application, Fix missing answer, Approve and
  continue, Open employer confirmation. Do not imply approval starts unrestricted work.
- Preserve automatic saving, back/correct/cancel and existing authorization limits.
  Never describe tab-only persistence as cross-device backup.
- Before approval, show: Nothing will be sent until you approve this application.
- Review sections cover proposed answers, personal information, attachments,
  qualification gaps, and source evidence. Masked previews alone are not a complete
  transmission review: the user must be able to inspect the exact outgoing form and files.
- Distinguish information entered, application sent, and employer confirmed receipt.
  Unknown receipt is not failure and never permission to submit again.
- Never invent queue counts or explanations. Missing remote/location eligibility,
  unsupported resume experience and absent receipt must be stated directly.
- Keep technical diagnostics and audit tools out of the main journey.

## Current implementation boundary

This release adds an attention entry point, one expanded Needs You request, optional
review sections, plain-language job-card explanations and larger controls. Existing
approval handlers and automatic-saving behavior are unchanged. This is not proof
of authenticated persistence, exact outgoing-value review, or employer execution.

Remaining acceptance work: authenticated desktop/mobile walkthrough of every stage;
exact outgoing personal-value and attachment review; a complete evidence-derived
entered/sent/received presentation; all setup/optional-tool copy and focus paths;
and tests with first-time users. Do not claim the full standard is completed yet.
