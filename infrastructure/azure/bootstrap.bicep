targetScope = 'resourceGroup'

param location string = resourceGroup().location
@minLength(3)
@maxLength(20)
param prefix string = 'reactcoach-demo'

// Consumption-only environment: no dedicated nodes, private endpoints, or
// separate paid Log Analytics workspace. Console logs remain streamable.
// https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/managedenvironments
resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      // The ARM API uses null; "none" is only the Azure CLI spelling.
      destination: null
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: 'rc${uniqueString(resourceGroup().id)}'
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    roleAssignmentMode: 'LegacyRegistryPermissions'
    policies: {
      azureADAuthenticationAsArmPolicy: {
        status: 'enabled'
      }
    }
  }
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-pull'
  location: location
}

// Pull permission is scoped to this registry. No registry passwords are used.
// https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull
resource pullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, pullIdentity.id, 'AcrPull')
  scope: registry
  properties: {
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

output registryName string = registry.name
output registryServer string = registry.properties.loginServer
output apiUrl string = 'https://${prefix}-api.${environment.properties.defaultDomain}'
output webUrl string = 'https://${prefix}-web.${environment.properties.defaultDomain}'
