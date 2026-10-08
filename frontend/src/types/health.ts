export interface HealthStatus {
  status: 'ok'
  version: string
  stage: 'foundation'
  database: 'connected'
  capabilities: {
    inspections: boolean
    docx: boolean
    offline_pwa: boolean
  }
}

