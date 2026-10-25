# ReactCoach 11 — architecture

## Phase 1 vertical slice

```text
Synthetic events (fictional, checked into Rust source)
    -> reactcoach-match-engine (validation, deterministic ordering, score)
    -> reactcoach-analytics (pure, evidence-computable counters)
    -> Axum JSON snapshot + Server-Sent Events endpoints
    -> Next.js client (scoreboard, pitch, timeline)
```

Rust workspace:
- `crates/decision-engine`: validated synthetic traits, scenario action scores,
  discrete opponent best-response arbitration, and separate offside-position geometry.
- `crates/shared`: serializable event, statistics, snapshot contracts.
- `crates/analytics`: counts discrete actions; explicitly avoids a misleading time-possession estimate.
- `crates/match-engine`: validates records/context, computes reproducible snapshots, detects tactical moments and links authored fixtures to spatial evidence.
- `crates/agents`: typed coaching evidence/validation and saved artifact resolution;
  optional `foundry` feature adds administrative Responses transport and generation CLI.
- `apps/api`: Axum REST/SSE API with tracing and origin-restricted CORS.
- `apps/web`: Next.js presentation.

The legacy decision-lab path remains independently available:

```text
Editable synthetic assessed-player and opponent profiles + scenario
    -> Axum validation (16 KB request limit; public inputs marked synthetic)
    -> Rust evaluates three actions using the same starting profiles
    -> Rust evaluates two counters per action and selects the strongest counter
    -> Counter suppression reduces the action's heuristic fit index
    -> Original / recommended action, index-point delta, and template coaching text
    -> Next.js comparison and opponent counter review
```

The legacy decision lab compares a single decision with a discrete response. Its
scoring model remains unchanged. The additive Phase 2A simulation path below owns
position, velocity, ball transport and elapsed-time state.
Profile `acceleration` is a synthetic trait index, not a physical acceleration.
Offside is a separate scalar position check at the pass instant; it is not a
complete Law 11 offence assessment. Coaching explanations are deterministic
templates. Phase 3 composes separate evidence-linked narratives without changing
these calculations; see the administrative boundary below.

Scenario changes cancel pending evaluations. Profile editing is paused during
evaluation, and unapplied edits are labeled. Replay snapshot responses are applied
only if they belong to the most recently requested snapshot.

## Phase 2A spatial decision simulation

```text
Validated versioned synthetic profiles + initial world state + bounded config
    -> integer mm / 100ms decision-engine::simulation movement controller
    -> spatial feasibility screen + existing opponent strength/weakness indices
    -> defender counter, then assessed-player adaptation and another counter
    -> same-start baseline and corrective branches, full tick/event evidence
    -> possession / bypass / progress / clearance objective comparison
    -> additive Axum simulation API (four bounded blocking workers)
```

`simulation/contracts.rs` owns typed Serde contracts; `motion.rs` owns integer
movement, braking, ball segments and parameter conversions; `rollout.rs` owns
validation, opponent policy, adaptation and comparison. Traces expose participant
IDs and world snapshots for a future animated pitch. No frontend redesign or
external AI service is part of this milestone. Law 11 assessment remains separate.

See [the versioned contract and modeling assumptions](SPATIAL_SIMULATION_CONTRACT.md)
and [Phase 2A verification](PHASE_2A_VERIFICATION.md). The supporting teammate is
stationary; movement budgets use conservative L1 geometry; response feasibility
is a horizon preview and does not guarantee timely interception. These are explicit
uncalibrated modeling conventions, not realistic biomechanics or success probabilities.

## Data integrity and AI safety

1. All events are explicitly labeled synthetic, and no proprietary match feed is required.
2. Raw event records are the source of truth; never ask an LLM to invent numeric match statistics.
3. Phase 2B separates source observations, authored assumptions and simulation results with versioned evidence identifiers; Foundry narratives and validators remain Phase 3.
4. Current action share is the proportion of logged actions and must not be described as possession.
5. The demo replays a short fictional match sequence, not a live league fixture.

## Remaining release work

