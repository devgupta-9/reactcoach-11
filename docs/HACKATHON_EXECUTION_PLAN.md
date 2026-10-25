# ReactCoach 11 — Approved Hackathon Execution Plan

**Decision:** APPROVED by the project owner on 2026-10-09.  
**Authority:** This document is the hackathon execution baseline through submission. `docs/ROADMAP.md` tracks status; this document defines scope and acceptance criteria.  
**Submission target:** 2026-10-26, allowing a buffer before the 2026-10-27 Pacific competition deadline.  
**Repository:** https://github.com/devgupta-9/reactcoach-11  
**No provisioning authorized:** Plan approval does not approve Azure expenditure, new paid services, or deployment.

## 1. Product commitment

**Name:** ReactCoach 11  
**Positioning:** AI-Powered Live Tactical Intelligence  
**Tagline:** Know your strengths. Read your opponent. Make the better move.

ReactCoach 11 is a synthetic live football match companion that detects significant events, reports defensible match information, simulates alternate tactical choices and modeled opponent reactions, and tells evidence-grounded stories for fans and analysts.

**Differentiation:** What happened, why it matters, and what the player might have done differently *under an explicit synthetic model*—not just a scoreboard, nor an isolated player-v-opponent coaching sandbox.

The coherent demonstration follows a five-stage chain:
1. **Ingest:** deterministic fictional football events via Rust replay and SSE;
2. **Interpret:** deterministic statistics, meaningful-moment detection, and linked counterfactual simulation;
3. **Explain:** Microsoft Foundry generates structured narrative from verified evidence, checked before publication;
4. **Render:** synchronize insight overlays and tactical comparison playback with match event timestamps;
5. **Personalize:** Fan and Analyst modes, with evidence preserved and depth/tone adjusted.

This is the intended hackathon experience, not a claim that all five stages have already shipped.

## 2. Non-negotiable end-to-end demo

A judge can, without setting up an account:
1. Start or replay a synthetic match segment.
2. Observe live score, clock, valid statistics and at least **two distinct meaningful insights** triggered by actual replay event IDs.
3. Open one insight and see *why* it matters, with explicit source event and assumptions.
4. Play original and corrective action branches side by side or switch between them, including modeled defender response and evidence trace.
5. Switch **Fan** and **Analyst** views and see substantively different presentations of the **same validated findings**.
6. Generate a recap referencing prior events and approved findings.
7. Open the deployed public demo and reproduce the above on desktop and a mobile viewport.

Acceptance requires real Foundry inference for the AI explanation pathway, with a visibly distinguished deterministic fallback when it is unavailable. Simulation fit indices must never be described as calibrated success probabilities.

## 3. Confirmed foundation

- **Proper Task 1 — Foundation: DONE / merged.** Rust event engine, synthetic replay/SSE, Axum API, Next.js UI, GitHub CI, baseline decision lab.
- **Proper Task 2A — Bounded spatial simulation: DONE / merged.** Typed fixed-tick integer coordinates, movement and braking, two decision cycles, counterfactual branches, trace evidence, versioned open-play POST API and tests.
- Reference: Phase 1 PR #1 and Phase 2A PR #2; main baseline after Phase 2A is `5e566b6`. Revalidate HEAD before any new implementation.
- **Not yet shipped:** match events linked to spatial scenarios, live tactical overlays, Foundry model calls, fan/analyst narratives, Azure deployment. Do not misrepresent planned functions as implemented.

## 4. Milestones, owners and Definition of Done

### Proper Task 2B — Live Synthetic Match Intelligence
**Target:** 2026-10-10 to 2026-10-13. **Status:** PENDING. **Primary owner:** Codex.  
**Suggested implementation branch:** `feat/phase-2b-live-match-intelligence`.

Sub-tasks:
- 2B.1 Extend the nine-event fixture to a coherent, validated synthetic sequence of passes, pressure, turnovers, shots and significant decisions. Keep replay semantics and existing tests compatible.
- 2B.2 Compute only evidence-supported statistics; detect at least two meaningful moments deterministically, with clear reasons and event references.
- 2B.3 Attach **explicitly authored, versioned synthetic spatial fixtures** to the selected `match_id` + `event_id`; do not infer 3D/22-player tracking state from sparse events.
- 2B.4 Add a typed insight/evidence envelope: match/event IDs, event timestamp, source statistics, scenario version/ID, simulation trace IDs, objective evidence, confidence/limitations, and lifecycle timestamps.
- 2B.5 Make insight data accessible via additive APIs and synchronized event/replay delivery; support replay, seek, reconnect and latest-only selection safely.
- 2B.6 Add fixture integrity, repeated-replay determinism, same-event stable identity, schema, event-timing and regression tests.

