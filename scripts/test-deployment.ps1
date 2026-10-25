$ErrorActionPreference = 'Stop'
$deploy = Join-Path $PSScriptRoot 'deploy-azure.ps1'
$plan = (& $deploy | Out-String) | ConvertFrom-Json
if ($plan.apply -ne $false -or $plan.azureOperations -ne 'none') { throw 'Default invocation must remain non-deploying.' }
if ($plan.services.Count -ne 2 -or $plan.replicas.maximum -ne 1) { throw 'Unexpected deployment scope.' }
$missingSubscriptionRejected = $false
try { & $deploy -Apply } catch {
    if ($_.Exception.Message -notmatch 'SubscriptionId') { throw }
    $missingSubscriptionRejected = $true
}
if (-not $missingSubscriptionRejected) { throw 'An explicit subscription must be required before cloud operations.' }
$missingTenantRejected = $false
try { & $deploy -Apply -SubscriptionId '11111111-1111-1111-1111-111111111111' } catch {
    if ($_.Exception.Message -notmatch 'ExpectedTenantId') { throw }
    $missingTenantRejected = $true
}
if (-not $missingTenantRejected) { throw 'An explicit tenant must be required before cloud operations.' }
'Deployment guard checks: 3 passed; 0 Azure operations.'
