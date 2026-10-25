# Azure demo infrastructure

The current release uses two Azure Container Apps (Rust API and Next.js), a
Consumption-only environment, and a private Basic Azure Container Registry.
Each app has 0 minimum / 1 maximum replicas, 0.25 vCPU and 0.5 GiB memory.
Registry image pulls use a managed identity with registry-scoped `AcrPull`.
No registry passwords, database, or Log Analytics workspace are required.

See [deployment and rollback](../docs/AZURE_DEPLOYMENT.md). Start with the
non-deploying plan:

```powershell
powershell -NoProfile -File scripts/deploy-azure.ps1
```

`-Apply`, an explicit subscription and an explicit tenant are required for cloud
changes. An existing resource group is accepted only if tagged for ReactCoach11.
Use a reviewed, committed checkout. The script builds Linux images in Azure,
embeds the public API URL during the Next.js build, and configures exact-origin CORS.

Foundry resource provisioning and a successful inference smoke test do not mean
that the application's coaching workflow is implemented. That remains Phase 3.