**Definition of Done:** Two distinct moments trigger reproducible, source-linked insights; the same inputs yield the same event IDs, evidence and simulation comparison. Existing matches and Phase 1/2A APIs still pass.

**Guardrail:** Do not spend this milestone expanding generic physics or training on real-player footage.

### Proper Task 3 — Microsoft Foundry Intelligence
**Target:** 2026-10-13 to 2026-10-17. **Status:** DONE (published and deployed 2026-10-25). **Owner:** Codex, with bounded review.

Sub-tasks:
- Verify Azure subscription, model access, quota, pricing and spending approval *before* provisioning. Make any paid setup a separate explicit approval gate.
- Implement a real Foundry model call behind a server-side credential boundary; no browser secrets.
- Use a minimal evidence-first agent workflow: **Tactical Interpreter → Evidence Challenger/Verifier → Audience Narrator**. The deterministic Rust evidence validator is the final factual gate. Expand to Microsoft Agent Framework only if it adds testable orchestration value within the deadline.
- Structured versioned schemas; stable source event/trace references; explicit observed-vs-modeled labels; bounded token budgets, retries, timeouts, concurrency and model calls.
- Generate Fan/Analyst variants from identical validated facts. Reject unsupported statistics, player biographies, phantom event IDs, model-generated offside rulings and claims of quantified real-world success.
- Provide a visible deterministic fallback in outage/quota failure. Log request/trace IDs and costs where obtainable, without recording credentials.

**Definition of Done:** At least two source-linked match moments have real, verified Foundry-generated explanations; adversarial/negative tests reject hallucinated evidence; the app remains usable with inference unavailable.

**Technical implementation record, 2026-10-25:** The local Phase 3 workflow uses
bounded administrative Responses calls and a reviewed saved artifact. Model roles
select/order approved evidence wording; Rust renders each published sentence.
This is constrained AI narrative composition. Two real compositions, strict
validation, deterministic fallback and Fan/Analyst views pass local acceptance.
The owner subsequently authorized publication and Azure rollout. Hosted acceptance
passed 44 browser and 18 endpoint/SSE checks. Scope and target dates above are
unchanged. See [Phase 3 verification](PHASE_3_VERIFICATION.md).

### Proper Task 4 — Broadcast Experience and Personalization
**Target:** 2026-10-17 to 2026-10-21. **Status:** PENDING. **Owner:** Agy frontend; Codex API/integration. Avoid concurrent editing of the same files.

Sub-tasks:
- Single premium match center: scoreboard, clock, synthetic stats, pitch/event timeline, timed overlays and recoverable SSE connection.
- Tactical comparison studio: animate actual baseline/correction states, opponent responses and ball control; pause, scrub, seek and switch branches.
- Fan and Analyst modes with identical factual backing, visibly distinct depth/terminology; optional favorite-team/player focus only if implemented faithfully.
- Source provenance, synthetic labels, assumptions and model limitations are one interaction away. Responsive mobile, keyboard navigation and sensible reduced-motion behavior.
- Match recap built exclusively from recorded events and approved insight envelopes. Optional multilingual explanation only when verified and within schedule.

**Definition of Done:** Live overlay aligns with its event; branch playback is synchronized and understandable; Fan/Analyst views differ materially; recap and desktop/mobile browser tests pass.

### Proper Task 5 — Azure Deployment, Reliability and QA
**Target:** 2026-10-21 to 2026-10-24. **Status:** PENDING. **Owners:** Codex backend/deploy; Agy UI QA.

Sub-tasks:
- Deploy a reproducible public HTTPS demo, preferably Next.js and Rust API on Azure Container Apps, using Microsoft Foundry for AI calls.
- Set Azure budgets and alerts, verify quotas and resource costs with owner approval; don't deploy expensive always-on resources by default.
- Secrets only server-side; strict origins/input validation, bounded workload, structured tracing, rate control, retry/fallback/replay recovery.
- Regression suites: Rust unit/API, deterministic fixture assertions, Foundry mock + controlled real-model smoke checks, Playwright desktop/mobile, accessibility.
- Document deployment architecture, threat assumptions, dataset provenance, known model limitations and troubleshooting.
- Optional database only if there is a demonstrated need; stateless/versioned fixtures are acceptable for the MVP.

