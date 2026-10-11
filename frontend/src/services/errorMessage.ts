/** FastAPI field errors and report review errors share one readable message. */
export function errorMessage(body: unknown, status: number): string {
  const fallback = `HTTP ${status}`
  if (!body || typeof body !== 'object' || !('detail' in body)) return fallback
  const detail = body.detail
  if (typeof detail === 'string') return detail || fallback
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object' || !('msg' in item) || typeof item.msg !== 'string') return []
      const location = 'loc' in item && Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : ''
      return [location ? `${location}: ${item.msg}` : item.msg]
    })
    return messages.join('; ') || fallback
  }
  if (detail && typeof detail === 'object' && 'errors' in detail && Array.isArray(detail.errors)) {
    return detail.errors.filter((item): item is string => typeof item === 'string').join('; ') || fallback
  }
  return fallback
}
