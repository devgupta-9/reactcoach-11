# Run without -Apply to print the plan without contacting Azure.
[CmdletBinding()]
param(
    [switch]$Apply,
    [guid]$SubscriptionId = [guid]::Empty,
    [guid]$ExpectedTenantId = [guid]::Empty,
    [ValidatePattern('^[a-z][a-z0-9-]{2,19}$')]
    [string]$Prefix = 'reactcoach-demo',
    [ValidatePattern('^[a-z][a-z0-9-]{2,59}$')]
    [string]$ResourceGroup = 'rg-reactcoach-demo',
    [ValidateSet('eastus2')]
    [string]$Location = 'eastus2'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Apply) {
    [pscustomobject]@{
        apply = $false
        azureOperations = 'none'
        resourceGroup = $ResourceGroup
        location = $Location
        prefix = $Prefix
        registrySku = 'Basic'
        services = @('api', 'web')
        replicas = @{ minimum = 0; maximum = 1 }
        build = 'Azure Container Registry Tasks; billable when applied'
    } | ConvertTo-Json -Depth 4
    return
}
if ($SubscriptionId -eq [guid]::Empty) {
    throw '-Apply requires an explicit personal Azure SubscriptionId.'
}
if ($ExpectedTenantId -eq [guid]::Empty) {
    throw '-Apply requires ExpectedTenantId to prevent deploying into the wrong directory.'
}
$dirty = & git -C $repoRoot status --porcelain=v1
if ($LASTEXITCODE -ne 0 -or $dirty) {
    throw 'Deploy only a reviewed, committed working tree. Existing work was preserved.'
}
$revision = (& git -C $repoRoot rev-parse --short=12 HEAD).Trim()
$imageTag = "$revision-$(Get-Date -Format 'yyyyMMddHHmmss')"
$azureCommand = Get-Command az -ErrorAction SilentlyContinue
if ($azureCommand) {
    $script:azureCliCommand = $azureCommand.Source
} else {
    $portable = Join-Path $env:LOCALAPPDATA 'Programs\AzureCLI\2.91.0\bin\az.cmd'
    if (-not (Test-Path -LiteralPath $portable)) { throw 'Install Azure CLI and sign in first.' }
    $script:azureCliCommand = $portable
}
$env:AZURE_CORE_COLLECT_TELEMETRY = 'false'
$env:AZURE_EXTENSION_USE_DYNAMIC_INSTALL = 'no'
$env:AZURE_CORE_ENABLE_BROKER_ON_WINDOWS = 'false'

function Invoke-Azure {
    param([string[]]$CliArguments, [switch]$AsJson)
    if ($AsJson) {
        $response = & $script:azureCliCommand @CliArguments --only-show-errors --output json
        if ($LASTEXITCODE -ne 0) { throw "Azure command failed: $($CliArguments[0..1] -join ' ')" }
        return (($response -join [Environment]::NewLine) | ConvertFrom-Json)
    }
    & $script:azureCliCommand @CliArguments --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "Azure command failed: $($CliArguments[0..1] -join ' ')" }
}

