# Azure deployment and release stages

Release preparation started **2026-10-25** on `feat/azure-release-prep`, preserving
the unpublished Phase 2B and Tactical Studio commits. The owner requested starting
Azure deployment on the existing pay-as-you-go account. No active Azure credits
were found in the billing profile when checked on October 24.

## Scope and missing stages

| Stage | Evidence / acceptance gate |
| --- | --- |
| Deterministic engine, replay and Tactical Studio | Verified locally and on Azure: all three decision scenarios, offside and both spatial moments retained |
| Foundry resource and model access | Real Responses smoke test returned HTTP 200 and `READY` on October 25; 11 input / 19 output tokens; one request, no retry |
| Foundry application integration | **Pending**: interpreter, challenger, narrator, factual validator, outage fallback and two real evidence-linked explanations |
| Audience experience | **Pending**: distinct Fan/Analyst views, synchronized broadcast overlay and evidence-grounded recap; existing studio is only part of this phase |
| Public Azure hosting | **Done**: successful Linux builds, healthy HTTPS endpoints, 40 hosted browser checks and 19 endpoint/SSE checks |
| Submission | **Pending**: review/publication of local branches, public repo/demo links, video under two minutes and owner submission; internal target October 26 |

The official submission deadline is October 27, 11:59 PM Pacific, equivalent to
**October 28, 12:29 PM IST**. The public demo must remain accessible through the
judging period, ending November 10, 11:59 PM Pacific (**November 11, 1:29 PM IST**).
These are deadlines, not assertions that unfinished stages have passed.

## Topology and costs

- Rust API: HTTPS ingress to port 8080; `/api/v1/health` health probes.
- Next.js: HTTPS ingress to port 3000; `/` health probes; non-root standalone runtime.
- Shared Consumption-only Container Apps environment in East US 2.
- Each app: 0.25 vCPU / 0.5 GiB, minimum 0 and maximum 1 replica. Cold starts are expected.
- Private Basic ACR, administrator password disabled, anonymous pull disabled.
- Registry-only managed identity and `AcrPull`, with registry permissions explicitly
  set to legacy RBAC so the role remains effective; no model credentials are placed in either image.
- Structured API logs go to stdout; live console streaming and Azure platform metrics
  are available. Historical Log Analytics ingestion is not configured in this increment.
- Stateless fictional fixtures need no database. There is no new always-on database,
  dedicated compute profile, private endpoint, or paid monitoring workspace.

Public Azure Retail Prices checked October 25 list Basic Registry Unit at
**US$0.1666/day** (about US$5 per 30 days), and paid ACR task CPU at
US$0.0001/vCPU-second. Container compute, memory, requests, storage beyond included
amounts, network egress and model inference can add charges. Free quantities depend
on the subscription and meter. Taxes and billing-currency conversion can apply.
Registry charges continue while it exists even when apps scale to zero.
Replica limits, HTTP scaling thresholds and budget alerts are **not spending caps**.

## Reproduce

Use Azure CLI with the correct tenant and subscription. Never paste keys, tokens,
device codes or complete authentication URLs into reports or Git. These templates
do not require registry keys or Foundry API keys.

```powershell
# Local checks; no Azure writes.
powershell -NoProfile -File scripts/test-deployment.ps1
az bicep build --file infrastructure/azure/bootstrap.bicep --stdout
az bicep build --file infrastructure/azure/apps.bicep --stdout
powershell -NoProfile -File scripts/deploy-azure.ps1

# Actual provisioning and cloud builds are billable. Use the approved personal scope.
powershell -NoProfile -File scripts/deploy-azure.ps1 -Apply `
  -SubscriptionId YOUR-SUBSCRIPTION-GUID -ExpectedTenantId YOUR-TENANT-GUID
