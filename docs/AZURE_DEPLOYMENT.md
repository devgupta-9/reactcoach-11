# Azure deployment and release stages

Release preparation started **2026-10-25** on `feat/azure-release-prep`, preserving
the unpublished Phase 2B and Tactical Studio commits. The owner requested starting
Azure deployment on the existing pay-as-you-go account. No active Azure credits
were found in the billing profile when checked on October 24.

## Scope and missing stages

| Stage | Evidence / acceptance gate |
| --- | --- |
| Deterministic engine, replay and Tactical Studio | Existing local implementation; retain all three decision scenarios, offside and both spatial moments |
| Foundry resource and model access | Real Responses smoke test returned HTTP 200 and `READY` on October 25; 11 input / 19 output tokens; one request, no retry |
| Foundry application integration | **Pending**: interpreter, challenger, narrator, factual validator, outage fallback and two real evidence-linked explanations |
| Audience experience | **Pending**: distinct Fan/Analyst views, synchronized broadcast overlay and evidence-grounded recap; existing studio is only part of this phase |
| Public Azure hosting | Deployment templates and release script prepared; acceptance requires successful Linux image builds, healthy public endpoints and deployed browser tests |
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
