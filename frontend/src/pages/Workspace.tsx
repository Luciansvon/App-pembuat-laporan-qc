import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import DimensionPhotos, { DimensionPair } from '../components/DimensionPhotos'
import { ConfirmModal, type ConfirmOptions } from '../components/ConfirmModal'
import { isAndroidApp } from '../services/android'
import { useAutosave } from '../hooks/useAutosave'
import type { Defect, Inspection, Issue, Measurement, Photo, PhotoLayoutCatalog, PhotoLayoutTemplate, PhotoPage, ReportPreview, Review } from '../types/qc'

type Action = (task: () => Promise<unknown>, message?: string) => Promise<boolean>
export type Tab = 'overview' | 'photos' | 'measurements' | 'tests' | 'issues' | 'review'
  const sections = ['PRODUCT_VIEW', 'PRODUCT_DETAIL', 'DRAWING', 'DIMENSION', 'RADIUS', 'MC', 'GLOSS', 'GAP_SLIDE', 'CORNER', 'SWATCH', 'TRIAL_BACKREST', 'ISSUE', 'OTHER']
const sectionLabel = (section: string) => section.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
const axes = ['L', 'W', 'D', 'H']
const isDesktopView = typeof window !== 'undefined' && ('pywebview' in window || navigator.userAgent.includes('pywebview'))

function initialDraft(inspection: Inspection): Record<string, string> {
  const result: Record<string, string> = {
    po: inspection.po, inspection_type: inspection.inspection_type, date: inspection.date,
    location: inspection.location || '', qc_name: inspection.qc_name, quantity: String(inspection.quantity),
    aql: inspection.aql || '', inspected_quantity: inspection.inspected_quantity?.toString() || '',
    status: inspection.status, conclusion: inspection.conclusion || '',
    communication_status: inspection.communication_status || '',
  }
  for (const axis of axes) {
    result[`dim_${axis}`] = inspection.product_dimensions[axis]?.toString() || ''
    result[`box_${axis}`] = inspection.box_dimensions[axis]?.toString() || ''
  }
  return result
}

