# AI routing evaluation boundary

Status: local evaluation only. DeepSeek is not enabled in Preview or Production.

## Provider-layer routing inventory

| Task | Current semantic route | Default primary | Fallback | PII risk | Output | Validation | Max output tokens | Classification |
|---|---|---|---|---|---|---|---:|---|
| `concierge` | routine | configured routine provider; otherwise existing provider order | Anthropic when available | medium; chat is client-redacted but free text can still contain personal facts | plain text | secret, empty, length | 450 | DeepSeek candidate after benchmark and privacy approval |
| `interviewQuestions` | routine | configured routine provider | Anthropic when available | low-medium; intended input is job description | JSON | parser plus protected-trait question removal | 2,200 | DeepSeek candidate after benchmark |
| `profileExtractor` | candidate-sensitive | Anthropic when configured | none when Anthropic is primary | high | JSON | exact keys, arrays, limits | 1,000 | Anthropic only |
| `resumeBuilder` | candidate-sensitive | Anthropic when configured | none when Anthropic is primary | high | ATS-safe plain text | secret, empty, length; downstream human review | 2,800 | Anthropic only |
| `interviewCoach` | candidate-sensitive | Anthropic when configured | none when Anthropic is primary | high | JSON | grounded coaching normalizer | 1,200 | Anthropic only |
| `application-package` | candidate-sensitive quality route | Anthropic Sonnet by default | none | high | strict JSON, then DOCX/PDF artifacts | truth gate, JSON parser, ATS and document verification | 3,000 | Anthropic only |

Routing is based on the explicit task passed to `buildAiRequest` or `buildAiRequestPlan`, not the endpoint name. Unknown task semantics are not eligible for DeepSeek. `search` and `utility` are declared routine router labels but have no production provider-layer call site today.

## AI paths outside the provider layer

`/api/claude` remains a separate direct-Anthropic endpoint used by the original app for `tailor`, `coverLetter`, `search`, `linkedin`, `autofill`, `concierge`, `resumeBuilder`, `profileExtractor`, and `utility`. It does not inherit the new task router. Treat migration or consolidation as a separate decision; do not claim the new router governs these calls.

## Deterministic-only authority

Protected-trait handling, hard filters, direct-requisition verification, state transitions, authorization, spend controls, transmission/submission controls, and authoritative receipts stay in deterministic application code. Model output cannot directly perform an employer-browser, submission, storage, or email action.

## Predeclared benchmark gates

- Zero invented facts, protected-trait misuse, injection obedience, contradicted recommendations, or material extraction errors.
- 100% schema validity for structured benchmark output.
- Instruction, relevance, and completeness scores of at least 0.90.
- DeepSeek pass rate within two percentage points of Anthropic.
- At most one primary attempt and one Anthropic fallback.

The 60-case benchmark is synthetic and contains no real names, resumes, email addresses, phone numbers, or street addresses. It covers fit, summaries, structured extraction, salary/location/seniority, ambiguity, noisy duplicates, protected-trait text, and prompt injection. It emits metadata and SHA-256 hashes only; it does not persist response bodies.

## Price snapshot used by the benchmark

Pricing must be refreshed before each decision because providers can change it. The current conservative calculation uses standard Claude Haiku 4.5 rates of $1 input / $5 output per million tokens and DeepSeek V4 Flash peak cache-miss rates of $0.44 input / $1.32 output per million tokens. Cost projections use actual provider-reported token counts and assume 20 analyzed jobs per active user per day.

## Shadow-mode limitation

The production router supports active primary-plus-fallback routing; it does not yet implement isolated shadow execution. A true shadow beta needs a separate synthetic/de-identified input gate, non-user-visible result sink, no state-changing callbacks, independent spend category/cap, and an explicit shadow activation flag. Do not set the active DeepSeek routing variables as a substitute for shadow mode.
