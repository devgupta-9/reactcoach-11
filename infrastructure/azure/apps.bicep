targetScope = 'resourceGroup'

param location string = resourceGroup().location
@minLength(3)
@maxLength(20)
param prefix string = 'reactcoach-demo'
@minLength(1)
param imageTag string

// Allow a frontend-only correction to retain the verified API image.
@minLength(1)
param apiImageTag string = imageTag

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: '${prefix}-env'
}
resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' existing = {
  name: 'rc${uniqueString(resourceGroup().id)}'
}
resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: '${prefix}-pull'
}

var webOrigin = 'https://${prefix}-web.${environment.properties.defaultDomain}'
var services = [
  {
    name: 'api'
    port: 8080
    healthPath: '/api/v1/health'
  }
  {
    name: 'web'
    port: 3000
    healthPath: '/'
  }
]

// HTTP scaling thresholds do not enforce a hard request or spending limit.
// https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps
resource apps 'Microsoft.App/containerApps@2025-01-01' = [for service in services: {
  name: '${prefix}-${service.name}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: service.port
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: pullIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: '${registry.properties.loginServer}/reactcoach/${service.name}:${service.name == 'api' ? apiImageTag : imageTag}'
          env: service.name == 'api' ? [
            {
              name: 'PORT'
              value: '8080'
            }
            {
              name: 'WEB_ORIGIN'
              value: webOrigin
            }
            {
              name: 'RUST_LOG'
              value: 'info'
            }
          ] : [
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'HOSTNAME'
              value: '0.0.0.0'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [for probe in [
            {
              type: 'Startup'
              interval: 2
              failures: 60
            }
            {
              type: 'Readiness'
              interval: 10
              failures: 3
            }
            {
              type: 'Liveness'
              interval: 30
              failures: 3
            }
          ]: {
            type: probe.type
            httpGet: {
              path: service.healthPath
              port: service.port
              scheme: 'HTTP'
            }
            periodSeconds: probe.interval
            failureThreshold: probe.failures
            timeoutSeconds: 2
          }]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}]

output apiUrl string = 'https://${apps[0].properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${apps[1].properties.configuration.ingress.fqdn}'
output apiImage string = '${registry.properties.loginServer}/reactcoach/api:${apiImageTag}'
output webImage string = '${registry.properties.loginServer}/reactcoach/web:${imageTag}'
