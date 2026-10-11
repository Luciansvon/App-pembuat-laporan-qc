import type { Customer, Defect, Inspection, Issue, Measurement, Photo, Product, ReportPreview, Review, TestReading } from '../types/qc'
import { errorMessage } from './errorMessage'
import { androidReport, isAndroidApp, type AndroidReportResult } from './android'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method === 'DELETE' ? { 'X-Confirm-Delete': 'true' } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: 'no-store',
  })
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      detail = errorMessage(await response.json(), response.status)
    } catch { /* HTTP detail may not be JSON */ }
    throw new ApiError(response.status, detail)
  }
  return response.json() as Promise<T>
}

export const api = {
  customers: () => request<Customer[]>('/customers'),
  createCustomer: (body: { code: string; name: string }) => request<Customer>('/customers', 'POST', body),
  products: () => request<Product[]>('/products'),
  createProduct: (body: { customer_id: string; name: string; standard_dimensions: Record<string, number> }) => request<Product>('/products', 'POST', body),
  inspections: () => request<Inspection[]>('/inspections'),
  inspection: (id: string) => request<Inspection>(`/inspections/${id}`),
  createInspection: (body: Record<string, unknown>) => request<Inspection>('/inspections', 'POST', body),
  patchInspection: (id: string, body: Record<string, unknown>) => request<Inspection>(`/inspections/${id}`, 'PATCH', body),
  deleteInspection: (id: string) => request<{ deleted: string }>(`/inspections/${id}`, 'DELETE'),
  addMeasurement: (id: string, body: Record<string, unknown>) => request<Measurement>(`/inspections/${id}/measurements`, 'POST', body),
  patchMeasurement: (id: string, body: Record<string, unknown>) => request<Measurement>(`/measurements/${id}`, 'PATCH', body),
  deleteMeasurement: (id: string) => request<{ deleted: string }>(`/measurements/${id}`, 'DELETE'),
  addReading: (id: string, value: number) => request<TestReading>(`/measurements/${id}/readings`, 'POST', { value }),
  deleteReading: (id: string) => request<{ deleted: string }>(`/readings/${id}`, 'DELETE'),
  issues: (id: string, body: Record<string, unknown>) => request<Issue>(`/inspections/${id}/issues`, 'POST', body),
  patchIssue: (id: string, body: Record<string, unknown>) => request<Issue>(`/issues/${id}`, 'PATCH', body),
  deleteIssue: (id: string) => request<{ deleted: string }>(`/issues/${id}`, 'DELETE'),
  patchPhoto: (id: string, body: Record<string, unknown>) => request<Photo>(`/photos/${id}`, 'PATCH', body),
  deletePhoto: (id: string) => request<{ deleted: string }>(`/photos/${id}`, 'DELETE'),
  defects: () => request<Defect[]>('/defects'),
  createDefect: (name: string) => request<Defect>('/defects', 'POST', { name }),
  validate: (id: string) => request<Review>(`/inspections/${id}/validate`, 'POST'),
  previewReport: (id: string) => request<ReportPreview>(`/inspections/${id}/report/preview`, 'POST'),
  async upload(id: string, section: string, files: FileList | File[], issueId?: string, measurementId?: string, dimensionSlot?: 1 | 2): Promise<Photo[]> {
    const form = new FormData()
    form.append('section', section)
    if (issueId) form.append('issue_id', issueId)
    if (measurementId) form.append('measurement_id', measurementId)
    if (dimensionSlot) form.append('dimension_slot', String(dimensionSlot))
    for (const file of Array.from(files)) form.append('files', file)
    const response = await fetch(`/api/inspections/${id}/photos`, { method: 'POST', body: form })
    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try { detail = errorMessage(await response.json(), response.status) } catch { /* Non-JSON server error */ }
      throw new ApiError(response.status, `Upload gagal: ${detail}`)
    }
    return response.json() as Promise<Photo[]>
  },
  openAndroidReport: (id: string) => androidReport(id, 'open'),
  async downloadReport(id: string): Promise<'downloaded' | AndroidReportResult> {
    if (isAndroidApp()) return androidReport(id, 'download')
    const response = await fetch(`/api/inspections/${id}/report/docx`, { method: 'POST' })
    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try { detail = errorMessage(await response.json(), response.status) } catch { /* Non-JSON server error */ }
      throw new ApiError(response.status, detail)
    }
    const filename = response.headers.get('content-disposition')?.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i)?.[1] || 'QC-Inspection-Report.docx'
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = decodeURIComponent(filename.replace(/^"|"$/g, ''))
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return 'downloaded'
  },
}
