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
- `crates/agents`: planned roles and handoff schema. **No real model calls implemented.**
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
templates. No Foundry agents execute these calculations or generate text yet.

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

## Planned later phases (NOT yet shipped)

- Microsoft Foundry REST integration and credential management.
- Multi-agent interpretation, grounded output validators and trace IDs.
- Azure PostgreSQL/SQLx persistence and a reliable ingestion pipeline.
- Deployment to Azure Container Apps, cloud observability, secret management.
- Broadcast-mode UI, localization and video submission.

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

One Entra-authenticated Foundry Responses smoke request succeeded on October 25.
The applications still do not call Foundry; model access and app integration are
separate acceptance gates. See [Azure deployment](AZURE_DEPLOYMENT.md).
