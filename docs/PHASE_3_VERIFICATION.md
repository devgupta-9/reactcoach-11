# Phase 3 — Foundry coaching verification

Date: 2026-10-25. Status: **Published branch and Azure rollout Done; draft PR awaiting connector confirmation**. Branch:
`feat/phase-3-foundry-intelligence`. Baseline:
`4fba1b457fae0724eae56e0a9bb8ac7b89062b5b` (`feat/azure-release-prep`).

## Proper Task and sub-tasks

| Sub-task | Status and evidence |
| --- | --- |
| Repository and approved scope | Done: existing Phase 2B/UI/deployment preserved; isolated Phase 3 branch |
| Official Microsoft API contract | Done: Responses `text.format`, strict schemas, Entra scope, no stored conversation |
| Typed evidence and Rust validation | Done: full input/output/catalog/prompt fingerprint; mandatory context and audience parity; no arbitrary prose |
| Interpreter → Challenger → Narrator | Done locally: optional administrative Rust binary, three bounded roles per insight; mock and adversarial tests |
| API and audience panel | Done locally: additive coaching JSON, Fan/Analyst views, provenance and visible deterministic fallback |
| Real model acceptance | Done: separately approved corrected job generated both explanations in six completed calls; receipts and evidence binding checked |
| Local regression checks | Done: final artifact passes 104 all-feature Rust tests, 98 default Rust tests and 44 browser checks |
| Independent architecture review | Blocked: Agy headless permission prompt; no independent approval |
| Independent screenshot review | Blocked: helper usage limit; Codex inspected narrow and desktop screenshots; browser overflow checks passed |
| Deployment/publication | Done: owner authorized publishing and deployment; branch pushed and new API/web revisions ready. Draft PR creation awaits the GitHub connector's Submit confirmation |

The local verification sections below preserve the initial acceptance record.
The later publication section records the separately authorized Azure release.

## Verified local checks before real generation

All commands use the existing `scripts/cargo.ps1` Windows wrapper where applicable.

| Check | Result |
| --- | --- |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passed |
| `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings` | Passed |
| `cargo test --workspace --locked` | 97 passed, 0 failed, 0 ignored |
| `cargo test --workspace --all-features --locked` | 102 passed, 0 failed, 0 ignored |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, production static page build |
| `npm run test:e2e` | 44 passed, 0 failed, 0 skipped; Chromium desktop/mobile, 3.3 minutes |
| Generation `--plan` | Passed; two ~6 KB packets; zero Azure operations |
| All-feature dependency MSRV metadata | All resolved packages declare at most Rust 1.85; actual Rust 1.85 compiler not run |
| Public API inference dependency | Optional provider disabled in normal API build; no public generation operation |

The counts are separate suite executions, not additive unique-test totals. New
tests cover structured selection, mandatory facts, hallucinated free prose,
challenger veto, mismatched audiences/wordings, missing/stale/malformed artifacts,
duplicate role receipts, no-improvement honesty, strict Responses request shape,
authentication/quota/server/refusal/incomplete failures, request/response limits,
timeout without retry, additive API compatibility and source-linked audience UI.
Existing simulation, replay/SSE, stale-request, profile editing, penalty/free-kick,
offside-position and Tactical Studio browser tests remain green.

One initial browser startup attempt could not run because the dependency lockfile
was being updated during server startup. After the dependency operation finished,
the full 44-test execution passed. No assertions were weakened or skipped.

## Final artifact acceptance

After installing the real artifact, the full locked workspace suite passed
**104 tests** with all features and **98 tests** with default features. Both
executions had **0 failed and 0 ignored** tests. Final formatting and all-feature
Clippy checks passed. Lint, typecheck and a fresh production build passed.

The final browser execution against the real artifact passed **44/44** checks
(0 failed, 0 skipped; 3.3 minutes). Both audiences display verified Foundry
composition labels and identical fact sets; incompatible or mismatched coaching
data preserves the original trace viewer. The existing request cancellation,
replay, football scenarios and mobile/desktop checks remain green. Narrow-width
overflow differences were zero at 390px and 1024px. The temporary test servers
stopped after the run; no listeners remained on 3000/8080.

The public read-only API was separately called to capture
[the actual turnover response](examples/coaching-turnover-response.json), including
all source clauses, the stable explanation identifier and three real receipts.
No remote deployment or hosted Phase 3 browser verification was performed.

## Review and corrections

- Corrected an event enum reference to use the shared contract crate.
- An optional HTTP dependency initially resolved ICU packages requiring Rust 1.88.
  The committed lock selection uses `idna_adapter` 1.2.0 and ICU 1.5, preserving
  the documented Rust 1.85 floor. Existing package versions were preserved.
- HTTP redirects and protocol/application retries are disabled. Requests,
  responses, timeouts, stages and output tokens are bounded.
- Added CI `--all-features` verification so optional provider tests are exercised.
- Browser explanations check source identity and reject incompatible schemas;
  original deterministic evidence remains available.
- The first approved real job attempted one Interpreter request for each moment
  (two requests total). Both were rejected before accepting a stage receipt.
  The preceding successful Azure smoke record confirms Responses reports
  `model: reactcoach-coach`, while the initial validator only accepted the
  underlying `gpt-5-mini` label. The validator now accepts the exact configured
  deployment alias as well; unknown deployment labels still fail closed. The
  failed artifact was retained locally and was not installed or portrayed as AI
  output. No automatic retry occurred. Token usage for those rejected responses
  was not retained, so no token count or charge is invented.

