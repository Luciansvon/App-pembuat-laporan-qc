import type { Customer, Defect, Inspection, Issue, Measurement, Photo, Product, ReportPreview, Review, TestReading } from '../types/qc'

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
      const body: { detail?: string | { errors?: string[] } } = await response.json()
      detail = typeof body.detail === 'string' ? body.detail : body.detail?.errors?.join('; ') || detail
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
  async upload(id: string, section: string, files: FileList | File[], issueId?: string): Promise<Photo[]> {
    const form = new FormData()
    form.append('section', section)
    if (issueId) form.append('issue_id', issueId)
    for (const file of Array.from(files)) form.append('files', file)
    const response = await fetch(`/api/inspections/${id}/photos`, { method: 'POST', body: form })
    if (!response.ok) throw new ApiError(response.status, `Upload gagal: HTTP ${response.status}`)
    return response.json() as Promise<Photo[]>
  },
  async downloadReport(id: string): Promise<void> {
    const response = await fetch(`/api/inspections/${id}/report/docx`, { method: 'POST' })
    if (!response.ok) {
      const body: { detail?: string | { errors?: string[] } } = await response.json()
      throw new ApiError(response.status, typeof body.detail === 'string' ? body.detail : body.detail?.errors?.join('; ') || `HTTP ${response.status}`)
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
  },
}
