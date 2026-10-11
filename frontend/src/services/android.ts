export const isAndroidApp = () => navigator.userAgent.includes('InspectraAndroid/')

export type AndroidReportResult = 'saved' | 'opened' | 'cancelled'

export function androidReport(id: string, action: 'download' | 'open'): Promise<AndroidReportResult> {
  const token = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('inspectra-report-result', receive)
      window.clearTimeout(timer)
    }
    const receive = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail
      if (!detail || typeof detail !== 'object' || !('token' in detail) || detail.token !== token) return
      if (!('status' in detail)) return
      cleanup()
      if (detail.status === 'saved' || detail.status === 'opened' || detail.status === 'cancelled') resolve(detail.status)
      else reject(new Error('message' in detail && typeof detail.message === 'string' ? detail.message : 'Laporan gagal diproses. Coba lagi.'))
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Proses laporan terlalu lama. Tutup dialog Android lalu coba lagi.'))
    }, 600_000)
    window.addEventListener('inspectra-report-result', receive)
    try {
      window.location.href = `inspectra-report://${action}/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