- Review/merge published Phase 4 PR #5; Azure rollout and hosted acceptance passed.
- Demo video and final submission; optional broader audience personalization remains deferred.
- Retained cloud observability and release automation within the approved budget.
- Persistence only if a concrete requirement emerges; the current demo remains stateless.

## Current API surface

| HTTP | Path | Response |
| --- | --- | --- |
| GET | /api/v1/health | service status |
| GET | /api/v1/decision-lab/demo?scenario=open_play | synthetic matchup (also penalty, free_kick) |
| POST | /api/v1/decision-lab/evaluate | validated editable profiles and matchup report |
| GET | /api/v1/offside/demo | original and corrected offside-position examples |
| POST | /api/v1/simulations/open-play | bounded baseline and adaptive spatial traces |
| GET | /api/v1/matches/demo/events | all demo events |
| GET | /api/v1/matches/demo/snapshot?at=420 | deterministic snapshot at second |
| GET | /api/v1/matches/demo/insights?at=420 | timestamp-scoped tactical insight array |
| GET | /api/v1/matches/demo/insights/{insight_id}?at=420 | source/fixture evidence and full spatial report |
| GET | /api/v1/matches/demo/insights/{insight_id}/coaching?at=420 | precomputed validated audience explanations or explicit fallback |
| GET | /api/v1/matches/demo/stream?after=112 | replay SSE: match-event, tactical-insight, replay-complete |

The stream replays 23 fictional records about every 1.25 seconds. Insights follow
their triggers without another simulation or delay. Reconnection can repeat stable
transport IDs; the browser deduplicates before updating its clock. Seeking restores
timestamp-scoped events/snapshot/insights and starts the stream strictly after that
time. The client closes the connection on completion and cancels old replay/detail
requests on navigation.

## Phase 2B match-triggered tactical evidence

```text
Versioned fictional events and optional typed context
    -> deterministic attacking-turnover / pressure detection + prefix statistics
    -> validated registry: trigger -> authored scenario, not inferred tracking
    -> unchanged decision-engine::simulation baseline and correction rollouts
    -> typed observations + assumptions + comparison + provenance + trace references
    -> once-per-startup blocking materialization, immutable bounded Arc catalog
    -> additive insight list/detail + SSE after each triggering event
    -> restrained Match Center cards, evidence details and replay/seek guards
```

`match-engine/fixtures.rs` owns authored records and context validation;
`match-engine/intelligence.rs` owns detection, fixture validation and orchestration;
`apps/api/src/intelligence.rs` materializes and serves bounded evidence. Two fixtures
link event 9 at 112s and event 17 at 335s to a fictional Home 7 / Away 4 / Home 10
world. The turnover fixture is a hypothetical precursor; the pressure fixture is an
authored decision point. No simulation result is presented as observed tracking.

See [Phase 2B contracts and limitations](LIVE_MATCH_INTELLIGENCE_CONTRACT.md).
Future Foundry agents can consume the same detail/report identifiers; no model
calls, persistence, extra infrastructure or simulation-engine rewrite are introduced.

## Phase 3: bounded Foundry narrative composition

```text
Immutable InsightDetail → typed approved evidence/wording catalog
    → administrative CLI: Interpreter → Challenger → Narrator (Foundry Responses)
    → Rust validation of source IDs, selections, audience parity and stage receipts
    → reviewed versioned artifact bound to full evidence, wording and prompt policy
    → API startup validation on existing blocking materializer
    → stable coaching JSON + Match Center Fan/Analyst panel
```

Only the optional generation binary links the HTTP/token provider. The public API
has no model credentials, public generation operation or inference dependency;
replays, subscribers and cold starts never trigger paid calls. Generation uses
the existing local Azure CLI Entra identity. Tokens stay in memory.

The model selects and orders approved wording IDs. Rust renders every published
sentence; arbitrary model prose is rejected. Both audiences carry the same facts,
including observed fictional events, authored scenario context, model outcomes and
limitations. Missing, failed or stale artifacts visibly fall back to deterministic
Rust explanations while retaining simulation evidence. A valid cached artifact
does not indicate current provider availability. SHA-256 binds content; it is not
cryptographic proof of provider authorship.

