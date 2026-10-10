# Phase 2B — Local verification and handoff

**Date:** 2026-10-10. **Status:** Done — local implementation and automated verification;
final independent review Blocked, owner acceptance/publication Pending.
**Branch:** `feat/phase-2b-live-match-intelligence`.
**Baseline main commit:** `df4a4b570998ae6dfc25c11b199f72db95eb264c`.

Phase 1, Phase 2A and the approved hackathon execution plan were verified merged
before branching from updated `origin/main`. The initial working tree was clean.
Baseline locked workspace verification passed **61 Rust tests**, zero failed/ignored.
Previous feature branches were preserved. No global AI configuration was changed.

## Proper Tasks and implemented scope

| Proper Task | Status / evidence |
| --- | --- |
| 1. Repository/environment | Done: updated main, merged Phase 2A, approved scope, clean branch and 61-test baseline |
| 2. Agy capabilities/architecture review | Done: enrolled bridge and bounded independent review completed |
| 3. Fictional match replay | Done: 23 ordered records, additive carry/pressure/interception and optional typed context |
| 4. Moment detection | Done: two deterministic rules; two demo moments at 112s and 335s |
| 5. Scenario integration | Done: two validated authored fixtures invoke the unchanged Phase 2A engine |
| 6. Evidence-backed insights | Done: source observations, assumptions, nullable correction, full reports and scoped evidence |
| 7. REST/SSE/frontend | Done: additive list/detail and insight SSE; cards, evidence inspection, seek/restart guards |
| 8. Verification | Done: 81 Rust and 24 browser tests; all required quality/build gates pass |
| 9. Final Agy review | Blocked: required headless permission, then file-only retry timed out; no final findings returned |
| 10. Documentation/release preparation | Done locally; publication and owner acceptance remain Pending |

## Demonstration and reproducibility

- Event **9 at 112s**: Home 7 loses possession, supported by carry 6 and opposing
  recovery 8. `turnover-wide-001` is a **hypothetical precursor**, not a reconstruction.
  The spatial `wide_right` baseline loses friendly possession. `release_pass` retains
  it, reaching 12000mm forward ball progress and objective `(true,true,12,11)`.
- Event **17 at 335s**: explicit Away 4 pressure on Home 7, supported by carry 16.
  `pressure-forward-001` is an **authored decision point**. `direct_dribble` loses
  friendly possession; `release_pass` retains it, with objective `(true,true,12,9)`.
- Both fixtures intentionally reuse one reviewed three-participant geometry. Their
  original action, moment kind, source IDs and resulting evidence differ. Every
  alternative starts from its fixture's identical initial world.
- Unit coverage includes no-improvement states: correction/action/trace/evaluation
  remain null, with an explicit absence of recommendation.

Source statistics, record counts and goal/shot totals are calculated from events.
Snapshot final score remains **1–0**, with Home/Away passes **8/2**, shots **2/1**,
and **23** processed records. Prefix statistics exclude later same-second records.

The [live intelligence contract](LIVE_MATCH_INTELLIGENCE_CONTRACT.md) documents
API schemas, detection conventions, fixture semantics, resource limits, versions
and replay behavior. Checked-in [insight JSON](examples/live-turnover-insight.json)
and [spatial request](examples/live-turnover-simulation-request.json) are runtime
captures for reproducible evidence inspection.

## Verification record

Required commands use `scripts/cargo.ps1` on this Windows environment. No toolchain
install, dependency upgrade or global PATH change was needed. `Cargo.lock` adds
only existing local workspace/Serde dependencies for the integration. Tokio's
existing test-time clock feature supports deterministic SSE tests.

