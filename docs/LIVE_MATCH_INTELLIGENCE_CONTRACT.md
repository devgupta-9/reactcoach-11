# Phase 2B — Live synthetic match intelligence contract

The Rust match engine links fictional event evidence to explicitly authored spatial
scenarios. The Phase 2A simulator remains the only authority for movement, opponent
responses, adaptation and tactical evaluation. No language model runs in this path.

## Versions and identities

| Contract | Version |
| --- | --- |
| Match records | `fictional_replay_v2` |
| Optional event context | `synthetic_event_context_v1` |
| Moment / insight | `tactical_intelligence_v1` |
| Authored fixture | `synthetic_scenario_fixture_v1` |
| Spatial engine | `open_play_spatial_v1` |

The demo match ID is `demo-match-001`. Its 23 stable event IDs run from 1 to 23,
ending at second 420 with one Home goal. All players and clubs are fictional.
Replay event coordinates remain **percentages** (0–100). The spatial engine uses
integer **millimetres** on a 105 × 68 metre authored pitch. Home attacks along +x;
Away's event sequence attacks toward decreasing x. Only Home spatial fixtures ship;
Away fixture execution is rejected until explicit coordinate normalization is
implemented, preserving the engine's +x convention.

Existing `MatchEvent` fields keep their types. `match_id` and `context` are optional,
default to absent when reading old JSON, and are omitted when serializing absent
values. Additive `carry`, `pressure` and `interception` event kinds are now emitted;
clients with exhaustive enums must recognize these variants. Existing event names,
score/statistics fields, decision APIs and Phase 2A simulation schemas are preserved.

An optional context has `schema_version` and a tagged `evidence` value:

- `completed_pass`: same-team fictional `receiver`.
- `carry`: `direction` (`forward`, `wide_left`, `wide_right`).
- `pressure`: opposing `ball_carrier` and earlier `possession_event_id`.
- `recovery`: opposing `dispossessed_player` and earlier `possession_event_id`.
- `lost_possession`: earlier opposing `opponent_event_id` with recovery evidence.

References must precede their dependent event in `(timestamp_seconds, id)` order.
Same-second recovery before turnover is intentional. A context cannot refer through
an intervening non-pressure record as though possession were unchanged. Missing
context is allowed: the sparse replay is not a complete possession/tracking log.
Uncontextualized turnovers, interceptions and shots do not manufacture moments.

## Deterministic detection

Both rules require explicit contextual evidence and an attacking-zone anchor:
Home x between 40 and 75 percent, or Away x between 25 and 60 percent. These are
authored eligibility conventions, not universal football thresholds.

1. **Attacking turnover:** loss linked to an opposing recovery, itself linked to an
   attacking possession record no more than five seconds earlier. This selects
   a short possession-losing sequence where changing the preceding decision is
   worth investigating; it does not classify every turnover as a tactical error.
2. **Decision under pressure:** opposing pressure linked to a carry or explicit
   completed-pass receipt three to ten seconds earlier. This identifies an authored
   decision opportunity, rather than deriving defender proximity from coordinates.
   The one-second pressure at event 7 is deliberately ineligible for this rule.

Moment IDs use match/version/source identity; insight IDs additionally name the
detector version and fixture. Detection is independent of input vector order. Stats
are computed from the sorted prefix **through the source event**, excluding later
records even when they share its timestamp. Snapshot queries intentionally include
all records at or before the requested second. Action share remains logged action
share, not possession duration. A goal record counts as one shot, as in Phase 1.

## Authored registry and the two implemented moments

| Trigger | Supporting evidence | Fixture | Relationship | Original action |
| --- | --- | --- | --- | --- |
| 9 at 112s: Home 7 turnover | Carry 6 at 110s; Away 4 tackle 8 at 112s | `turnover-wide-001` | `hypothetical_precursor` | `wide_right` |
| 17 at 335s: Away 4 pressure on Home 7 | Carry 16 at 330s | `pressure-forward-001` | `authored_decision_point` | `direct_dribble` |

The first fixture explores a hypothetical precursor to the loss. The second
explores an authored decision point linked to pressure. **Neither reconstructs
tracking or forces the simulation baseline to match the logged event outcome.**

Each fixture includes schema/fixture/match IDs, trigger and anchor IDs/timestamps,
moment kind, relationship, attacking team, assumptions and a complete Phase 2A
`SimulationRequest`. The two examples use fictional Home 7, Away 4 and stationary
Home 10. Both explicitly reuse the reviewed Phase 2A demonstration geometry, with
different original actions: attacker (45000,34000), defender (52000,36500), teammate
(57000,26000), initial stationary motion and assessed-player ball ownership.
Duration is 4000ms, adaptation at 1200ms and ticks at 100ms. These are model-time
parameters, independent of sparse replay cadence and elapsed match time.