```

Deployment requires a clean, committed checkout. The script rejects an existing
resource group without the ReactCoach11 ownership tag and stops on failed CLI
commands. It uses explicit subscription arguments and checks the tenant before
writes. It registers required providers, validates Bicep, creates the environment
and registry, builds the API then web image, and validates/deploys both apps.
An ignored `.local/azure-deployment-*.json` receipt records image tags and URLs.
ARM represents disabled log storage with `appLogsConfiguration.destination: null`;
the CLI spelling `none` is not a valid literal ARM destination. This was verified
by live template validation before hosting resources were created.

`NEXT_PUBLIC_API_URL` is deliberately embedded during the web build, as required
by Next.js public variables. Changing it requires rebuilding the web image; merely
changing a runtime environment variable does not update client code. The API uses
the exact web HTTPS origin for CORS. `.dockerignore` excludes local credentials,
environment files, local receipts, node_modules and build outputs from cloud source uploads.

The Windows CLI's isolated Python ignores `PYTHONIOENCODING` and can fail while
displaying Unicode build logs. The release script uses `--no-logs`, which polls
the build without streaming, and requires each returned run status to be
`Succeeded`. If log streaming fails during manual use, inspect the existing ACR
run status before retrying: a display error does not mean the cloud build failed.

Local Docker is optional: Azure ACR Tasks performs the Linux builds. To build
locally when Docker is available:

```text
docker build -f apps/api/Dockerfile -t reactcoach-api .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://YOUR-API-HOST -t reactcoach-web .
```

## Acceptance checks

The existing Rust format, Clippy and workspace tests, web lint/typecheck/build,
production dependency audit, deployment guard checks and Bicep compilation must
pass before hosting. A patched Next.js 16.4.3 replaces the vulnerable 16.4.0 release.

Local release verification on **2026-10-25**: Rust format and Clippy passed;
**81 workspace tests passed, 0 failed**. Next.js lint, TypeScript checking and
production build passed; the final response-header configuration passed all
**38 desktop/mobile Playwright tests, 0 failed**. Production npm audit reported
**0 vulnerabilities**. Both Bicep templates compiled and all **3 deployment
guard checks** passed without Azure operations. These are local results, not
evidence of a successful public deployment or remote GitHub CI run.

Independent Agy release review was **not completed**: the discovered Sonnet model
rejected the requested effort setting, and an explicitly selected Gemini review
was blocked by a permission requiring interaction in headless mode. No permission
bypass, global configuration change or peer file modification was performed.

After deployment, verify public health, all three decision-lab scenarios, offside,
23 match records, both insight details, simulation POST, exact-origin CORS and SSE
event ordering. Then run the existing desktop/mobile suite against the real URLs:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://YOUR-WEB-HOST'
$env:PLAYWRIGHT_API_URL = 'https://YOUR-API-HOST'
Set-Location apps/web
npm run test:e2e
```

Both variables are required for deployed tests. Without the deployed base URL,
Playwright starts the local API and production web server and retains the local
test behavior. Warm both endpoints before recording to avoid demonstrating a cold start.

## Rollback and remaining limits

Each release uses a Git-revision-and-time image tag. Keep the previous successful
receipt. On a verified regression, update the affected Container App to its previous
image using `az containerapp update --name APP --resource-group GROUP --image IMAGE`
under the explicit approved subscription. Check health and public journeys afterward.
The previous web image must point at the same API environment; moving environments
requires a rebuilt web image. No database migrations or persistent user data are involved.

The public API serves fictional data and bounded deterministic simulations without
user authentication. CORS controls browser access, not direct HTTP callers. Maximum
replicas bound scaling, not request admission. Before adding publicly callable model
generation, implement bounded materialization/caching and caller/workload controls;
do not expose an unbounded paid prompt endpoint. The current app does not invoke
Foundry per visitor. Deploying it does not complete Phase 3 or full Phase 4.

No resource deletion, GitHub push/merge or platform submission is automatic. Review
ongoing costs after judging and obtain authorization before removing resources.

## Incremental frontend corrections

`apps.bicep` accepts `apiImageTag`, defaulting to the common `imageTag`. A
frontend-only release can build the web image under a new revision tag and pass
the previous verified API tag explicitly. This preserves API provenance and
avoids paying for an unchanged Rust rebuild. Record both image references in the
deployment receipt; the normal release script still builds both services.

A release browser check exposed a navigation race: late scenario evidence
increased the page height while global smooth scrolling retained an old anchor
position. Native instant anchor jumps preserve the destination as content loads.
The regression test holds the real studio response until navigation, then verifies
that Decision Lab remains in view after the evidence expands the page. Tactical
playback animation and camera controls are unchanged.

