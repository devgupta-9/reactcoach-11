# Phase 4 — timed tactical moments and match recap

Status: In Progress, 2026-10-25. Baseline main:
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
- Recap requires completion and a full-time snapshot matching the accepted final
  event, timestamp, match and record count. Completion alone is insufficient.
  Delayed/failed final snapshots produce a recoverable pending state.
- Recorded score/statistics/goals remain separate from synthetic tactical
  comparisons. A modeled correction never changes the logged match result.
  No-improvement remains explicit. Coaching is inspected through the existing
  saved explanation with its actual origin/fallback label.
- Preserve the existing palette, football pitch, keyboard navigation, reduced
  motion, source disclosure, mobile layout and all legacy demonstrations.

## Acceptance

Pending: source-before-cue timing, expiry/dismiss/reconnection, same-second events,
seek/restart and stale responses, delayed/failed final snapshot, source-linked
recap and nullable recommendations, keyboard/reduced-motion/mobile checks,
overflow at 390px and 1024px, independent screenshot review and full project gates.

Publication, deployment, video and final submission are separate later steps.

## Verified increments

- Baseline: 104 locked all-feature Rust tests passed; formatting and all-feature
  Clippy with warnings denied passed. Rust code and contracts remain unchanged.
- Timed overlay/shared inspection: production build, lint and typecheck passed;
  22 focused desktop/mobile browser checks passed, 0 failed (58.6 seconds).
  Overflow measured zero at 1440px, 1024px and 390px.
- Independent contract review confirmed the frontend boundary and identified
  final-snapshot gating as required. A follow-up source review found repeated
  inspection and closing/dismissal focus issues. Both were corrected and are
  covered by the passing focus regression. Independent visual review is pending.