The release includes two source-bound explanations from six completed real Foundry
role calls on October 25, now served by the verified public Azure demo. See
[contracts and administrative commands](FOUNDRY_COACHING_CONTRACT.md) and
[verification status](PHASE_3_VERIFICATION.md).

## Interactive Tactical Studio (local UI slice)

The frontend consumes the existing `InsightDetail` and full `SimulationReport`.
`apps/web/app/simulation-contracts.ts` mirrors the versioned Rust spatial fields;
`tactical-studio.tsx` owns scene loading and a reusable `TracePlayer`. No new API,
simulation algorithm, dependency, model service or background worker is added.

The standalone studio explicitly previews authored scenarios using `at=420`.
It does not add future insights to the live replay. The Match Center still displays
insights only after their triggering events and opens the same player from their
linked evidence. Keyed scene loaders abort obsolete requests; branch changes reset
the playback clock. The player reads positions, possession and tactical events from
the chosen report trace and interpolates positions only for presentation between
100ms snapshots. It neither changes Rust's states nor reranks alternatives.

CSS perspective provides the angled pitch and raised role markers; SVG draws
pitch lines and sampled paths. Both comparison branches share a camera frame.
Reduced-motion users retain keyboard scrubbing, chapters and comparison with
animation disabled. A separate, untransformed role selector handles crowded pitch
markers. This is a spatial explanation view, not full athlete or ball physics.
See [UI contracts and verification](TACTICAL_STUDIO_UI.md).

## Phase 4 timed cues and recap (deployed and verified)

`match-presentation.ts` gates cues on their source event records and accepted
snapshot. The latest eligible insight appears for 120 synthetic replay seconds;
seeking reconstructs eligibility and logical IDs prevent repeated transport
records from restarting the cue. `match-broadcast.tsx` presents the cue below
the pitch, preserving event-marker access, and reuses the existing shared
evidence viewer for saved Fan/Analyst coaching and spatial comparisons.

The recap requires `replay-complete` plus a snapshot matching the final accepted
record's identity, kind, time, match and total record count. The authored segment
ends on a goal, not a `full_time` record. Delayed or failed final snapshots show
a recoverable pending state. Goals, score and statistics remain recorded facts;
the separate tactical section contains authored comparisons and nullable
corrections. Replay generations clear recap/selection and reject stale requests.
No new endpoint, model call or simulation calculation is introduced. See
[Phase 4 contracts and verification](PHASE_4_MATCH_EXPERIENCE.md).

## Security notes

- The API restricts CORS to `WEB_ORIGIN` (default localhost:3000). Configure it per deployment.
- Never commit model/API credentials. `.env.example` contains placeholders only.
- CORS is not an authentication boundary. All demo endpoints currently use public synthetic data.
- The public demo serves fictional synthetic data, not a production sports feed.

## Azure release packaging

The deployment increment preserves the separate Rust API and Next.js frontend.
Multi-stage Dockerfiles produce non-root Linux runtimes. Next.js standalone output
is enabled only for container builds, and `NEXT_PUBLIC_API_URL` is embedded during
that build rather than treated as a runtime secret. Existing local setup remains valid.

`infrastructure/azure/bootstrap.bicep` defines a private Basic ACR, registry-scoped
pull identity and Consumption-only Container Apps environment. `apps.bicep` defines
two public HTTPS apps, exact web-origin API CORS, HTTP probes, 0 minimum / 1 maximum
replica, 0.25 CPU and 0.5 GiB per app. No database or Log Analytics dependency is added.
The release script defaults to a non-deploying plan, requires explicit personal
subscription and expected tenant IDs for writes, rejects unowned existing groups
and dirty checkouts, and records immutable revision/time image tags for rollback.

One Entra-authenticated Foundry Responses smoke request succeeded in the October 25
deployment increment. Phase 3 adds the bounded administrative generation and saved
coaching described above, now served by the public demo. The Phase 4 release
updates only the existing web image and preserves the API and infrastructure
configuration. See [Azure deployment](AZURE_DEPLOYMENT.md).