## Hosted release record — 2026-10-25

- Web: https://reactcoach-demo-web.mangoglacier-0e0808c4.eastus2.azurecontainerapps.io
- API: https://reactcoach-demo-api.mangoglacier-0e0808c4.eastus2.azurecontainerapps.io
- Resource group: `rg-reactcoach-demo`, East US 2, personal subscription.
- API source: `d23a95ca85301cb643afac3eaab4cea1b09135f0`;
  image `reactcoach/api:d23a95ca8530-20261025125949`;
  digest `sha256:60d6ac43051d0810dd59f7bfbeaa917c63d875aa52b40c803eeae5c514c2dfa7`.
- Web source: `73e314125be3aaf0295526510ad675ed808b793e`;
  image `reactcoach/web:73e314125be3-20261025134717`;
  digest `sha256:7bd2163a1c2c0b7febe47eb353922eeec13b1bf754d73bed284468aa9b4b7542`.
- Registry: `rclgz67wzypxwhw.azurecr.io`. Cloud runs `ch1` (API), `ch2`
  (initial web) and `ch3` (navigation correction) all finished `Succeeded`.
- Both apps were verified with HTTPS ingress, HTTP disabled, 0.25 vCPU,
  0.5 GiB memory, and 0 minimum / 1 maximum replica.
- The existing subscription budget was updated from INR 10 to **INR 300/month**,
  with enabled 50%, 80% and 100% alerts to the owner's requested address.
  Billing currency was verified as INR. Delivery of a budget email was not tested.

Final hosted verification: **40 Playwright desktop/mobile tests passed, 0 failed**;
**19 public endpoint/SSE smoke checks passed, 0 failed**. The smoke checks cover
HTTPS/security headers, all three decision scenarios, offside, 23 replay records,
two source-linked insights and their details, time-scoped retrieval, repeated
byte-identical simulation output, payload bounds, CORS, invalid time rejection,
and source-event-before-insight SSE ordering. The ad hoc smoke script and receipts
remain in ignored `.local/`; they are not a new GitHub CI job.

The final local browser rerun also passed **40 tests, 0 failed**. Rust format,
Clippy with warnings denied and **81 locked workspace tests** passed; Rust source
and locked dependencies were unchanged throughout the release. Web lint,
TypeScript checking and production build passed, and the refreshed production
npm audit found **0 vulnerabilities**. Earlier 38-test local results above are
the preserved pre-navigation-regression record.

Initial hosted browser runs exposed missing waits for disabled profile controls,
the genuine late-content anchor-navigation defect fixed in this release, and
local-only startup timing assumptions. All value, identity, ordering and viewport
assertions were retained. Hosted readiness assertions now allow 20 seconds and
whole tests 75 seconds; local limits remain 5 and 45 seconds. Insight pacing is
still checked with 15-second waits, starting after `LIVE REPLAY` is established.
The two delayed-evidence navigation regression checks bring the suite to 40 tests.

The release was resumed from successful saved cloud builds after the Windows
log-streaming failure, avoiding duplicate API builds. The final script's
`--no-logs`/explicit-status path passed parsing and the three non-deploying guard
checks, but its entire paid `-Apply` path was not rerun solely to exercise that
change. Both Bicep templates compiled and the actual app deployment passed live
validation. Later test, script and documentation commits do not change the
deployed application source revisions recorded above.

**Limitations:** Scale-to-zero introduces cold-start delay; no production load or
latency SLO was established. No Log Analytics workspace or retained application-log
ingestion was provisioned. The registry's approximately US$5 full-month charge can
exceed INR 300; alerts are not spending caps. No independent Agy sign-off, current
feature-branch GitHub CI result, push, merge or platform submission is claimed.
The application still makes no Foundry coaching calls.

## Phase 3 published release — 2026-10-25

The owner explicitly authorized publishing and deploying the verified Phase 3
build. Branch `feat/phase-3-foundry-intelligence` was pushed at application commit
`4080f3e866a3cdf8082ccfc201c8e69c896edc2e`. The branch also contains the previously
unpublished match intelligence, Tactical Studio and deployment packaging history;
it was 18 commits ahead of main and zero behind. Main was not merged or changed.

