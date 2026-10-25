# ReactCoach 11 — Hackathon Roadmap

**Status: APPROVED — 2026-10-09.**  
**Execution baseline:** [Approved Hackathon Execution Plan](HACKATHON_EXECUTION_PLAN.md) — authoritative scope, acceptance criteria, constraints, owners and dates.  
**Target submission:** **2026-10-26** (buffer ahead of the competition deadline).

## Final product direction

**ReactCoach 11 — AI-Powered Live Tactical Intelligence**

Synthetic live football replay → meaningful event detection → spatial counterfactual and opponent-response evidence → verified Microsoft Foundry narratives → synchronized match overlay → Fan / Analyst personalization and recap.

The coaching simulator is a differentiator *inside* the match-intelligence pipeline, not a disconnected application.

## Milestones

| Proper Task | Planned dates | Status | Merge / acceptance gate |
| --- | --- | --- | --- |
| 1. Foundation | Completed | **DONE** | Phase 1 PR #1 merged; Rust/API/Next.js/replay/CI baseline |
| 2A. Spatial simulation | Completed | **DONE** | Phase 2A PR #2 merged; 61 Rust tests and 14 browser checks reported; post-merge main CI green |
| **2B. Live synthetic match intelligence** | **Oct 10–13** | **DONE; GitHub publication pending** | 81 Rust tests; 23 events / 2 moments verified on Azure; Agy review blocked; owner acceptance pending |
| 3. Microsoft Foundry intelligence | Oct 13–17 | DONE (local); deployment PENDING | Two real validated compositions; 104 all-feature Rust and 44 browser tests pass; public rollout pending |
| 4. Broadcast & audience experience | Oct 17–21 | IN PROGRESS | Tactical Studio deployed; explanation-level Fan/Analyst views done locally; broadcast overlay, recap and broader personalization pending |
| 5. Azure deployment & QA | Oct 21–24 | IN PROGRESS | Public HTTPS demo and 40 hosted browser / 19 smoke checks pass; Foundry-integrated QA, release automation and retained monitoring remain pending |
| 6. Demo & submission | Oct 24–26 | PENDING | Public repo/demo, sub-two-minute video, valid platform submission |

The dates overlap deliberately to allow early Cloud/Foundry access checks and interface integration. They are internal targets, not delivery guarantees.

## Proper Task 2B — Immediate backlog

- [x] **2B.1** Expand the existing fictional event replay into coherent match moments while preserving established contracts (23 records).
- [x] **2B.2** Detect at least two significant moments from factual synthetic event records with deterministic criteria (events 9 and 17).
- [x] **2B.3** Attach openly authored and versioned spatial states to selected match-event IDs; never claim full player tracking was inferred from sparse events.
- [x] **2B.4** Emit typed evidence: match ID, event ID/time, stats, authored scenario ID/version, comparison trace IDs, outcome, provenance and limitations.
- [x] **2B.5** Connect evidence to the match stream and replay/seek lifecycle without stale results or duplicate insights.
- [x] **2B.6** Add deterministic fixture, API and replay regression coverage (81 Rust and 24 desktop/mobile browser tests).
- [x] **2B gate:** Two match events independently produce stable evidence-backed spatial comparisons. Existing Rust, web and browser tests pass locally.

Final independent Agy review is **Blocked**: required headless permission followed
by a file-only retry timeout. Architecture review succeeded; final independent
approval was not obtained. Owner acceptance and GitHub publication remain **Pending**.
Do not advance to Phase 3 before owner approval. See [Phase 2B verification](PHASE_2B_VERIFICATION.md).

**Owner direction, 2026-10-25:** Phase 3 explicitly authorized. The historical
Phase 2B review/publication record above remains unchanged.

**Suggested branch:** `feat/phase-2b-live-match-intelligence`. Start from verified `main`, keep changes on a feature branch and review by PR before merge.

## Cross-cutting setup to start alongside 2B

**Owner direction, 2026-10-13:** prioritize the premium interactive UI before
continuing Microsoft Foundry setup. An evidence-linked CSS 3D Tactical Studio is
**Done locally** on `feat/interactive-tactical-ui`; 81 Rust tests and 38 browser
checks pass. This is a slice of Phase 4, not completion of broadcast overlays,
Fan/Analyst modes or recap. The approved target dates remain unchanged.
See [Tactical Studio UI](TACTICAL_STUDIO_UI.md).

- [x] Verify Microsoft Foundry account, deployment regions, available models, costs and quotas (East US 2; gpt-5-mini deployment; one 30-token Responses test on October 25).
- [x] Obtain explicit owner approval *before* provisioning paid Azure resources (owner requested starting Azure deployment on October 25, after pay-as-you-go and zero active credits were established).
- [x] Prepare mock and real-model evidence-validation test plans without exposing browser credentials (Phase 3 administrative generation gate).
- [x] Choose two end-to-end demo scenarios and evidence fixtures early (turnover and pressure).
- [ ] Have Agy prepare interface review after backend event/insight contracts are stable, without overlapping file edits.

**Release increment, 2026-10-25:** `feat/azure-release-prep` preserves the local
Phase 2B/UI history. Linux container packaging, a Consumption-only Azure topology,
explicit subscription/tenant guards, deployed-browser test configuration and a
Next.js security patch are delivered. The public Azure demo passed 40 local and
40 hosted browser checks plus 19 endpoint/SSE checks. The INR 300 monthly budget
and owner-requested alerts are configured; they are not spending caps.
Real Foundry HTTP 200/`READY` verifies model access only. Phase 3 now implements
local constrained narrative composition and explanation-level audience modes;
two real source-validated explanations are recorded; publication remains pending. Full broadcast
personalization/recap remain Phase 4. See [release scope, costs and acceptance](AZURE_DEPLOYMENT.md)
and [Phase 3 verification](PHASE_3_VERIFICATION.md).

## Submission readiness

- [x] Match-triggered synthetic tactical intelligence, at least two moments (locally verified)
- [x] Evidence-backed original versus corrected spatial replay (Tactical Studio verified on Azure)
- [x] Genuine verified Foundry explanation and deterministic fallback (two local compositions; deployed rollout pending)
- [x] Fan and Analyst explanation modes grounded in identical facts (local; full broadcast personalization remains Phase 4)
- [ ] Broadcast-style overlay and match recap
- [x] Public tested Azure demo (40 desktop/mobile browser checks; 19 endpoint/SSE checks, October 25)
- [ ] Public repo, demo video under two minutes, project description and platform submission

## Scope freeze and caveats

**Defer:** Full-team tracking/physics, real athlete predictions, unlicensed Premier League data, extensive penalty/free-kick physics, advanced VAR, unnecessary databases, and noncritical effects. Current football ratings and spatial parameters are synthetic and uncalibrated. Do not present decision indices as probabilities or sparse offside geometry as a complete Law 11 decision.

**Status discipline:** Use Proper Task / Sub-task labels and Done, In Progress, Pending, Blocked or Deferred. Tests and delivered artifacts—not plans—determine completion.

### Historical verification

- [Phase 1 verification](PHASE_1_VERIFICATION.md)
- [Phase 2A verification](PHASE_2A_VERIFICATION.md)
- [Spatial simulation contract](SPATIAL_SIMULATION_CONTRACT.md)
- [Live match intelligence contract](LIVE_MATCH_INTELLIGENCE_CONTRACT.md)
- [Phase 2B local verification and limitations](PHASE_2B_VERIFICATION.md)

This roadmap supersedes the preapproval coaching-only sequence. The detailed approved execution plan is the final scope authority for the hackathon.
