# Interactive Tactical Studio — local UI slice

Date: 2026-10-13. Branch: `feat/interactive-tactical-ui`, based on the preserved
local Phase 2B commit `b520c7776b61b0a31577ec7a4fce8aee5ceccfd0`.
The owner requested UI improvements before continuing Microsoft Foundry setup.
This does not complete the full broadcast/audience milestone or cloud integration.

## User flow

1. Select the wide-channel turnover (01:52, source events 6/8/9) or pressure
   decision (05:35, source events 16/17).
2. Play the original branch or scrub to a recorded tick. Chapter buttons jump
   to the first decision, initial defender response, adaptation time and outcome.
3. Select the corrected branch when the engine recommends one. Playback resets
   to the same initial state; the alternative changes only at its adaptation time.
4. Inspect a participant on the pitch or using the external role buttons. The
   inspector shows that participant's actual fictional profile and sampled position.
5. Compare recorded friendly possession and forward ball progress. Expand the
   evidence to inspect source IDs, fixture relationship, trace ID and assumptions.
6. Explore the Match Center independently. Click an event dot or timeline record
   to inspect it; live tactical evidence opens the same spatial player. The existing
   editable Decision Lab still evaluates all original scenarios separately.

## Contracts and determinism

- No backend API or numerical model changes. Scene loading uses existing
  `GET /api/v1/matches/demo/insights?at=420` and
  `GET /api/v1/matches/demo/insights/{insight_id}?at=420`.
- The standalone studio is explicitly a scenario preview of authored fixtures.
  Future moments are not injected into the timestamp-scoped live insight list.
- The trace reference is `trace_namespace/trace.id`; step references and elapsed
  time come from the unchanged report. Both branches share one camera frame.
- The angled scene uses native CSS perspective and SVG; no WebGL or animation
  dependencies are added. Pitch coordinates remain integer millimetres in the
  Rust report. Camera transforms do not change simulation positions.
- Animation linearly interpolates positions between 100ms snapshots. Possession,
  tactical events and inspected coordinates use the sampled engine state, not an
  independently simulated browser state. Dotted paths preview the selected branch;
  solid paths show elapsed player movement. This is not reconstructed match footage.
- A missing recommended trace disables corrected playback and reports no better
  option. No client-side scoring or positive recommendation is manufactured.
- Scene changes abort obsolete requests and remount player state. Existing replay
  generation, snapshot and SSE deduplication safeguards are preserved.

## Accessibility and limitations

Keyboard-operable sliders, playback/branch controls, chapter buttons, visible focus,
and an untransformed participant selector support exploration. Reduced-motion users
get manual scrubbing/chapter navigation with animation disabled. Camera changes do
not reset evidence or clock. Mobile layouts stack the pitch and coaching panel.

One attacker, one defender and an optional stationary supporting teammate are
displayed. Role letters A/D/S do not invent jersey numbers. Ball/player markers
are explanatory symbols, not anatomically accurate 3D athletes. No collision
physics, real scouting data, probabilities, LLM output or Azure deployment is added.
Changing ratings in the Decision Lab reruns that lab's existing fit model; it does
not alter the independently authored spatial preview.

## Verification

Final local verification passed on 2026-10-13:

- `cargo test --workspace --locked` via `scripts/cargo.ps1`: **81 passed**, zero
  failed/ignored. No Rust implementation or scoring changes were made.
- `npm run lint`: passed, zero warnings/errors.
- `npm run typecheck`: passed.
- `npm run build`: passed, production static routes generated.
- `npm run test:e2e`: **38 passed**, zero failed/skipped. This includes the original
  24 checks and 14 new Tactical Studio checks across desktop and mobile Chromium.
- Measured horizontal overflow: **0px** at **1440px, 1024px and 390px** widths.
- `git diff --check`: passed. Generated screenshots/test output remain outside
  the committed source diff; no new credentials or dependencies were introduced.

The first browser run passed 36/38 checks; the two failing new checks assumed a
legacy profile label instead of the fixture's actual label. The corrected checks
read the API profile. The complete suite then passed after the visual corrections.

The independent visual reviewer identified overlapping mobile labels, marker/profile
identity ambiguity, a missing opponent-response caption and weak camera affordances.
These were addressed with selected-only labels, A/D/S roles, external selection
buttons, an explicit response caption and outlined camera controls. This was a local
independent visual critique, not an Agy bridge review or Foundry model call.
The reviewer inspected the final desktop/mobile/lab renders and confirmed all
four findings were resolved, with no remaining concrete visual defects reported.

## Ball visibility correction — 2026-10-27

Player billboard planes could cover the ball in the angled camera despite its
DOM visibility and z-index. The ball marker now faces the camera and uses
foreground presentation depth. The angled shirt's role letter sits higher so
the visible ball does not cover it. Player positions and hit targets stay the
same, and an explicit overhead offset preserves the accepted overhead appearance.

These are CSS display conventions, not physical ball height or changes to Rust
coordinates, ownership, timing or simulation results. Camera transitions and
reduced-motion preferences remain supported. A browser regression checks five
points on the ball across both fixtures, branches and cameras, including held,
in-flight and final possession; it also checks the initial angled role marker.
The foreground ball can briefly cross a shirt letter during a pass; participant
labels and role controls remain available. Local lint, typecheck, production
build and all 70 Playwright tests passed (0 failed), including zero horizontal
overflow at 1440, 1024 and 390px. Independent source and screenshot reviews were
performed. Publication and a new Azure rollout remain separate from this local
verification.