**Definition of Done:** Public demo works without judge sign-in; full user journey passes in deployed environment; temporary model failure does not prevent replay and evidence inspection.

### Proper Task 6 — Demo and Submission
**Target:** 2026-10-24 to 2026-10-26. **Status:** PENDING. **Owners:** Project owner for final submission; Codex/Agy for fixes.

Sub-tasks:
- Final security, copyright/data-provenance, compliance and end-to-end review.
- Public GitHub code, polished README/setup and transparent limitations.
- Public functioning demo and a **video under two minutes**, showing the *real application*.
- Suggested 1:50 video sequence: 0:00–0:15 problem; 0:15–0:40 event detection; 0:40–1:10 spatial counterfactual; 1:10–1:35 Foundry + two audiences; 1:35–1:50 recap, architecture, close.
- Submit through the official hackathon platform; verify acceptance and all links. Leave a buffer to correct platform/eligibility issues.

**Definition of Done:** Required materials accepted by submission platform and all public links tested from a signed-out browser.

## 5. Architecture and engineering discipline

**Retain:** Rust decision engine, analytics, match engine, Axum REST/SSE, Next.js/React/TypeScript, GitHub Actions, 100 ms versioned spatial simulation.  
**Integrate:** Microsoft Foundry as the grounded narrative/agent layer; Rust remains the source of numeric and rule-constrained truth.  
**Deploy:** Prefer Azure Container Apps, subject to cost/permissions and actual feasibility.  
**AI development tools:** Codex primary backend, Agy primary frontend; independent bounded review when permitted. GitHub Copilot is not required to author the project.  
**Delivery method:** Isolated phase branches, PR to `main`, verification and CI before merge, one owner per file during concurrent tasks. No force pushes or global peer-agent permission changes as a workaround.

## 6. Data, evidence and safety constraints

- Fictional matches, players, ratings, movement and tactical comparisons must be labeled **synthetic**. No claim of licensed Premier League data or official athlete measurements.
- Sparse match events cannot reconstruct full movement; attach authored hypothetical spatial fixtures openly.
- The decision fit index and spatial outcome objective are **heuristics**, never calibrated probabilities, xG, predicted match outcomes or human neurological reflex measurements.
- Do not turn position-only offside examples into claims about officiating or complete Law 11 offences.
- Foundry may summarize and explain only verified event and trace evidence; it must not invent source IDs, statistics or geometry.
- Clear difference between **observed fictional match event**, **synthetic scenario assumption**, **model simulation result**, and **AI narrative**.
- A missing/failed AI call must not fabricate an AI-generated answer; mark deterministic fallback as such.

## 7. Deliberately deferred

Full 11v11 physics, continuous real-world biomechanics, probabilistic outcome prediction, real professional scouting or proprietary broadcast/video training, advanced VAR, full penalty/free-kick spatial extensions, unnecessary database/event-bus infrastructure, extensive localization, and nonessential animations.

The existing penalty, free-kick, and simplified offside-position modules remain supplementary and should not block the match-intelligence demonstration.

## 8. Completion gates

All seven are required before submission:
- [ ] Two reproducible, match-linked, meaningful tactical moments.
- [ ] Animated, inspectable, evidence-backed original/corrected spatial comparison.
- [ ] Genuine Foundry-generated, validated explanation with outage fallback.
- [ ] Fan and Analyst variants that preserve the same facts.
- [ ] Synchronized match overlay and evidence-grounded recap.
- [ ] Public Azure-hosted demo with passing integration, safety and mobile QA.
- [ ] Public repository, tested links, required description and sub-two-minute video submitted.

## 9. Control of changes

**Scope freeze:** No new features outside this document without explicit owner approval; correctness, compliance and release-blocking fixes are allowed.  
**Schedule triage:** If behind, preserve the seven-gate end-to-end path; reduce event count to two high-quality moments and visual complexity before dropping Foundry verification or evidence linking.  
**Blockers:** Azure account/credits/model access must be confirmed early in parallel with 2B; do not wait until 3 to discover access problems.  
**Reporting:** Every proper task and sub-task must be marked Done, In Progress, Pending, Blocked or Deferred, with a verifiable artifact (commit, PR, run, screenshot, deployed URL or test).  
**Approval:** Project owner approved this execution plan on 2026-10-09; task implementation, paid infrastructure provisioning and final submission are separate activities.
