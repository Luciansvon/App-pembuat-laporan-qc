import { useEffect, useRef, useState } from 'react'

/** Keep newer edits pending until their own request finishes. */
export function useAutosave<T>(initial: T, save: (draft: T) => Promise<boolean>, onPendingChange: (pending: boolean) => void) {
  const [draft, setDraft] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const generation = useRef(0)
  const saveRef = useRef(save)
  const pendingRef = useRef(onPendingChange)
  saveRef.current = save
  pendingRef.current = onPendingChange

  useEffect(() => {
    if (!dirty || saving || saveFailed) return
    const timer = window.setTimeout(() => {
      const submitted = generation.current
      setSaving(true)
      void saveRef.current(draft).then((saved) => {
        if (!saved) {
          setSaveFailed(true)
        } else if (generation.current === submitted) {
          setDirty(false)
          pendingRef.current(false)
        }
      }).catch(() => setSaveFailed(true)).finally(() => setSaving(false))
    }, 850)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, saving, saveFailed])

  function update(next: T) {
    generation.current += 1
    setDraft(next)
    setDirty(true)
    setSaveFailed(false)
    pendingRef.current(true)
  }

  function discard(next: T) {
    generation.current += 1
    setDraft(next)
    setDirty(false)
    setSaveFailed(false)
    pendingRef.current(false)
  }

  return { draft, dirty: dirty || saving, saving, saveFailed, update, discard, retry: () => setSaveFailed(false) }
}