| Check | Final recorded result |
| --- | --- |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passed |
| `cargo test --workspace --locked` | 81 passed, 0 failed, 0 ignored |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm run test:e2e` | 24 passed, 0 failed/skipped in desktop/mobile Chromium against the latest implementation |
| Responsive evidence card | 0 horizontal overflow at 390px and 1024px; screenshots captured |
| API runtime evidence | Both insights inspected; sample request reproduced the entire report and saved insight matched API; turnover detail 142821 bytes |

Rust breakdown: agents **1**, analytics **2**, API **17**, decision engine **41**,
match engine **20**, shared **0**. Doc-test targets contain **0** tests.
The browser suite contains the original **14** regression checks plus **10** new
insight checks (five cases on desktop and mobile). It tests live timing, correct
evidence selection, late detail responses, seeking, error recovery, duplicate
transport records, early-insight rejection and late seek initialization.

New API/SSE coverage verifies time-scoped lists/detail, stable serialization,
structured errors, unavailable IDs, bounded payloads, trigger-before-insight,
simultaneous subscribers, repeat connection identity and seek consistency. New
domain tests cover malformed fixtures, IDs/times/context versions, source causality,
stale possession references, missing fixtures, repeated simulations, same-start
branches, statistics, trace identity and provenance. All Phase 2A tests remain.

Initial development failures were corrected: old API count expected nine records;
the SSE test used an unavailable Event byte method; the shared test router moved
out of scope; a JSON fixture compared integer versus floating coordinates; Clippy
rejected an oversized error variant; and frontend lint rejected synchronous effect
resets. The final design uses the unchanged legacy test seam, HTTP-serialized SSE,
small error values, and replay-generation display guards.

## Independent reviews

Architecture review succeeded through Peer Capabilities **0.4.0-dev.0**, CLI **1.3.2**,
requested **Gemini 3.1 Pro High**, high effort, REVIEW mode, 240-second bound.
The repository was `ENROLLED`, registry-authorized and ready. No files were changed
by the reviewer. CLI arguments attest requested selection, not independently the
serving backend. The bridge does not expose an actual monetary charge.

Findings and dispositions:

- Serialization compatibility: confirmed requirement, addressed by optional
  fields with Serde defaults and absent-field omission, with legacy JSON regression.
- Same-second causal ordering: addressed with explicit timestamp/ID ordering,
  reference validation and inversion tests. Changing sorting to a football-kind
  hierarchy was rejected because it would silently change established replay order.
- Broader pressure/unforced turnover coverage: pressure contexts accept explicit
  pass receipts; uncontextualized turnover records remain valid. Automatic spatial
  analysis beyond compatible authored fixtures remains deliberately out of scope.
- Coordinate mismatch: fixture-to-anchor sanity checks added. Full defender/ball
  geometry remains openly authored, rather than inferred from event percentages.
- Reconnect clock risk: deduplicate before snapshot refresh; generation/cancellation
  guards and browser regression checks added.

Fresh discovery before final review reported CLI **1.3.3**, the same usable model,
REVIEW/READ_ONLY modes and enrolled repository access. No bridge reconfiguration
was performed.

Final review attempts did **not** produce an independent approval:

1. Gemini 3.1 Pro High / high / REVIEW / 240-second bound was blocked with:
   "Antigravity was blocked by a required permission. Headless mode cannot ask for
   approval. Review the exact command in official CLI permissions; existing deny/ask
   rules take precedence. No bypass was attempted."
2. A narrower view-file-only review, same exact model/effort, 180-second bound, failed:
   "Antigravity invocation timed out. No retry or model substitution was attempted."

No permission configuration, model substitution or approval bypass was used. Git
status and SHA-256 hashes of reviewed source/document files were unchanged after
both attempts. Final independent correctness and image critique remain unverified.
Codex completed the local audit and added a regression rejecting Away fixtures
that would otherwise simulate in the engine's unsupported +x attack direction.
The automated/runtime checks passed after this correction; the peer did not
author implementation code or identify this defect.

## Local commit sequence

- `225c87f`: source records, moment detection, authored fixture orchestration and API/SSE.
- `237dc4c`: minimal insight UI, evidence navigation and desktop/mobile replay regressions.
- `09bc978`: reject unsupported Away spatial direction, with a focused regression.
- Final documentation commit: contract, captured examples, current roadmap and this
  verification record. Its SHA is reported by Git in the delivery report.

## Limitations and next gate

Only two moment rules and two Home attacking fixtures ship. Both use the same small
authored world. Sparse records are not full tracking or continuous possession;
pass-receipt detection cannot itself invent a dribble fixture. Missing links yield
no fabricated result. Player ratings, response indices and movement parameters
are uncalibrated synthetic conventions. Phase 2A's bounded L1 movement, stationary
teammate, simplified ball/interception and horizon-based responses remain unchanged.

SSE reconnection can repeat transport frames; logical IDs and client guards prevent
new/duplicate insights. `Last-Event-ID` is not implemented as a server resume cursor.
REST `at` and SSE `after` provide deterministic seeking. No persistent cache,
database, external service, Foundry inference, full-team simulation or animation
studio was introduced.

Foundry can later consume `InsightDetail` with exact source/trace references and
provenance. Phase 3 implementation must wait for owner approval of this milestone.
This branch remains **local, unpublished and unmerged**; no Phase 2B PR is opened.
The approved plan's scope, dates and historical status text are preserved; roadmap
status is the current delivery record.