Validation checks source eligibility, versions, team/player identities, trigger and
anchor times, carry/action consistency, unique registry/source links and assumptions.
The authored attacker must be within two percentage points of its carry anchor;
this is a sanity check, **not geometry inference**. The unchanged spatial engine
validates all physical state/configuration. Missing compatible fixtures yield explicit
unlinked moment IDs and no invented insight; corrupt fixtures fail materialization.

## Evidence contracts

`TacticalInsight` contains source records, detection reason and prefix statistics,
authored assumptions/relationship, original and nullable corrective action,
baseline/corrected evaluations and trace references, engine comparison reason,
an evidence-derived plain-language comparison summary, opponent-decision event
references, limitations and typed provenance. A correction
exists only when the engine finds a strictly better feasible branch under its
existing lexicographic possession/bypass/progress/clearance objective.

`InsightDetail` returns that insight, the moment, full fixture and unchanged
`SimulationReport`. `trace_namespace` scopes local engine trace/event IDs:
`scoped_reference = trace_namespace + "/" + raw_report_id`. Alternatives and their
full movement/ball/counter/adaptation evidence remain inspectable. Baseline and
alternatives clone the same initial world; no new scoring formula is introduced.

`provenance` identifies match, fixture, detector and engine versions and labels both
`fictional` and `geometry_authored` true. Version changes must accompany behavioral
or fixture changes before future persisted evidence is reused. There are no
wall-clock timestamps or stochastic claims in the evidence.

## REST and SSE

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/v1/matches/demo/insights?at=112` | Stable array of insights whose trigger time is ≤ `at`; default 420 |
| GET | `/api/v1/matches/demo/insights/{insight_id}?at=112` | Full detail/report; optional time scope |
| GET | `/api/v1/matches/demo/stream?after=112` | Replay records strictly after second 112, then completion |

New endpoints reject invalid/unknown query fields and times outside 0–420 with
HTTP 400. Detail returns 404 for missing insights or those unavailable at the selected
time. Errors use `{ "code": "...", "message": "..." }`. Invalid insight IDs are 400.
No client-controlled fixture execution is introduced; existing bounded simulation
POST remains available independently.

The catalog accepts at most 128 source events and eight fixtures, with existing
Phase 2A duration/branch limits. Startup runs materialization once via
`tokio::task::spawn_blocking` before binding the listener. Immutable `Arc` evidence
and bounded serialized stream/detail records are shared by subscribers. Each full
detail is limited to 512KiB. There are no per-subscriber simulations, background
queues or external services. The existing POST body limit and worker limits remain.

Stream groups keep `match-event`, then append `tactical-insight` immediately after
its trigger. Match events are paced at about 1250ms; insights add no delay.
`replay-complete` retains its old event name and payload. SSE records now have stable
IDs. A reconnection can repeat transport records, but logical IDs remain unchanged;
the browser deduplicates events **before** refreshing snapshots, and deduplicates
insights only after their source IDs are present. `Last-Event-ID` is not a server
cursor in this phase. `after` and timestamp-scoped retrieval restore seek state.

The web client uses one EventSource per replay generation, aborts old REST requests
and closes old streams. Generation and latest-request guards prevent old snapshots
or seek initialization from replacing current state. Evidence selection clears old
detail and aborts the previous request before displaying a new result.

## Verified example

The [turnover insight JSON](examples/live-turnover-insight.json) is captured from
the implemented API. Its [spatial request](examples/live-turnover-simulation-request.json)
can be submitted unchanged to `POST /api/v1/simulations/open-play`.

For event 9 at 112s, the logged source evidence is carry 6, recovery 8 and turnover 9.
The **linked synthetic model**, using `wide_right`, ends with opponent possession;
the engine recommends `release_pass`, which ends with friendly possession and
12000mm forward ball progress. The corrected objective key is `(true,true,12,11)`
versus `(false,false,0,0)` for baseline. The 3028mm raw baseline progress describes
ball movement after possession loss, so it is excluded from the friendly objective.
This is not a claim that a real pass would guarantee success. The pressure fixture
also recommends a pass, but uses `direct_dribble` initially and has a different
defender-clearance result and separate scoped evidence identifiers.

## Limits and later consumption

Detection supports two explicit rules, not general football interpretation. Sparse
events are authored observations; profiles, pressure contexts and geometry are
fictional. The fixtures intentionally share one small world. There is one attacker,
one defender and an optional stationary teammate; movement/braking, ball transport,
interception and defensive feasibility retain all Phase 2A simplifications.
No full-team physics, calibrated probabilities, continuous perception, advanced
offside officiating, Foundry inference or animated tactical studio is implemented.

Foundry in Phase 3 can consume `InsightDetail`, source records, provenance and scoped
trace/event IDs to produce verified explanations. It must not recalculate the
simulation or invent tracking, measurements or numerical outcomes. The approved
execution plan remains unchanged.