Fresh Agy discovery reported bridge `0.4.0-dev.0`, CLI `1.4.7`, enrolled repository,
and exact supported `gemini-3.8-flash-high` / `high`. The bounded read-only
architecture delegation was blocked by a required permission prompt in headless
mode. No settings were changed to bypass it, and no peer implementation was
integrated. Independent visual review also returned no findings because the
helper hit a usage limit; neither review is recorded as passed.

## Real generation record

The owner separately approved the corrected six-call job. It completed with no
retries and six distinct `resp_…` identifiers, all reporting deployment label
`reactcoach-coach`. Both Challenger stages accepted the selected evidence. Both
audiences retain all eight source-bound facts with observed/authored context first
and model limitations last. The model selected different approved wording variants
across audiences and moments; it did not publish arbitrary prose.

| Linked moment | Interpreter output | Challenger output | Narrator output | Total input tokens | Total output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Event 9 / 112s, turnover-wide-001 | 55 | 60 | 204 | 4,781 | 319 |
| Event 17 / 335s, pressure-forward-001 | 55 | 60 | 204 | 4,736 | 319 |
| Successful job total | 110 | 120 | 408 | 9,517 | 638 |

Successful-job total usage: **10,155 tokens**, including 638 output tokens against
the approved 2,560 cap. This excludes unretained usage from the initial two
rejected calls; eight paid requests were attempted across the two separately
approved jobs. No monetary charge is inferred from these counts.

The reviewed 6,932-byte successful artifact is checked in at
`crates/agents/fixtures/foundry-demo-v1.json`. Source digests:

- Turnover: `57e321777a6077cb925c9094ad0c2449344244a7f6743840d2fa7ee142a0ea38`
- Pressure: `4bac44e562b8e8944d8058e480988a32eaf9758623a8467db8126e2fa58418b9`

A release-artifact regression test requires both explanations to resolve against
the current full evidence and prompt/catalog policy, with six unique receipts.
Stale source or wording changes cannot silently retain an outdated AI label.

## Publication and hosted acceptance — 2026-10-25

The owner separately authorized publishing and deploying this verified build.
The branch was pushed at application commit
`4080f3e866a3cdf8082ccfc201c8e69c896edc2e`. It contains the previously unpublished
Phase 2B/UI/Azure packaging history as well as Phase 3: 18 commits ahead of main
and none behind at publication. No merge or force push was performed.

[GitHub Actions run 40201083100](https://github.com/devgupta-9/reactcoach-11/actions/runs/40201083100)
passed for that exact commit. All three jobs passed: infrastructure guards/Bicep,
Rust formatting/all-feature Clippy/locked tests, and Next.js lint/typecheck/build
plus Playwright. Production npm audit reported **0 vulnerabilities**; the three
local non-deploying guard checks also passed. Publication documentation is a
separate follow-up commit; its CI status is checked after pushing it.

Only the two existing Container Apps were redeployed. Existing resource group,
registry, environment, pull identity, CPU/memory and 0–1 replica limits were
retained. No new infrastructure, model credentials, paid inference or identity
role changes were introduced. Immutable images, rollback references and full
hosted results are recorded in [Azure deployment](AZURE_DEPLOYMENT.md).

- Public web: https://reactcoach-demo-web.mangoglacier-0e0808c4.eastus2.azurecontainerapps.io
- Public API: https://reactcoach-demo-api.mangoglacier-0e0808c4.eastus2.azurecontainerapps.io
- Hosted Playwright: **44 passed, 0 failed, 0 skipped**, desktop/mobile, 5.2 minutes.
- Public endpoint/security/SSE smoke: **18 passed, 0 failed**.
- Both actual public coaching endpoints return `foundry_composition`, stable
  source-bound explanations, identical audience fact sets and six unique saved
  role receipts across the two moments. Neither viewing nor testing invokes a model.
- API startup logs confirm both explanations were materialized as Foundry
  composition in the ready release revision.

The extra SSE probe initially expected 23 streamed records from `after=0`.
The documented stream strictly excludes records at or before that timestamp;
the client loads the kickoff in its initial snapshot. The probe was corrected
to assert one snapshot event plus exactly 22 unique later stream records and
two correctly ordered insights. No deployed code or existing assertions changed.

The GitHub connector displayed its required PR confirmation form. Draft PR
creation remains awaiting **Submit**; it has not been reported as completed.
The feature branch and Azure release are published, but main remains unchanged.

## Remaining acceptance and limitations

The design uses **constrained AI narrative composition**: real model choices
select/order vetted evidence wording; Rust renders every sentence. It is not
unrestricted model-written analysis or an Azure hosted Agent Service deployment.
Three stateless role calls do not require Microsoft Agent Framework.

Real generation is nondeterministic; replaying a fixed validated saved artifact
is deterministic. Content fingerprints are not cryptographic provider signatures.
Saved explanations are explicitly precomputed and do not prove live provider
availability. Missing/rejected artifacts produce a clearly labeled fallback.

The authorized release reuses the existing cloud resources and API identities.
No public model endpoint, database, queue or paid visitor inference is introduced.
Branch publication and hosted Phase 3 acceptance are recorded above; main is unmerged.
The existing INR 300 alerts do not stop spending. Billing results must come from
Azure cost reporting; token receipts are not a fabricated rupee charge.

Phase 4 full broadcast overlay, recap, favorites and broader personalization remain
outside this milestone. See [the coaching contract](FOUNDRY_COACHING_CONTRACT.md).
