# Phase 3: evidence-grounded Foundry coaching

Status: implemented and deployed with two validated real Foundry compositions,
2026-10-25. The authoritative scope remains HACKATHON_EXECUTION_PLAN.md.
Publication and hosted acceptance are recorded in PHASE_3_VERIFICATION.md.

## Boundary and workflow

The existing Rust simulation remains authoritative. A Rust backend generation
command materializes at most two demo explanations. Each uses three stateless
Microsoft Foundry Responses calls: Interpreter selects relevant evidence,
Challenger accepts or vetoes that selection, Narrator composes Fan and Analyst
versions of the same selected facts. Rust is the final validator.

The narrator chooses and orders approved evidence-bound wording IDs; it cannot
publish arbitrary prose, numbers, biographies or rules decisions. This is
**constrained AI narrative composition**, not unrestricted AI-written analysis.
The model's choices are real, but the factual sentences are rendered by Rust.
Both audiences retain observed facts, the authored-scenario distinction,
baseline/correction evidence and limitations. No improvement remains an honest
no-improvement explanation.

Generation is an explicit administrative job, not a public prompt endpoint or an
API startup operation. This avoids recurring paid calls when Container Apps scale
to zero. The API and frontend need no model credentials or additional Azure roles.
Local generation uses the already-authorized Entra Azure CLI identity; the token
is held in process memory and is never written to the artifact or logs.

## Contracts and validation

- `coaching_v1`: public explanation envelope with insight/match/event identifiers,
  a full evidence/catalog/prompt/deployment SHA-256 fingerprint, stable artifact
  identifier, delivery `precomputed`, clearly distinguished Foundry composition
  or deterministic fallback, audience clauses and source references.
- `foundry_coaching_artifact_v1`: bounded, reviewed backend artifact containing
  typed role outputs, actual response identifiers, reported token usage and a
  separate generation timestamp. Model output is not deterministic; replay of a
  validated fixed artifact is deterministic.
- Unknown fields, unknown/duplicate claims, changed evidence, unsupported schema
  or prompt versions, unsupported wording IDs, dropped mandatory context, unequal
  audience facts, refused/incomplete responses and invalid stage receipts fail
  closed. A model's self-assessment never substitutes for Rust validation.
- Fingerprints include full simulation input/output and the actual wording
  catalog, not just event IDs. They identify content, not cryptographic proof of
  model-provider authorship. Checked-in artifacts are trusted build inputs whose
  historical inference provenance is recorded and reviewed.
- Missing, rejected or failed-generation artifacts produce a visibly deterministic
  fallback. Cached valid explanations do not imply current provider availability.

Existing REST and SSE contracts remain valid. Insight detail gains an additive
`coaching` field and a read-only `/api/v1/matches/demo/insights/{id}/coaching`
endpoint uses the existing timestamp and identifier checks. No visitor operation
invokes a model. Evidence selection retains its existing abort/generation guards.

## Execution bounds and release gates

No retries, no tools, no stored provider conversation, no external grounding feed.
At most three calls per insight and six per generation job; interpreter/challenger
output caps 256 tokens each, narrator 768 tokens (2,560 across both workflows).
Bounded request/response bytes, 30-second request timeout and one sequential job.
The two workflows are paced apart to respect the existing 10,000 TPM/10 RPM quota.
Reported token usage is retained; money estimates are not invented.

Live paid verification and deployment are separate, concrete release gates after
mock, adversarial, API and browser verification. No new public generation route,
cloud resources, global MCP changes, GitHub publication or merge is part of local
implementation. Phase 4 broadcast overlays/recap remain out of scope.

## Official sources checked

- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses?view=foundry-classic
- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/structured-outputs?view=foundry-classic
- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/managed-identity?view=foundry-classic

Responses uses `text.format` for strict JSON schema; Chat Completions'
`response_format` is not interchangeable. Authentication uses the Entra scope
`https://ai.azure.com/.default`, `store: false`, and the deployment name.

## Administrative operation

The default command is a non-billing plan and does not invoke Azure CLI:

```powershell
powershell -NoProfile -File scripts/cargo.ps1 run -p reactcoach-agents --features foundry --locked --bin foundry-demo -- --plan
```

Only after explicit spending approval, run the same binary with
`--generate --allow-paid --subscription <UUID> --az <absolute-az-path> --out <new-json-path>`.
The output must not already exist. It contains no token or raw rejected model
prose. Inspect completed stage receipts and resolve the artifact against both
current source details before replacing `crates/agents/fixtures/foundry-demo-v1.json`.
That fixture is compiled into the API; changing it requires a rebuild/release.
There is no environment switch or visitor endpoint that activates inference.

`receipts[].model` is the provider-returned label, which Azure may report as the
configured deployment alias `reactcoach-coach` rather than `gpt-5-mini`. It must
not be treated as independent verification of an underlying served model version.

The lockfile pins the newly introduced transitive `idna_adapter` to 1.2.0, whose
ICU dependency supports the existing Rust 1.85 floor. Regeneration must check
all-feature dependency MSRVs; an unconstrained update selected Rust 1.88 ICU
packages during verification. Use locked dependencies for reproducible builds.

## Public API example

```text
GET /api/v1/matches/demo/insights/demo-match-001:fictional_replay_v2:tactical_intelligence_v1:turnover-wide-001/coaching?at=112
```

The `coaching_v1` JSON envelope includes `insight_id`, `match_id`,
`event_timestamp`, `source_event_ids`, `explanation_id`, `evidence_digest`,
`mode`, `delivery`, `focus`, `fallback_reason`, `generated_at_unix_seconds`,
`fan`, `analyst` and `receipts`. Each audience clause includes `fact_id`,
`kind`, `source_refs` and rendered `text`. The existing insight-detail endpoint
also embeds the same envelope as its additive `coaching` field. SSE event
names and payloads remain unchanged; selecting evidence retrieves the narrative.

Premature or missing IDs return 404, malformed IDs/time queries return 400,
and POST returns 405. The timestamp scope follows the existing insight detail
contract. Public narratives are deterministic for a fixed validated artifact;
the upstream model generation itself is not deterministic.

See [the captured turnover coaching response](examples/coaching-turnover-response.json),
retrieved from the local API after the validated real artifact was installed.