function Overview({ inspection, run, onPendingChange }: { inspection: Inspection; run: Action; onPendingChange: (pending: boolean) => void }) {
  const { draft, saveFailed, saving, update: updateDraft, discard, retry } = useAutosave(initialDraft(inspection), async (draft) => {
      const dimensions = (source: Record<string, number>, prefix: string) => ({
        ...Object.fromEntries(Object.entries(source).filter(([axis]) => !axes.includes(axis))),
        ...Object.fromEntries(axes.filter((axis) => draft[`${prefix}_${axis}`] !== '').map((axis) => [axis, Number(draft[`${prefix}_${axis}`])])),
      })
      const product_dimensions = dimensions(inspection.product_dimensions, 'dim')
      const box_dimensions = dimensions(inspection.box_dimensions, 'box')
      const patch = {
        revision: inspection.revision, po: draft.po, inspection_type: draft.inspection_type,
        date: draft.date, location: draft.location || null, qc_name: draft.qc_name,
        quantity: Number(draft.quantity), aql: draft.aql || null,
        inspected_quantity: draft.inspected_quantity === '' ? null : Number(draft.inspected_quantity),
        product_dimensions, box_dimensions, status: draft.status,
        conclusion: draft.conclusion || null, communication_status: draft.communication_status || null,
      }
      return run(() => api.patchInspection(inspection.id, patch), 'Perubahan inspeksi tersimpan otomatis.')
  }, onPendingChange)
  function update(key: string, value: string) { updateDraft({ ...draft, [key]: value }) }
  return <div className="field-card"><div className="field-card-heading"><div><span className="section-kicker">01 / OVERVIEW</span><h2>{inspection.product_name}</h2></div><p>{inspection.customer_name} · {inspection.inspection_number}</p></div>
    <div className="summary-strip"><span>PO <strong>{inspection.po}</strong></span><span>QTY <strong>{inspection.quantity}</strong></span><span>AQL <strong>{inspection.aql || '—'}</strong></span><span>STATUS <strong>{inspection.status}</strong></span></div>
    <p className="field-help">Perubahan form ini tersimpan otomatis setelah berhenti mengetik. Angka di header adalah standar produk; hasil pengukuran di tab Measurement.</p>
    <div className="form-grid">
      <label>PO<input value={draft.po} onChange={(event) => update('po', event.target.value)} /></label>
      <label>Inspect<select value={draft.inspection_type} onChange={(event) => update('inspection_type', event.target.value)}><option>INLINE</option><option>FINAL</option><option>PRE_SHIPMENT</option><option>OTHER</option></select></label>
      <label>Tanggal<input type="date" value={draft.date} onChange={(event) => update('date', event.target.value)} /></label>
      <label>Lokasi<input value={draft.location} onChange={(event) => update('location', event.target.value)} /></label>
      <label>QC<input value={draft.qc_name} onChange={(event) => update('qc_name', event.target.value)} /></label>
      <label>QTY<input type="number" min="1" value={draft.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>
      <label>AQL sesuai dokumen<input value={draft.aql} onChange={(event) => update('aql', event.target.value)} /></label>
      <label>Jumlah diinspeksi<input type="number" min="0" value={draft.inspected_quantity} onChange={(event) => update('inspected_quantity', event.target.value)} /></label>
      <label>Status<select value={draft.status} onChange={(event) => update('status', event.target.value)}><option>DRAFT</option><option>IN_PROGRESS</option><option>REVIEW</option><option>COMPLETED</option></select></label>
    </div>
    <h3 className="subheading">DIM(mm) — standar header</h3><div className="axis-fields">{axes.map((axis) => <label key={axis}>{axis}<input type="number" step="any" value={draft[`dim_${axis}`] || ''} onChange={(event) => update(`dim_${axis}`, event.target.value)} /></label>)}</div>
    <h3 className="subheading">BOX(mm) — opsional</h3><div className="axis-fields">{axes.map((axis) => <label key={axis}>{axis}<input type="number" step="any" value={draft[`box_${axis}`] || ''} onChange={(event) => update(`box_${axis}`, event.target.value)} /></label>)}</div>
    <h3 className="subheading">Kesimpulan QC</h3><div className="form-grid"><label className="span-2">Conclusion<textarea value={draft.conclusion} onChange={(event) => update('conclusion', event.target.value)} placeholder="Isi hanya hasil yang sudah diperiksa QC." /></label><label className="span-2">Komunikasi / perbaikan<textarea value={draft.communication_status} onChange={(event) => update('communication_status', event.target.value)} placeholder="Contoh: sudah dikomunikasikan; jangan tandai repaired jika belum." /></label></div>
    {saveFailed && <div className="save-recovery" role="alert">Penyimpanan gagal. Perbaiki isian lalu coba lagi.<button type="button" disabled={saving} onClick={retry}>Coba simpan</button><button type="button" disabled={saving} onClick={() => discard(initialDraft(inspection))}>Batalkan perubahan</button></div>}
  </div>
}

function Photos({ inspection, run, captureIssue, refresh, goIssues, goDimensions, askConfirm }: { inspection: Inspection; run: Action; captureIssue: string | null; refresh: () => Promise<void>; goIssues: () => void; goDimensions: () => void; askConfirm: (options: ConfirmOptions) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const slotFileInput = useRef<HTMLInputElement>(null)
  const slotUploadTarget = useRef<{ page: PhotoPage; slot: number } | null>(null)
  const [slotUploading, setSlotUploading] = useState<number | null>(null)
  const uploadTarget = useRef<{ section: string; issueId: string }>({ section: captureIssue ? 'ISSUE' : 'PRODUCT_VIEW', issueId: captureIssue || '' })
  const [section, setSection] = useState(captureIssue ? 'ISSUE' : 'PRODUCT_VIEW')
  const [issueId, setIssueId] = useState(captureIssue || '')
  const [preview, setPreview] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [layouts, setLayouts] = useState<PhotoLayoutCatalog | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<'layout' | 'slots'>('layout')
  const [wizardSection, setWizardSection] = useState('PRODUCT_VIEW')
  const [category, setCategory] = useState('Semua')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [pageSaving, setPageSaving] = useState(false)
  const pageSaveLock = useRef(false)
  const photoPages = inspection.photo_pages || []
  useEffect(() => { void api.photoLayouts().then(setLayouts).catch(() => setLayouts(null)) }, [])
  useEffect(() => { if (captureIssue) { setSection('ISSUE'); setIssueId(captureIssue) } }, [captureIssue])
  const ordered = inspection.photos.filter(photo => photo.section !== 'DIMENSION' || !photo.measurement_id).sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
  const pageableSections = (layouts?.templates || []).flatMap(layout => layout.sections).filter((item, index, all) => all.indexOf(item) === index)
  const categoryOptions = ['Semua', ...((layouts?.templates || []).map(layout => layout.category).filter((item, index, all) => all.indexOf(item) === index))]
  const visibleLayouts = (layouts?.templates || []).filter(layout => layout.sections.includes(wizardSection) && (category === 'Semua' || layout.category === category))
  const getLayout = (id: string) => layouts?.templates.find(layout => layout.id === id)
  function quickCapture(nextSection: string) { setSection(nextSection); if (nextSection === 'DIMENSION') return; if (nextSection !== 'ISSUE') setIssueId(''); uploadTarget.current = { section: nextSection, issueId: nextSection === 'ISSUE' ? issueId : '' }; input.current?.click() }
  function openWizard() {
    const startSection = pageableSections.includes(section) ? section : 'PRODUCT_VIEW'
    setWizardSection(startSection); setCategory('Semua'); setTemplateId(null); setActivePageId(null)
    setWizardStep('layout'); setWizardOpen(true)
  }
  function patchPhotoPages(next: PhotoPage[], message: string) {
    if (pageSaveLock.current) return Promise.resolve(false)
    pageSaveLock.current = true
    setPageSaving(true)
    return run(async () => {
      const latest = await api.inspection(inspection.id)
      return api.patchInspection(inspection.id, { revision: latest.revision, photo_pages: next })
    }, message)
      .finally(() => { pageSaveLock.current = false; setPageSaving(false) })
  }
  async function continueToSlots() {
    const layout = templateId ? getLayout(templateId) : undefined
    if (!layout) return
    const previousPage = activePageId ? photoPages.find(page => page.id === activePageId) : undefined
    const newPage: PhotoPage = { id: previousPage?.id || globalThis.crypto?.randomUUID?.() || `page-${Date.now()}`, section: wizardSection, template_id: layout.id, photo_ids: Array.from({ length: layout.photo_count }, (_, index) => {
      const previousPhotoId = previousPage?.photo_ids[index] || null
      return previousPhotoId && inspection.photos.find(photo => photo.id === previousPhotoId)?.section === wizardSection ? previousPhotoId : null
    }) }
    const next = activePageId
      ? photoPages.map(page => page.id === activePageId ? newPage : page)
      : [...photoPages, newPage]
    const saved = await patchPhotoPages(next, 'Halaman foto dibuat.')
    if (saved) { setActivePageId(newPage.id); setWizardStep('slots') }
  }
  function changeSlot(page: PhotoPage, slot: number, photoId: string) {
    const nextPage = { ...page, photo_ids: page.photo_ids.map((item, index) => index === slot ? (photoId || null) : item) }
    void patchPhotoPages(photoPages.map(item => item.id === page.id ? nextPage : item), 'Pilihan foto dan caption tersimpan di halaman.')
  }
  function removePage(page: PhotoPage) {
    askConfirm({
      title: 'Hapus Halaman Foto?',
      message: 'Apakah Anda yakin ingin menghapus tata letak halaman ini? Foto di galeri tetap tersimpan aman.',
      confirmText: 'Hapus Halaman',
      onConfirm: () => {
        void patchPhotoPages(photoPages.filter(item => item.id !== page.id), 'Halaman foto dihapus.')
        if (activePageId === page.id) { setWizardOpen(false); setActivePageId(null) }
      }
    })
  }
  function movePage(index: number, delta: -1 | 1) {
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= photoPages.length) return
    const next = [...photoPages]
    ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
    void patchPhotoPages(next, 'Urutan halaman diperbarui.')
  }
  function renderPageSlots(page: PhotoPage, layout: PhotoLayoutTemplate, showTitle = false) {
    const usedElsewhere = new Set(photoPages.filter(item => item.id !== page.id).flatMap(item => item.photo_ids).filter((id): id is string => Boolean(id)))
    return <>
      {showTitle && <div className="photo-slot-heading"><strong>Pilih foto untuk {layout.code}</strong><span>{page.photo_ids.filter(Boolean).length}/{layout.photo_count} slot · caption mengikuti foto di galeri</span></div>}
      <div className="report-page-slots" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}>
        {page.photo_ids.map((photoId, slot) => {
          const photo = inspection.photos.find(item => item.id === photoId)
          const usedInOtherSlots = new Set(page.photo_ids.filter((item, index): item is string => index !== slot && Boolean(item)))
          const candidates = inspection.photos.filter(item => item.section === page.section && !usedElsewhere.has(item.id) && !usedInOtherSlots.has(item.id))
          return <article className={`report-page-slot${photo ? ' filled' : ''}`} key={`${page.id}-${slot}`}>
            {photo ? (
              <div className="report-page-slot-preview">
                <img
                  src={`/api/photos/${photo.id}/file?v=${inspection.revision}`}
                  alt={photo.caption || `Foto ${slot + 1}`}
                  onClick={() => setPreview(photo.id)}
                  title="Klik untuk melihat foto penuh"
                />
                <button
                  type="button"
                  className="report-page-slot-clear"
                  title="Lepas foto dari slot ini"
                  disabled={pageSaving}
                  onClick={() => changeSlot(page, slot, '')}
                >
                  Lepas
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="report-page-slot-empty"
                disabled={pageSaving || slotUploading === slot}
                aria-label={`Tambah foto ke slot ${slot + 1}`}
                onClick={() => {
                  slotUploadTarget.current = { page, slot }
                  slotFileInput.current?.click()
                }}
              >
                <span>＋</span>
                <strong>{slotUploading === slot ? 'Mengunggah…' : `Foto ${slot + 1}`}</strong>
                <small>Klik untuk pilih & unggah foto</small>
              </button>
            )}
            <label>Atau pilih dari galeri<select aria-label={`Foto slot ${slot + 1} ${layout.code}`} disabled={pageSaving} value={photoId || ''} onChange={event => changeSlot(page, slot, event.target.value)}>
              <option value="">Pilih foto…</option>
              {candidates.map(item => <option key={item.id} value={item.id}>{item.caption?.trim() || `${sectionLabel(item.section)} · Foto ${item.sort_order}`}</option>)}
            </select></label>
            <p className="report-page-caption">{photo?.caption?.trim() || 'Caption belum diisi'}</p>
          </article>
        })}
      </div>
    </>
  }
  async function reorder(source: Photo, target: Photo) {
    if (source.id === target.id) return
    const saved = await run(async () => {
      await api.patchPhoto(source.id, { sort_order: target.sort_order })
      try {
        await api.patchPhoto(target.id, { sort_order: source.sort_order })
      } catch (cause) {
        try {
          await api.patchPhoto(source.id, { sort_order: source.sort_order })
        } catch {
          // Biarkan refresh yang meluruskan tampilan dengan kebenaran server.
        }
        throw cause
      }
    }, 'Urutan foto tersimpan.')
    // run() sudah memuat ulang dari server saat sukses; refresh eksplisit
    // hanya untuk meluruskan tampilan bila gagal.
    if (!saved) await refresh()
  }
  return <div className="field-card"><div className="field-card-heading"><div><span className="section-kicker">02 / PHOTOS</span><h2>Foto inspeksi</h2></div><p>Atur foto per halaman laporan. Caption tetap menempel pada foto dan tampil tepat di bawahnya saat dicetak. JPG, PNG, WebP; maksimum 20 MB per file.</p></div>
    <div className="capture-grid">{['PRODUCT_VIEW', 'DIMENSION', 'MC', 'GLOSS', 'ISSUE'].map((item) => <button key={item} type="button" onClick={() => quickCapture(item)}><span>＋</span>{sectionLabel(item)}</button>)}</div>
    <div className="upload-tools"><label>Section<select value={section} onChange={(event) => setSection(event.target.value)}>{sections.map((item) => <option value={item} key={item}>{sectionLabel(item)}</option>)}</select></label>{section === 'ISSUE' && (inspection.issues.length === 0 ? <p className="empty-inline">Belum ada issue. <button type="button" className="text-action" onClick={goIssues}>Buat dulu di tab Issues</button></p> : <label>Issue<select value={issueId} onChange={(event) => setIssueId(event.target.value)}><option value="">Belum ditautkan</option>{inspection.issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.defect_type}</option>)}</select></label>)}<button type="button" className="small-action" disabled={section === 'DIMENSION'} onClick={() => { uploadTarget.current = { section, issueId }; input.current?.click() }}>+ Tambah foto</button><button type="button" className="primary-action" disabled={!layouts || !pageableSections.includes(section)} title={!pageableSections.includes(section) ? 'Dimension dan Issue memakai susunan khusus.' : undefined} onClick={openWizard}>＋ Tambah halaman</button></div>
    {(section === 'DIMENSION' || inspection.measurements.some(item => item.category === 'DIMENSION') || inspection.photos.some(photo => photo.section === 'DIMENSION')) && <DimensionPhotos inspection={inspection} run={run} addCustom={goDimensions} askConfirm={askConfirm} />}
    <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={async (event) => {
      const files = event.target.files
      if (files?.length) {
        const target = uploadTarget.current
        await run(() => api.upload(inspection.id, target.section, files, target.issueId || undefined), `${files.length} foto tersimpan.`)
        await refresh()
      }
      event.target.value = ''
    }} aria-label="Unggah atau ambil foto" />
    <input ref={slotFileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={async (event) => {
      const files = event.target.files
      const target = slotUploadTarget.current
      if (files?.length && target) {
        const { page: targetPage, slot: targetSlot } = target
        setSlotUploading(targetSlot)
        try {
          await run(async () => {
            const uploaded = await api.upload(inspection.id, targetPage.section, files)
            const first = uploaded[0]
            if (first) {
              const latest = await api.inspection(inspection.id)
              const newPhotoId = first.id
              const latestPages = latest.photo_pages || photoPages
              const nextPage = latestPages.map(item => item.id === targetPage.id ? {
                ...item,
                photo_ids: item.photo_ids.map((pId, index) => index === targetSlot ? newPhotoId : pId)
              } : item)
              await api.patchInspection(inspection.id, {
                revision: latest.revision,
                photo_pages: nextPage
              })
            }
          }, 'Foto berhasil diunggah dan dimasukkan ke slot.')
          await refresh()
        } finally {
          setSlotUploading(null)
          slotUploadTarget.current = null
        }
      }
      event.target.value = ''
    }} aria-label="Unggah foto langsung ke slot halaman" />
    {!!photoPages.length && <section className="report-pages" aria-label="Susunan halaman foto laporan"><div className="report-pages-heading"><div><span className="section-kicker">SUSUNAN DOCX</span><h3>Halaman foto</h3><p>Foto hanya muncul sekali. Setiap slot mempertahankan rasio gambar dan caption masing-masing.</p></div><button type="button" className="small-action" onClick={openWizard}>＋ Halaman</button></div>
      {photoPages.map((page, index) => { const layout = getLayout(page.template_id); if (!layout) return null; return <article className="report-page-card" key={page.id}>
        <header><div><span className="section-kicker">HALAMAN {index + 1} · {sectionLabel(page.section)}</span><h4>{layout.code} — {layout.title}</h4><p>{page.photo_ids.filter(Boolean).length} dari {layout.photo_count} slot terisi · foto maks {layout.max_photo_height_cm} cm tinggi</p></div><div className="report-page-actions"><button type="button" aria-label={`Pindah halaman ${index + 1} ke atas`} disabled={pageSaving || index === 0} onClick={() => movePage(index, -1)}>↑</button><button type="button" aria-label={`Pindah halaman ${index + 1} ke bawah`} disabled={pageSaving || index === photoPages.length - 1} onClick={() => movePage(index, 1)}>↓</button><button type="button" className="danger-text" disabled={pageSaving} onClick={() => removePage(page)}>Hapus halaman</button></div></header>
        {renderPageSlots(page, layout)}
      </article>})}
    </section>}
    {ordered.length === 0 ? (inspection.photos.length === 0 && <p className="empty-inline">Belum ada foto. Pilih tombol kamera di atas.</p>) : <div className="photo-list">{ordered.map((photo, index) => <article className="photo-card" key={photo.id} draggable onDragStart={() => setDragged(photo.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { const source = ordered.find((item) => item.id === dragged); if (source) void reorder(source, photo); setDragged(null) }}>
      <button type="button" className="photo-thumb" onClick={() => setPreview(photo.id)} aria-label={`Lihat foto ${index + 1} penuh`}><img src={`/api/photos/${photo.id}/file?v=${inspection.revision}`} alt={photo.caption || `Foto ${sectionLabel(photo.section)} ${index + 1}`} loading="lazy" /></button>
      <div className="photo-meta"><span className="section-kicker">{String(index + 1).padStart(2, '0')} / {sectionLabel(photo.section)}</span><label>Caption<input key={`${photo.id}-${photo.caption}`} defaultValue={photo.caption || ''} placeholder="Keterangan foto" onBlur={(event) => { if (event.target.value !== (photo.caption || '')) void run(() => api.patchPhoto(photo.id, { caption: event.target.value }), 'Caption tersimpan.') }} /></label><div className="photo-controls"><select aria-label="Pindah section" disabled={photoPages.some(page => page.photo_ids.includes(photo.id))} title={photoPages.some(page => page.photo_ids.includes(photo.id)) ? 'Lepas foto dari slot halaman terlebih dahulu' : undefined} value={photo.section} onChange={(event) => void run(() => api.patchPhoto(photo.id, { section: event.target.value, issue_id: event.target.value === 'ISSUE' ? photo.issue_id : null, measurement_id: event.target.value === 'DIMENSION' ? photo.measurement_id : null }), 'Section foto diperbarui.')}>{sections.map((item) => <option value={item} key={item}>{sectionLabel(item)}</option>)}</select>{photo.section === 'DIMENSION' && <select aria-label="Tautkan foto ke ukuran" value={photo.measurement_id || ''} onChange={event => void run(() => api.patchPhoto(photo.id, { measurement_id: event.target.value || null, issue_id: null }), 'Foto ditautkan ke ukuran.')}><option value="">Pilih ukuran untuk foto ini</option>{inspection.measurements.filter(item => item.category === 'DIMENSION').map(item => <option key={item.id} value={item.id} disabled={inspection.photos.filter(other => other.measurement_id === item.id).length >= 2}>{item.label}</option>)}</select>}{photo.section === 'ISSUE' && (inspection.issues.length === 0 ? <p className="empty-inline">Belum ada issue. <button type="button" className="text-action" onClick={goIssues}>Buat dulu di tab Issues</button></p> : <select aria-label="Tautkan issue" value={photo.issue_id || ''} onChange={(event) => void run(() => api.patchPhoto(photo.id, { issue_id: event.target.value || null }), 'Tautan issue diperbarui.') }><option value="">Issue belum dipilih</option>{inspection.issues.map((item) => <option key={item.id} value={item.id}>{item.defect_type}</option>)}</select>)}</div><div className="photo-controls"><button type="button" disabled={index === 0} onClick={() => void reorder(photo, ordered[index - 1]!)}>↑</button><button type="button" disabled={index === ordered.length - 1} onClick={() => void reorder(photo, ordered[index + 1]!)}>↓</button><button type="button" onClick={() => void run(() => api.patchPhoto(photo.id, { rotate_degrees: 90 }), 'Foto diputar.')}>Putar</button><button type="button" className="danger-text" onClick={() => {
        askConfirm({
          title: 'Hapus Foto?',
          message: 'Apakah Anda yakin ingin menghapus foto ini dari sistem? Foto akan dihapus permanen dari galeri dan laporan.',
          confirmText: 'Hapus Foto',
          onConfirm: () => void run(() => api.deletePhoto(photo.id), 'Foto dihapus.')
        })
      }}>Hapus</button></div></div>
    </article>)}</div>}
    {wizardOpen && <div className="layout-wizard-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setWizardOpen(false) }}><section className="layout-wizard" role="dialog" aria-modal="true" aria-labelledby="layout-wizard-title">
      <header className="layout-wizard-top"><span>LANGKAH {wizardStep === 'layout' ? '1' : '2'} DARI 2 · {wizardStep === 'layout' ? 'PILIH TATA LETAK' : 'ISI SLOT FOTO'}</span><button type="button" aria-label="Tutup pemilih layout" onClick={() => setWizardOpen(false)}>×</button></header>
      <div className="layout-wizard-body"><h2 id="layout-wizard-title">{wizardStep === 'layout' ? 'Pilih template halaman foto' : 'Sesuaikan foto dan caption'}</h2><p>{wizardStep === 'layout' ? 'Pilih jumlah foto untuk satu halaman. Foto tetap maksimal dua kolom; semakin sedikit slot, ukuran cetaknya semakin besar.' : 'Pilih foto yang sudah diunggah atau klik langsung kotak slot untuk unggah foto baru. Caption otomatis mengikuti foto dan dapat diedit di galeri.'}</p>
        {wizardStep === 'layout' ? <>
          <label className="layout-section-select">Section halaman<select value={wizardSection} onChange={event => { setWizardSection(event.target.value); setTemplateId(null) }}>{pageableSections.map(item => <option key={item} value={item}>{sectionLabel(item)}</option>)}</select></label>
          <div className="layout-category-tabs" role="tablist" aria-label="Kategori layout">{categoryOptions.map(item => <button type="button" role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="layout-template-grid">{visibleLayouts.map(layout => <button type="button" className={`layout-template-card${templateId === layout.id ? ' selected' : ''}`} key={layout.id} aria-pressed={templateId === layout.id} onClick={() => setTemplateId(layout.id)}>
            <strong>{layout.code} · {layout.title}</strong><span className="layout-template-preview" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, 1fr)` }}>{Array.from({ length: layout.photo_count }, (_, slot) => <i key={slot} />)}</span><span>{layout.description}</span><small>Area tabel 18 cm · foto maks. {layout.max_photo_height_cm} cm tinggi</small>
          </button>)}</div>
          {!visibleLayouts.length && <p className="empty-inline">Belum ada template untuk section ini.</p>}
        </> : (() => { const page = photoPages.find(item => item.id === activePageId); const layout = page ? getLayout(page.template_id) : undefined; return page && layout ? <>{renderPageSlots(page, layout, true)}<p className="layout-print-note">Saat dicetak: tabel selebar area isi Word, rata tengah, maksimal dua kolom, dan foto tidak dipotong.</p></> : <p role="alert">Halaman tidak ditemukan. Tutup lalu buka kembali pemilih layout.</p> })()}
      </div>
      <footer className="layout-wizard-footer"><span>{wizardStep === 'layout' ? `Section: ${sectionLabel(wizardSection)}` : `${photoPages.find(item => item.id === activePageId)?.photo_ids.filter(Boolean).length || 0} slot terisi`}</span><div>{wizardStep === 'slots' && <button type="button" className="small-action" disabled={pageSaving} onClick={() => setWizardStep('layout')}>Kembali</button>}{wizardStep === 'layout' ? <button type="button" className="primary-action" disabled={!templateId || pageSaving} onClick={() => void continueToSlots()}>{pageSaving ? 'Menyimpan…' : 'Lanjutkan'}</button> : <button type="button" className="primary-action" onClick={() => setWizardOpen(false)}>Selesai</button>}</div></footer>
    </section></div>}
    {preview && <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Foto penuh" onClick={() => setPreview(null)}><button type="button" onClick={() => setPreview(null)}>Tutup ×</button><img src={`/api/photos/${preview}/file?v=${inspection.revision}`} alt="Foto penuh" /></div>}
  </div>
}

function ReadingEntry({ measurement, run, askConfirm }: { measurement: Measurement; run: Action; askConfirm?: (options: ConfirmOptions) => void }) {
  const [value, setValue] = useState('')
  function handleDelete(readingValue: number, readingId: string) {
    const doDelete = () => void run(() => api.deleteReading(readingId), 'Reading dihapus.')
    if (askConfirm) {
      askConfirm({
        title: 'Hapus Nilai Reading?',
        message: `Apakah Anda yakin ingin menghapus reading ${readingValue}?`,
        confirmText: 'Hapus Reading',
        onConfirm: doDelete
      })
    } else {
      doDelete()
    }
  }
  return <div className="reading-entry"><div className="reading-list">{measurement.readings.length ? measurement.readings.map((reading) => <span key={reading.id}>{reading.value}<button type="button" aria-label={`Hapus reading ${reading.value}`} onClick={() => handleDelete(reading.value, reading.id)}>×</button></span>) : 'Belum ada reading'}</div><form onSubmit={(event) => { event.preventDefault(); if (!value) return; void run(() => api.addReading(measurement.id, Number(value)), 'Reading tersimpan.').then((saved) => { if (saved) setValue('') }) }}><input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Reading ${measurement.label}`} placeholder={`Tambah reading ${measurement.unit || ''}`} /><button type="submit" disabled={!value}>+ Reading</button></form></div>
}

function Measurements({ inspection, run, tests, askConfirm }: { inspection: Inspection; run: Action; tests: boolean; askConfirm?: (options: ConfirmOptions) => void }) {
  const [category, setCategory] = useState(tests ? 'MC' : 'DIMENSION')
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState(tests ? '%' : 'mm')
  const [standard, setStandard] = useState('')
  const [plus, setPlus] = useState('')
  const [minus, setMinus] = useState('')
  const [notes, setNotes] = useState('')
  const records = inspection.measurements.filter((item) => tests ? ['MC', 'GLOSS'].includes(item.category) : !['MC', 'GLOSS'].includes(item.category))
  function handleDelete(item: Measurement) {
    const doDelete = () => void run(() => api.deleteMeasurement(item.id), 'Pengukuran dihapus.')
    if (askConfirm) {
      askConfirm({
        title: `Hapus Pengukuran ${item.label}?`,
        message: `Apakah Anda yakin ingin menghapus pengukuran ${item.label}?${item.category === 'DIMENSION' ? ' Foto ukuran tetap disimpan di bagian Product View.' : ''}`,
        confirmText: 'Hapus Pengukuran',
        onConfirm: doDelete
      })
    } else {
      doDelete()
    }
  }
  return <div className="field-card"><div className="field-card-heading"><div><span className="section-kicker">{tests ? '04 / TESTS' : '03 / MEASUREMENT'}</span><h2>{tests ? 'MC & Gloss' : 'Ukuran produk'}</h2></div><p>Standar dan hasil aktual berbeda. Tanpa toleransi lengkap, hasil tetap INFO.</p></div>
    <form className="measurement-form" onSubmit={(event) => {
      event.preventDefault()
      const body: Record<string, unknown> = { category, label, unit, notes, sort_order: inspection.measurements.length }
      if (value) body.value = Number(value)
      if (standard) body.standard_value = Number(standard)
      if (plus) body.tolerance_plus = Number(plus)
      if (minus) body.tolerance_minus = Number(minus)
      void run(() => api.addMeasurement(inspection.id, body), 'Pengukuran tersimpan.').then((saved) => { if (saved) { setLabel(''); setValue(''); setNotes('') } })
    }}><div className="form-grid"><label>Kategori<select value={category} onChange={(event) => { setCategory(event.target.value); setUnit(event.target.value === 'MC' ? '%' : event.target.value === 'GLOSS' ? 'GU' : 'mm') }}>{(tests ? ['MC', 'GLOSS'] : ['DIMENSION', 'GAP', 'RADIUS', 'OTHER']).map((item) => <option key={item}>{item}</option>)}</select></label><label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} required list={category === 'DIMENSION' ? 'dimension-labels' : undefined} placeholder={tests ? 'Moisture Content' : 'Length / Width / Depth / Height'} /></label><datalist id="dimension-labels">{['Length', 'Width', 'Depth', 'Height'].map(name => <option key={name} value={name} />)}</datalist><label>Aktual (opsional)<input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} /></label><label>Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="mm / % / GU" /></label><label>Standar (opsional)<input type="number" step="any" value={standard} onChange={(event) => setStandard(event.target.value)} /></label><label>Toleransi +<input type="number" step="any" min="0" value={plus} onChange={(event) => setPlus(event.target.value)} /></label><label>Toleransi −<input type="number" step="any" min="0" value={minus} onChange={(event) => setMinus(event.target.value)} /></label><label className="span-2">Catatan<input value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><button className="primary-action" type="submit">+ Simpan {tests ? 'test' : 'pengukuran'}</button></form>
    <div className="record-list">{records.map((item) => <article className="record-card" key={item.id}><div className="record-head"><div><span className="section-kicker">{item.category}</span><h3>{item.label}</h3></div><strong className={`result-pill ${item.result.toLowerCase()}`}>{item.result}</strong></div><p>Aktual: {item.value_min !== null ? `${item.value_min}–${item.value_max} ${item.unit || ''}` : item.value !== null ? `${item.value} ${item.unit || ''}` : 'Reading belum ada'} · Standar: {item.standard_value ?? '—'}</p>{item.notes && <p>{item.notes}</p>}{item.category === 'DIMENSION' && <DimensionPair inspection={inspection} measurement={item} run={run} askConfirm={askConfirm} />}{tests && <ReadingEntry measurement={item} run={run} askConfirm={askConfirm} />}<button type="button" className="danger-text" onClick={() => handleDelete(item)}>Hapus</button></article>)}{records.length === 0 && <p className="empty-inline">Belum ada {tests ? 'test' : 'pengukuran'}.</p>}</div>
  </div>
}

function IssueCard({ issue, defects, photos, run, capture, onPendingChange, askConfirm }: { issue: Issue; defects: Defect[]; photos: Photo[]; run: Action; capture: (id: string) => void; onPendingChange: (pending: boolean) => void; askConfirm?: (options: ConfirmOptions) => void }) {
  const initial = { defect_type: issue.defect_type, quantity: issue.quantity?.toString() || '', description: issue.description || '', cause: issue.cause || '', repair: issue.repair || '', cap: issue.cap || '', status: issue.status }
  const { draft, dirty, saving, saveFailed, update: updateDraft, discard, retry } = useAutosave(initial,
    (draft) => run(() => api.patchIssue(issue.id, { ...draft, quantity: draft.quantity ? Number(draft.quantity) : null }), 'Issue tersimpan otomatis.'), onPendingChange)
  const preset = defects.find((item) => item.name.toLowerCase() === draft.defect_type.toLowerCase() || item.aliases.some((alias) => alias.toLowerCase() === draft.defect_type.toLowerCase()))
  function update(key: keyof typeof draft, value: string) { updateDraft({ ...draft, [key]: value }) }
  const count = photos.filter((photo) => photo.issue_id === issue.id).length
  function handleDelete() {
    const doDelete = () => void run(() => api.deleteIssue(issue.id), 'Issue dihapus.')
    if (askConfirm) {
      askConfirm({
        title: `Hapus Temuan Cacat ${issue.defect_type}?`,
        message: `Apakah Anda yakin ingin menghapus temuan cacat "${issue.defect_type}"? Foto terkait akan dilepas dari issue ini.`,
        confirmText: 'Hapus Issue',
        onConfirm: doDelete
      })
    } else {
      doDelete()
    }
  }
  return <article className="issue-card"><div className="record-head"><div><span className="section-kicker">ISSUE · {count} FOTO</span><h3>{issue.defect_type}</h3></div><button type="button" className="small-action" disabled={dirty} onClick={() => capture(issue.id)}>+ Foto issue</button></div><div className="form-grid"><label>Defect<input value={draft.defect_type} onChange={(event) => update('defect_type', event.target.value)} /></label><label>Jumlah pcs<input type="number" min="1" value={draft.quantity} onChange={(event) => update('quantity', event.target.value)} /></label><label>Status<select value={draft.status} onChange={(event) => update('status', event.target.value)}><option>OPEN</option><option>REPAIRED</option><option>ACCEPTED</option></select></label><label className="span-2">Deskripsi<textarea value={draft.description} onChange={(event) => update('description', event.target.value)} /></label>{(['cause', 'repair', 'cap'] as const).map((field) => <div className="issue-field span-2" key={field}><label>{field.toUpperCase()}<textarea value={draft[field]} onChange={(event) => update(field, event.target.value)} placeholder={`Isi ${field} berdasarkan pemeriksaan QC`} /></label>{preset && <div className="preset-suggestion"><span>PRESET REFERENSI · PERLU QC SETUJUI</span><p>{(field === 'cause' ? preset.default_causes : field === 'repair' ? preset.default_repairs : preset.default_cap)[0] || 'Tidak ada preset'}</p><button type="button" onClick={() => update(field, (field === 'cause' ? preset.default_causes : field === 'repair' ? preset.default_repairs : preset.default_cap)[0] || '')}>Gunakan teks ini</button></div>}</div>)}</div>{saveFailed && <div className="save-recovery" role="alert">Penyimpanan issue gagal. Perbaiki isian lalu coba lagi.<button type="button" disabled={saving} onClick={retry}>Coba simpan</button><button type="button" disabled={saving} onClick={() => discard(initial)}>Batalkan perubahan</button></div>}<button type="button" className="danger-text" disabled={dirty} onClick={handleDelete}>Hapus issue</button></article>
}

function Issues({ inspection, defects, run, capture, onPendingChange, askConfirm }: { inspection: Inspection; defects: Defect[]; run: Action; capture: (id: string) => void; onPendingChange: (scope: string, pending: boolean) => void; askConfirm?: (options: ConfirmOptions) => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  return <div className="field-card"><div className="field-card-heading"><div><span className="section-kicker">05 / ISSUES</span><h2>Temuan QC</h2></div><p>Preset hanya saran teks. QC tetap memeriksa Cause, Repair dan CAP.</p></div><form className="new-issue" onSubmit={(event) => { event.preventDefault(); void run(() => api.issues(inspection.id, { defect_type: name, quantity: quantity ? Number(quantity) : null, sort_order: inspection.issues.length }), 'Issue baru tersimpan.').then((saved) => { if (saved) { setName(''); setQuantity('') } }) }}><label>Jenis defect<input list="defect-options" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Gap, Scratch, atau defect baru" /><datalist id="defect-options">{defects.map((defect) => <option key={defect.id} value={defect.name} />)}</datalist></label><label>Jumlah pcs<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Opsional" /></label><button type="submit" className="primary-action" disabled={!name.trim()}>+ Buat issue</button></form><div className="record-list">{inspection.issues.map((issue) => <IssueCard key={issue.id} issue={issue} defects={defects} photos={inspection.photos} run={run} capture={capture} onPendingChange={(pending) => onPendingChange(issue.id, pending)} askConfirm={askConfirm} />)}{inspection.issues.length === 0 && <p className="empty-inline">Belum ada issue. Tambahkan bila ditemukan; tidak perlu membuat issue fiktif.</p>}</div></div>
}

function ReviewPanel({ inspection, run, onPendingChange }: { inspection: Inspection; run: Action; onPendingChange: (scope: string, pending: boolean) => void }) {
  const [review, setReview] = useState<Review | null>(null)
  const [validationBusy, setValidationBusy] = useState(true)
  const [reportBusy, setReportBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [selectedPage, setSelectedPage] = useState(0)
  const [message, setMessage] = useState('')
  useEffect(() => {
    onPendingChange('report', reportBusy || previewBusy)
    return () => onPendingChange('report', false)
  }, [reportBusy, previewBusy, onPendingChange])
  useEffect(() => {
    let active = true
    setValidationBusy(true)
    setReview(null)
    setPreview(null)
    setSelectedPage(0)
    setMessage('Memeriksa inspeksi…')
    api.validate(inspection.id)
      .then((result) => { if (active) setReview(result) })
      .catch((cause) => { if (active) setMessage(`Pemeriksaan gagal: ${String(cause)}. Coba periksa ulang.`) })
      .finally(() => { if (active) setValidationBusy(false) })
    return () => { active = false }
  }, [inspection.id, inspection.revision])
  async function revalidate() {
    setValidationBusy(true)
    setReview(null)
    setPreview(null)
    setSelectedPage(0)
    setMessage('Memeriksa inspeksi…')
    try {
      setReview(await api.validate(inspection.id))
      setMessage('Pemeriksaan selesai.')
    } catch (cause) {
      setMessage(`Pemeriksaan gagal: ${String(cause)}. Coba periksa ulang.`)
    } finally {
      setValidationBusy(false)
    }
  }
  async function showPreview() {
    setPreviewBusy(true)
    setMessage(isAndroidApp() ? 'Menyiapkan DOCX untuk dibuka…' : 'Merender halaman Word…')
    try {
      if (isAndroidApp()) {
        await api.openAndroidReport(inspection.id)
        setMessage('DOCX dibuka di aplikasi dokumen. Periksa halaman sebelum membagikannya.')
        return
      }
      const result = await api.previewReport(inspection.id)
      setPreview(result)
      setSelectedPage(0)
      setMessage(`${result.page_count} halaman siap diperiksa.`)
    } catch (cause) {
      const detail = String(cause)
      setMessage(detail.includes('Word') ? `${detail} DOCX tetap bisa dibuat tanpa Word.` : detail)
    } finally {
      setPreviewBusy(false)
    }
  }
  const ready = Boolean(review && review.errors.length === 0)
  return <div className="field-card">
    <div className="field-card-heading"><div><span className="section-kicker">06 / REVIEW & REPORT</span><h2>Periksa sebelum Word</h2></div><p>Warning boleh disadari QC; error harus diperbaiki dahulu.</p></div>
    <div className="review-grid"><div><span>HEADER</span><strong>{inspection.customer_name} · {inspection.product_name}</strong><small>PO {inspection.po} · QTY {inspection.quantity} · AQL {inspection.aql || '—'}</small></div><div><span>FOTO</span><strong>{inspection.photos.length} foto</strong><small>Product View {review?.photo_counts.PRODUCT_VIEW || 0} · Issue {review?.photo_counts.ISSUE || 0}</small></div><div><span>MEASUREMENT</span><strong>{inspection.measurements.length} record</strong><small>MC {inspection.measurements.filter((item) => item.category === 'MC').length} · Gloss {inspection.measurements.filter((item) => item.category === 'GLOSS').length}</small></div><div><span>ISSUES</span><strong>{inspection.issues.length} issue</strong><small>Cause / Repair / CAP perlu dicek QC</small></div></div>
    {review && <><div className="validation-block errors"><strong>ERROR · {review.errors.length}</strong>{review.errors.length ? <ul>{review.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <p>Tidak ada error.</p>}</div><div className="validation-block warnings"><strong>WARNING · {review.warnings.length}</strong>{review.warnings.length ? <ul>{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>Tidak ada warning.</p>}</div></>}
    {message && <p role="status">{message}</p>}
    <div className="report-actions">
      <button type="button" className="small-action" disabled={validationBusy || previewBusy || reportBusy} onClick={() => void revalidate()}>{validationBusy ? 'Memeriksa…' : 'Periksa ulang'}</button>
      <button type="button" className="small-action" disabled={validationBusy || reportBusy || !ready || previewBusy} onClick={() => void showPreview()}>{previewBusy ? 'Menyiapkan…' : isAndroidApp() ? 'Buka DOCX di Word/WPS' : preview ? 'Perbarui preview' : 'Preview tiap halaman'}</button>
      <button type="button" className="primary-action" disabled={validationBusy || previewBusy || reportBusy || !ready} onClick={async () => { setReportBusy(true); setMessage('Membuat DOCX…'); try { const result = await api.downloadReport(inspection.id); setMessage(result === 'saved' ? 'DOCX tersimpan dan terverifikasi.' : result === 'cancelled' ? 'Penyimpanan DOCX dibatalkan.' : isDesktopView ? 'Dialog simpan DOCX dibuka. Pilih lokasi di Windows.' : 'Unduhan DOCX dimulai.') } catch (cause) { const detail = String(cause); setMessage(isDesktopView ? `${detail} Jika dialog simpan tidak muncul di jendela Inspectra, ulangi dengan mode browser (--browser).` : detail) } finally { setReportBusy(false) } }}>{reportBusy ? isAndroidApp() ? 'Menunggu Android…' : 'Membuat…' : isAndroidApp() ? 'Simpan DOCX' : 'Unduh DOCX'}</button>
    </div>
    {preview && <section className="report-preview" aria-label="Preview laporan per halaman">
      <div className="report-preview-heading"><strong>Halaman {selectedPage + 1} dari {preview.page_count}</strong><span>Hasil render Microsoft Word</span></div>
      <div className="report-preview-viewer"><button type="button" aria-label="Halaman sebelumnya" disabled={selectedPage === 0} onClick={() => setSelectedPage((value) => value - 1)}>‹</button><img src={preview.pages[selectedPage]} alt={`Preview halaman ${selectedPage + 1} dari ${preview.page_count}`} /><button type="button" aria-label="Halaman berikutnya" disabled={selectedPage === preview.page_count - 1} onClick={() => setSelectedPage((value) => value + 1)}>›</button></div>
      <div className="report-preview-pages">{preview.pages.map((url, index) => <button type="button" key={url} className={selectedPage === index ? 'active' : ''} aria-label={`Lihat halaman ${index + 1}`} aria-current={selectedPage === index ? 'page' : undefined} onClick={() => setSelectedPage(index)}><img src={url} alt="" loading="lazy" /><span>{index + 1}</span></button>)}</div>
    </section>}
    {inspection.status !== 'COMPLETED' && <button type="button" className="small-action" disabled={validationBusy || previewBusy || reportBusy} onClick={() => void run(() => api.patchInspection(inspection.id, { revision: inspection.revision, status: 'COMPLETED' }), 'Inspeksi ditandai selesai.')}>Tandai inspeksi selesai</button>}
  </div>
}

export default function Workspace({ inspection, defects, run, refresh, onDelete, initialTab = 'overview', onPendingChange, busy }: {
  inspection: Inspection; defects: Defect[]; run: Action;
  refresh: () => Promise<void>; onDelete: () => Promise<void>; initialTab?: Tab;
  onPendingChange: (scope: string, pending: boolean) => void; busy: boolean
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [captureIssue, setCaptureIssue] = useState<string | null>(null)
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null)
  const askConfirm = useCallback((opts: ConfirmOptions) => setConfirmOptions(opts), [])
  const overviewPending = useCallback((pending: boolean) => onPendingChange('overview', pending), [onPendingChange])
  const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'photos', label: 'Photos' }, { id: 'measurements', label: 'Measurement' }, { id: 'tests', label: 'Tests' }, { id: 'issues', label: 'Issues' }, { id: 'review', label: 'Review & Report' }]
  return <section className="workspace"><div className="workspace-tabs" role="tablist" aria-label="Bagian inspeksi">{tabs.map((item, index) => <button type="button" key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} disabled={busy} onClick={() => setTab(item.id)}><span className="step-number">{index + 1}</span>{item.label}</button>)}</div>
    {tab === 'overview' && <Overview inspection={inspection} run={run} onPendingChange={overviewPending} />}
    {tab === 'photos' && <Photos inspection={inspection} run={run} captureIssue={captureIssue} refresh={refresh} goIssues={() => setTab('issues')} goDimensions={() => setTab('measurements')} askConfirm={askConfirm} />}
    {tab === 'measurements' && <Measurements inspection={inspection} run={run} tests={false} askConfirm={askConfirm} />}
    {tab === 'tests' && <Measurements inspection={inspection} run={run} tests askConfirm={askConfirm} />}
    {tab === 'issues' && <Issues inspection={inspection} defects={defects} run={run} capture={(issueId) => { setCaptureIssue(issueId); setTab('photos') }} onPendingChange={onPendingChange} askConfirm={askConfirm} />}
    {tab === 'review' && <ReviewPanel key={`${inspection.id}:${inspection.revision}`} inspection={inspection} run={run} onPendingChange={onPendingChange} />}
    <div className="workspace-bottom"><button type="button" className="small-action" disabled={busy} onClick={() => void refresh()}>Muat ulang data</button><button type="button" className="danger-text" disabled={busy} onClick={() => {
      askConfirm({
        title: `Hapus Inspeksi ${inspection.inspection_number}?`,
        message: `Apakah Anda yakin ingin menghapus inspeksi ${inspection.inspection_number} beserta seluruh foto dan hasil laporan? Tindakan ini tidak dapat dibatalkan.`,
        confirmText: 'Hapus Inspeksi Permanen',
        onConfirm: () => void onDelete()
      })
    }}>Hapus inspeksi</button></div>
    <ConfirmModal options={confirmOptions} onClose={() => setConfirmOptions(null)} />
  </section>
}
