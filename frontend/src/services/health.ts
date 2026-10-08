import type { HealthStatus } from '../types/health'

export async function getHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const response = await fetch('/api/health', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Backend responded ${response.status}`)
  const data: unknown = await response.json()
  if (
    !data ||
    typeof data !== 'object' ||
    !('database' in data) ||
    data.database !== 'connected' ||
    !('stage' in data) ||
    data.stage !== 'foundation'
  ) {
    throw new Error('Unexpected backend response')
  }
  return data as HealthStatus
}