$context = Invoke-Azure -AsJson -CliArguments @('account', 'show', '--subscription', "$SubscriptionId")
if ($context.tenantId -ne "$ExpectedTenantId" -or $context.state -ne 'Enabled') {
    throw 'Subscription must be Enabled and belong to the explicitly selected tenant.'
}
$groupExists = Invoke-Azure -AsJson -CliArguments @('group', 'exists', '--subscription', "$SubscriptionId", '--name', $ResourceGroup)
if ($groupExists) {
    $group = Invoke-Azure -AsJson -CliArguments @('group', 'show', '--subscription', "$SubscriptionId", '--name', $ResourceGroup)
    if ($group.tags.project -ne 'ReactCoach11') { throw 'Existing resource group is not tagged for ReactCoach11; refusing to alter it.' }
} else {
    Invoke-Azure -CliArguments @('group', 'create', '--subscription', "$SubscriptionId", '--name', $ResourceGroup, '--location', $Location, '--tags', 'project=ReactCoach11', 'purpose=hackathon-demo', '--output', 'none')
}
foreach ($provider in @('Microsoft.App', 'Microsoft.ContainerRegistry', 'Microsoft.ManagedIdentity')) {
    Write-Host "Registering required provider: $provider"
    Invoke-Azure -CliArguments @('provider', 'register', '--subscription', "$SubscriptionId", '--namespace', $provider, '--wait')
}
$bootstrapFile = Join-Path $repoRoot 'infrastructure\azure\bootstrap.bicep'
$appsFile = Join-Path $repoRoot 'infrastructure\azure\apps.bicep'
$common = @('--subscription', "$SubscriptionId", '--resource-group', $ResourceGroup)
Invoke-Azure -CliArguments (@('deployment', 'group', 'validate') + $common + @('--template-file', $bootstrapFile, '--parameters', "prefix=$Prefix", "location=$Location", '--output', 'none'))
Write-Host 'Creating Consumption environment, Basic registry and registry-only pull identity.'
$bootstrap = Invoke-Azure -AsJson -CliArguments (@('deployment', 'group', 'create') + $common + @('--name', 'reactcoach-bootstrap', '--template-file', $bootstrapFile, '--parameters', "prefix=$Prefix", "location=$Location", '--query', 'properties.outputs'))
$registry = $bootstrap.registryName.value
$apiUrl = $bootstrap.apiUrl.value

Push-Location $repoRoot
try {
    Write-Host 'Building the Rust API Linux image in Azure.'
    # Suppress Unicode log streaming: the Windows CLI uses isolated Python and
    # ignores PYTHONIOENCODING. --no-logs still polls for the actual run result.
    $apiBuild = Invoke-Azure -AsJson -CliArguments @('acr', 'build', '--subscription', "$SubscriptionId", '--registry', $registry, '--platform', 'linux/amd64', '--image', "reactcoach/api:$imageTag", '--file', 'apps/api/Dockerfile', '--timeout', '1800', '--no-logs', '.')
    if ($apiBuild.status -ne 'Succeeded') { throw "API image run $($apiBuild.runId) did not succeed: $($apiBuild.status)" }
    Write-Host 'Building Next.js with the public API URL embedded at build time.'
    $webBuild = Invoke-Azure -AsJson -CliArguments @('acr', 'build', '--subscription', "$SubscriptionId", '--registry', $registry, '--platform', 'linux/amd64', '--image', "reactcoach/web:$imageTag", '--file', 'apps/web/Dockerfile', '--build-arg', "NEXT_PUBLIC_API_URL=$apiUrl", '--timeout', '1800', '--no-logs', '.')
    if ($webBuild.status -ne 'Succeeded') { throw "Web image run $($webBuild.runId) did not succeed: $($webBuild.status)" }
} finally {
    Pop-Location
}
Invoke-Azure -CliArguments (@('deployment', 'group', 'validate') + $common + @('--template-file', $appsFile, '--parameters', "prefix=$Prefix", "imageTag=$imageTag", '--output', 'none'))
Write-Host 'Deploying HTTPS frontend and API with exact-origin CORS and health probes.'
$apps = Invoke-Azure -AsJson -CliArguments (@('deployment', 'group', 'create') + $common + @('--name', 'reactcoach-apps', '--template-file', $appsFile, '--parameters', "prefix=$Prefix", "imageTag=$imageTag", '--query', 'properties.outputs'))
$receipt = [pscustomobject]@{
    subscriptionId = "$SubscriptionId"
    resourceGroup = $ResourceGroup
    revision = $revision
    imageTag = $imageTag
    apiUrl = $apps.apiUrl.value
    webUrl = $apps.webUrl.value
    apiImage = $apps.apiImage.value
    webImage = $apps.webImage.value
}
$receiptFolder = Join-Path $repoRoot '.local'
New-Item -ItemType Directory -Path $receiptFolder -Force | Out-Null
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $receiptFolder "azure-deployment-$imageTag.json") -Encoding UTF8
$receipt | ConvertTo-Json
Write-Host 'Deployment finished. Verify public API, CORS, SSE and desktop/mobile browser flows before declaring release acceptance.'