[Source CI run 40201083100](https://github.com/devgupta-9/reactcoach-11/actions/runs/40201083100)
passed all infrastructure, Rust and web/browser jobs. The source passed 104
all-feature Rust tests and 44 browser checks; local default-feature verification
also passed 98 tests. Production dependency audit found zero vulnerabilities.
Documentation-only publication commits retain the same deployed application
source; their latest checks are available in the branch's GitHub Actions history.

Two uniquely tagged Linux images were built in the existing ACR:

| App | Image tag | Verified digest | ACR run | Ready revision |
| --- | --- | --- | --- | --- |
| API | `4080f3e866a3-20261025142545` | `sha256:47df23e1691a10350feb0f8379637e2a03c2e17d7ff8cff775ed1b076f65d4bc` | `ch5` Succeeded | `reactcoach-demo-api--0000001` |
| Web | `4080f3e866a3-20261025142545` | `sha256:4467f4ee8822af6882be074b59c0f287a260a4c2ccc0263d42053c974b174fe9` | `ch4` Succeeded | `reactcoach-demo-web--0000002` |

Both repositories are under `rclgz67wzypxwhw.azurecr.io/reactcoach/`.
Deployment `reactcoach-phase3-4080f3e866a3` succeeded using the existing
`apps.bicep` template in incremental mode, after live validation and What-If
inspection. Only the two existing apps were redeployed. The bootstrap template,
provider registration and role assignments were not reapplied. The resource group,
registry, environment and pull identity are unchanged; each app retains 0.25 vCPU,
0.5 GiB and 0 minimum / 1 maximum replica. No model credentials or paid public
generation route were added. These approved cloud builds are billable ACR tasks;
no additional Foundry inference was run during deployment or hosted verification.

Hosted acceptance after rollout:

- **44 Playwright checks passed**, 0 failed/skipped, desktop and mobile, 5.2 minutes.
- **18 public endpoint/security/SSE checks passed**, 0 failed.
- Both insight coaching endpoints serve stable `foundry_composition` envelopes,
  the same validated audience facts, source references and six distinct saved
  role receipts across the two moments.
- Exact-origin CORS, security headers, all existing football modes, deterministic
  simulation POST, timestamp scoping, invalid inputs and method rejection pass.
- Replay restores its kickoff snapshot, then streams exactly 22 later match events
  and two insights after their source events. The initial extra probe's incorrect
  expectation of kickoff inside `after=0` was corrected to match this contract;
  no application code or established test was weakened.
- API console logs show both saved explanations materialized as Foundry
  composition in the new ready API revision. Retained Log Analytics ingestion
  remains outside the current deployment.

Rollback references were captured before rollout and are preserved:

- API: `rclgz67wzypxwhw.azurecr.io/reactcoach/api:d23a95ca8530-20261025125949`
- Web: `rclgz67wzypxwhw.azurecr.io/reactcoach/web:73e314125be3-20261025134717`

Use the existing explicit-subscription `az containerapp update --image` rollback
procedure above if a verified regression appears. A rollback was not needed or
executed during acceptance. Cloud receipts, logs and the bounded ad hoc smoke
probe remain in ignored `.local/`; no credentials are included in this record.

The GitHub connector opened its required PR confirmation form. No draft PR was
created without **Submit**, so PR creation is still pending that interaction.
Branch publication and Azure rollout are complete independently of the PR form.
No merge, branch deletion, new infrastructure or platform submission occurred.

## Official sources

- https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser
- https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps
- https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/managedenvironments
- https://learn.microsoft.com/en-us/azure/templates/microsoft.containerregistry/2025-11-01/registries
- https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull
- https://learn.microsoft.com/en-us/azure/container-apps/log-options
- https://learn.microsoft.com/en-us/azure/container-apps/billing
- https://learn.microsoft.com/en-us/azure/container-apps/scale-app
- https://prices.azure.com/api/retail/prices
- https://github.com/advisories/GHSA-2464-fhr4-w9xw
- https://github.com/microsoft/insidethegamehackathon/blob/main/OFFICIAL%20RULES.md
