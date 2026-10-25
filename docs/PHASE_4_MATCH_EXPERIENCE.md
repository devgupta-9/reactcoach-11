# Phase 4 — timed tactical moments and match recap

Status: Done locally, 2026-10-26; branch published, CI correction and hosted verification In Progress. Baseline main:
`f5cee67453c99743fe60f8de1a5b0bf5ad3bbd42` (merged PR #4).
Branch: `feat/phase-4-match-experience`.

## Scope and contracts

Extend the existing Match Center with a timed tactical cue and a final recap.
Reuse existing REST/SSE, source records, Rust snapshots/insights, the trace player
and saved Foundry compositions. No new endpoint, simulation, dependency, cloud
resource or paid inference is required. Codex owns implementation; independent
bounded reviews provide input without editing files.

- A cue requires all source records plus a matching verified replay snapshot.
  Its title/time/actions come from the linked insight. It remains eligible for
  120 synthetic replay seconds after its trigger, a presentation convention that
  makes compressed replay readable, not a football or reaction-time measurement.
- Only the most recent eligible moment appears. Dismissal is keyed to logical
  insight identity; repeated records do not restart a cue. Seeking reconstructs
  eligibility from the destination clock. Historical cues are labeled as replay
  moments. No wall-clock timer changes the evidence or replay state.
- Restart/seek clears prior selection, dismissal and recap through the existing
  replay generation. Overlay, recap and cards open one shared evidence viewer
  with request cancellation and identity checks.
- Recap requires SSE completion and a snapshot matching the accepted final
  event's ID, kind, timestamp, match and record count. The current segment ends
  on goal event 23 at 420 seconds, with no `full_time` record. Completion alone is insufficient.
  Delayed/failed final snapshots produce a recoverable pending state.
- Recorded score/statistics/goals remain separate from synthetic tactical
  comparisons. A modeled correction never changes the logged match result.
  No-improvement remains explicit. Coaching is inspected through the existing
  saved explanation with its actual origin/fallback label.
- Preserve the existing palette, football pitch, keyboard navigation, reduced
  motion, source disclosure, mobile layout and all legacy demonstrations.

## Acceptance

Done locally: source-before-cue timing, expiry/dismiss/repeated transport,
same-second events, seek/restart and stale responses, delayed/failed final
snapshot, source-linked recap and nullable recommendations, keyboard,
reduced-motion and mobile checks. Document overflow measured zero at 1440px,
1024px and 390px. Independent screenshot review and full local project gates pass.

Publication, deployment, video and final submission are separate later steps.

## Final local verification — 2026-10-26

Implementation commit: `c23b7d774acd8caa004d3f0b216da76d0036a676`.
Earlier cue commits: `ead7758`, `89a2fdf`.

- `cargo fmt --all -- --check`: passed using `scripts/cargo.ps1`.
- `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings`: passed.
- `cargo test --workspace --all-features --locked`: 104 passed, 0 failed,
  0 ignored (agents 20, analytics 2, API 21, decision engine 41, match engine 20).
  Documentation test targets contain 0 tests.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `npm run test:e2e`: 68 passed, 0 failed, 0 skipped, desktop and mobile,
  2.4 minutes. Includes the existing Foundry explanation, spatial playback,
  decision-lab, penalty/free-kick, offside-position and replay checks.
- Fixed the final-snapshot gate after browser failures exposed its incorrect
  assumption that the fixture contained a `full_time` record. Tests now assert
  the actual final goal and reject mismatched event kinds and timestamps.
- Recap shows recorded goals/score/counts separately from authored tactical
  comparisons. Missing corrective evidence produces an explicit no-improvement
  result. Reload works independently of an invalid seek input.
- Keyboard focus survives cue expiry/dismissal and evidence closing. Seek/restart
  removes old recaps and rejects delayed evidence from a prior replay generation.
- Independent read-only source review and rendered cue/recap review were performed
  through Codex helpers. Screenshot review found no material clipping, overlap
  or source-labeling problems at all three widths. This is not an Agy review.
- `origin/main` was fetched and is an ancestor of this branch. No Rust/API
  contracts, dependencies, cloud resources or saved Foundry compositions changed.

The timed cue sits below the pitch to preserve selectable event markers.
Its 120-second lifetime follows the synthetic replay clock, not wall time.
The recap is deterministic presentation of existing evidence; it does not generate
new AI prose or make paid inference calls. Publication, remote CI and hosted
Phase 4 acceptance have not been performed in this increment.

## Publication and CI correction — 2026-10-26

- Branch pushed at `e31b2fa4b1828237aa2fc3106b0bda89d77beb19`.
  [PR #5](https://github.com/devgupta-9/reactcoach-11/pull/5) targets `main` and remains unmerged.
- [Initial push CI](https://github.com/devgupta-9/reactcoach-11/actions/runs/40226128846)
  passed Rust, infrastructure guards/templates, lint, typecheck and production build.
  Playwright reported 67 passed, 1 failed: the mobile cue containment assertion
  measured its entrance transform before the 200 ms animation finished. The
  visible cue bottom exceeded its natural parent bottom by approximately 1.575 px,
  beyond the unchanged 1 px measurement allowance.
- A one-second test-only entrance reproduced the failure on both desktop and
  mobile. The test now awaits the actual finite Web Animations `finished`
  promises, then samples all three rectangles in one browser evaluation.
  Both focused checks pass. Source timing, containment tolerance, overlap,
  viewport and overflow assertions are preserved; no production CSS changed.
- An independent Codex helper reviewed this diagnosis read-only and agreed that
  the evidence identifies an animation-sampling race. The corrected full local
  suite passed 68 tests, 0 failed/skipped (2.4 minutes); lint and typecheck passed.
  Corrected remote CI and hosted verification remain pending. No Azure rollout
  has occurred.

## Historical verified increments — 2026-10-25

- Baseline: 104 locked all-feature Rust tests passed; formatting and all-feature
  Clippy with warnings denied passed. Rust code and contracts remain unchanged.
- Timed overlay/shared inspection: production build, lint and typecheck passed;
  22 focused desktop/mobile browser checks passed, 0 failed (58.6 seconds).
  Overflow measured zero at 1440px, 1024px and 390px.
- Independent contract review confirmed the frontend boundary and identified
  final-snapshot gating as required. A follow-up source review found repeated
  inspection and closing/dismissal focus issues. Both were corrected and are
  covered by the passing focus regression. Independent visual review is pending.
- Screenshot review caught clipping at 1024px/390px and covered markers at
  desktop width. The root cause was a global `.pitch-stage` collision with the
  existing 3D Studio. A dedicated Match Center wrapper and an in-flow cue below
  the map preserve all interactive markers. Fresh lint/typecheck/build and all
  eight cue checks pass, including cue containment, no map overlap and complete
  Inspect-button visibility at all three widths. Screenshot re-review is pending.
