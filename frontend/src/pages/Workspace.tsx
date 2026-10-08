import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import type { Defect, Inspection, Issue, Measurement, Photo, ReportPreview, Review } from '../types/qc'

type Action = (task: () => Promise<unknown>, message?: string) => Promise<boolean>
export type Tab = 'overview' | 'photos' | 'measurements' | 'tests' | 'issues' | 'review'
const sections = ['PRODUCT_VIEW', 'PRODUCT_DETAIL', 'DRAWING', 'DIMENSION', 'MC', 'GLOSS', 'SWATCH', 'ISSUE', 'OTHER']
const sectionLabel = (section: string) => section.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
const axes = ['L', 'W', 'D', 'H']

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
  const [draft, setDraft] = useState(() => initialDraft(inspection))
  const [dirty, setDirty] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  useEffect(() => { setDraft(initialDraft(inspection)); setDirty(false); setSaveFailed(false) }, [inspection.id])
  useEffect(() => {
    if (!dirty || saveFailed) return
    const timer = window.setTimeout(() => {
      const product_dimensions = Object.fromEntries(axes.filter((axis) => draft[`dim_${axis}`] !== '').map((axis) => [axis, Number(draft[`dim_${axis}`])]))
      const box_dimensions = Object.fromEntries(axes.filter((axis) => draft[`box_${axis}`] !== '').map((axis) => [axis, Number(draft[`box_${axis}`])]))
      const patch = {
        revision: inspection.revision, po: draft.po, inspection_type: draft.inspection_type,
        date: draft.date, location: draft.location || null, qc_name: draft.qc_name,
        quantity: Number(draft.quantity), aql: draft.aql || null,
        inspected_quantity: draft.inspected_quantity === '' ? null : Number(draft.inspected_quantity),
        product_dimensions, box_dimensions, status: draft.status,
        conclusion: draft.conclusion || null, communication_status: draft.communication_status || null,
      }
      setDirty(false)
      void run(() => api.patchInspection(inspection.id, patch), 'Perubahan inspeksi tersimpan otomatis.').then((saved) => { if (!saved) { setDirty(true); setSaveFailed(true); onPendingChange(true) } })
    }, 850)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, inspection.id, inspection.revision, run, saveFailed, onPendingChange])
  function update(key: string, value: string) { setDraft((current) => ({ ...current, [key]: value })); setDirty(true); setSaveFailed(false); onPendingChange(true) }
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
    {saveFailed && <div className="save-recovery" role="alert">Penyimpanan gagal. Perbaiki isian lalu coba lagi.<button type="button" onClick={() => setSaveFailed(false)}>Coba simpan</button><button type="button" onClick={() => { setDraft(initialDraft(inspection)); setDirty(false); setSaveFailed(false); onPendingChange(false) }}>Batalkan perubahan</button></div>}
  </div>
}

function Photos({ inspection, run, captureIssue, refresh }: { inspection: Inspection; run: Action; captureIssue: string | null; refresh: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<{ section: string; issueId: string }>({ section: captureIssue ? 'ISSUE' : 'PRODUCT_VIEW', issueId: captureIssue || '' })
  const [section, setSection] = useState(captureIssue ? 'ISSUE' : 'PRODUCT_VIEW')
  const [issueId, setIssueId] = useState(captureIssue || '')
  const [preview, setPreview] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  useEffect(() => { if (captureIssue) { setSection('ISSUE'); setIssueId(captureIssue) } }, [captureIssue])
  const ordered = [...inspection.photos].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
  function quickCapture(nextSection: string) { setSection(nextSection); if (nextSection !== 'ISSUE') setIssueId(''); uploadTarget.current = { section: nextSection, issueId: nextSection === 'ISSUE' ? issueId : '' }; input.current?.click() }
  async function reorder(source: Photo, target: Photo) {
    if (source.id === target.id) return
    await run(async () => {
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
    await refresh()
  }
  return <div className="field-card"><div className="field-card-heading"><div><span className="section-kicker">02 / PHOTOS</span><h2>Foto inspeksi</h2></div><p>Caption tampil di tengah bawah satu foto atau sepasang foto pada laporan Word. JPG, PNG, WebP; maksimum 20 MB per file.</p></div>
    <div className="capture-grid">{['PRODUCT_VIEW', 'DIMENSION', 'MC', 'GLOSS', 'ISSUE'].map((item) => <button key={item} type="button" onClick={() => quickCapture(item)}><span>＋</span>{sectionLabel(item)}</button>)}</div>
    <div className="upload-tools"><label>Section<select value={section} onChange={(event) => setSection(event.target.value)}>{sections.map((item) => <option value={item} key={item}>{sectionLabel(item)}</option>)}</select></label>{section === 'ISSUE' && <label>Issue<select value={issueId} onChange={(event) => setIssueId(event.target.value)}><option value="">Belum ditautkan</option>{inspection.issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.defect_type}</option>)}</select></label>}<button type="button" className="small-action" onClick={() => { uploadTarget.current = { section, issueId }; input.current?.click() }}>+ Tambah foto</button></div>
    <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => {
      const files = event.target.files
      if (files?.length) { const target = uploadTarget.current; void run(() => api.upload(inspection.id, target.section, files, target.issueId || undefined), `${files.length} foto tersimpan.`) }
      event.target.value = ''
    }} aria-label="Unggah atau ambil foto" />
    {ordered.length === 0 ? <p className="empty-inline">Belum ada foto. Pilih tombol kamera di atas.</p> : <div className="photo-list">{ordered.map((photo, index) => <article className="photo-card" key={photo.id} draggable onDragStart={() => setDragged(photo.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { const source = ordered.find((item) => item.id === dragged); if (source) void reorder(source, photo); setDragged(null) }}>
      <button type="button" className="photo-thumb" onClick={() => setPreview(photo.id)} aria-label={`Lihat foto ${index + 1} penuh`}><img src={`/api/photos/${photo.id}/file?v=${inspection.revision}`} alt={photo.caption || `Foto ${sectionLabel(photo.section)} ${index + 1}`} loading="lazy" /></button>
      <div className="photo-meta"><span className="section-kicker">{String(index + 1).padStart(2, '0')} / {sectionLabel(photo.section)}</span><label>Caption<input key={`${photo.id}-${photo.caption}`} defaultValue={photo.caption || ''} placeholder="Keterangan foto" onBlur={(event) => { if (event.target.value !== (photo.caption || '')) void run(() => api.patchPhoto(photo.id, { caption: event.target.value }), 'Caption tersimpan.') }} /></label><div className="photo-controls"><select aria-label="Pindah section" value={photo.section} onChange={(event) => void run(() => api.patchPhoto(photo.id, { section: event.target.value, issue_id: event.target.value === 'ISSUE' ? photo.issue_id : null }), 'Section foto diperbarui.')}>{sections.map((item) => <option value={item} key={item}>{sectionLabel(item)}</option>)}</select>{photo.section === 'ISSUE' && <select aria-label="Tautkan issue" value={photo.issue_id || ''} onChange={(event) => void run(() => api.patchPhoto(photo.id, { issue_id: event.target.value || null }), 'Tautan issue diperbarui.')}><option value="">Issue belum dipilih</option>{inspection.issues.map((item) => <option key={item.id} value={item.id}>{item.defect_type}</option>)}</select>}</div><div className="photo-controls"><button type="button" disabled={index === 0} onClick={() => void reorder(photo, ordered[index - 1]!)}>↑</button><button type="button" disabled={index === ordered.length - 1} onClick={() => void reorder(photo, ordered[index + 1]!)}>↓</button><button type="button" onClick={() => void run(() => api.patchPhoto(photo.id, { rotate_degrees: 90 }), 'Foto diputar.')}>Putar</button><button type="button" className="danger-text" onClick={() => { if (window.confirm('Hapus foto ini?')) void run(() => api.deletePhoto(photo.id), 'Foto dihapus.') }}>Hapus</button></div></div>
    </article>)}</div>}
    {preview && <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Foto penuh" onClick={() => setPreview(null)}><button type="button" onClick={() => setPreview(null)}>Tutup ×</button><img src={`/api/photos/${preview}/file?v=${inspection.revision}`} alt="Foto penuh" /></div>}
  </div>
}

function ReadingEntry({ measurement, run }: { measurement: Measurement; run: Action }) {
  const [value, setValue] = useState('')
  return <div className="reading-entry"><div className="reading-list">{measurement.readings.length ? measurement.readings.map((reading) => <span key={reading.id}>{reading.value}<button type="button" aria-label={`Hapus reading ${reading.value}`} onClick={() => { if (window.confirm('Hapus reading ini?')) void run(() => api.deleteReading(reading.id), 'Reading dihapus.') }}>×</button></span>) : 'Belum ada reading'}</div><form onSubmit={(event) => { event.preventDefault(); if (!value) return; void run(() => api.addReading(measurement.id, Number(value)), 'Reading tersimpan.').then((saved) => { if (saved) setValue('') }) }}><input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Reading ${measurement.label}`} placeholder={`Tambah reading ${measurement.unit || ''}`} /><button type="submit" disabled={!value}>+ Reading</button></form></div>
}

function Measurements({ inspection, run, tests }: { inspection: Inspection; run: Action; tests: boolean }) {
  const [category, setCategory] = useState(tests ? 'MC' : 'DIMENSION')
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState(tests ? '%' : 'mm')
  const [standard, setStandard] = useState('')
  const [plus, setPlus] = useState('')
  const [minus, setMinus] = useState('')
  const [notes, setNotes] = useState('')
  const records = inspection.measurements.filter((item) => tests ? ['MC', 'GLOSS'].includes(item.category) : !['MC', 'GLOSS'].includes(item.category))
  return <div className="field-card"><div className="field-card-heading"><div><span className="section-kicker">{tests ? '04 / TESTS' : '03 / MEASUREMENT'}</span><h2>{tests ? 'MC & Gloss' : 'Ukuran produk'}</h2></div><p>Standar dan hasil aktual berbeda. Tanpa toleransi lengkap, hasil tetap INFO.</p></div>
    <form className="measurement-form" onSubmit={(event) => {
      event.preventDefault()
      const body: Record<string, unknown> = { category, label, unit, notes, sort_order: inspection.measurements.length }
      if (value) body.value = Number(value)
      if (standard) body.standard_value = Number(standard)
      if (plus) body.tolerance_plus = Number(plus)
      if (minus) body.tolerance_minus = Number(minus)
      void run(() => api.addMeasurement(inspection.id, body), 'Pengukuran tersimpan.').then((saved) => { if (saved) { setLabel(''); setValue(''); setNotes('') } })
    }}><div className="form-grid"><label>Kategori<select value={category} onChange={(event) => { setCategory(event.target.value); setUnit(event.target.value === 'MC' ? '%' : event.target.value === 'GLOSS' ? 'GU' : 'mm') }}>{(tests ? ['MC', 'GLOSS'] : ['DIMENSION', 'GAP', 'RADIUS', 'OTHER']).map((item) => <option key={item}>{item}</option>)}</select></label><label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} required placeholder={tests ? 'Moisture Content' : 'Height with glide'} /></label><label>Aktual (opsional)<input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} /></label><label>Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="mm / % / GU" /></label><label>Standar (opsional)<input type="number" step="any" value={standard} onChange={(event) => setStandard(event.target.value)} /></label><label>Toleransi +<input type="number" step="any" min="0" value={plus} onChange={(event) => setPlus(event.target.value)} /></label><label>Toleransi −<input type="number" step="any" min="0" value={minus} onChange={(event) => setMinus(event.target.value)} /></label><label className="span-2">Catatan<input value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><button className="primary-action" type="submit">+ Simpan {tests ? 'test' : 'pengukuran'}</button></form>
    <div className="record-list">{records.map((item) => <article className="record-card" key={item.id}><div className="record-head"><div><span className="section-kicker">{item.category}</span><h3>{item.label}</h3></div><strong className={`result-pill ${item.result.toLowerCase()}`}>{item.result}</strong></div><p>Aktual: {item.value_min !== null ? `${item.value_min}–${item.value_max} ${item.unit || ''}` : item.value !== null ? `${item.value} ${item.unit || ''}` : 'Reading belum ada'} · Standar: {item.standard_value ?? '—'}</p>{item.notes && <p>{item.notes}</p>}{tests && <ReadingEntry measurement={item} run={run} />}<button type="button" className="danger-text" onClick={() => { if (window.confirm(`Hapus ${item.label}?`)) void run(() => api.deleteMeasurement(item.id), 'Pengukuran dihapus.') }}>Hapus</button></article>)}{records.length === 0 && <p className="empty-inline">Belum ada {tests ? 'test' : 'pengukuran'}.</p>}</div>
  </div>
}

function IssueCard({ issue, defects, photos, run, capture, onPendingChange }: { issue: Issue; defects: Defect[]; photos: Photo[]; run: Action; capture: (id: string) => void; onPendingChange: (pending: boolean) => void }) {
  const [draft, setDraft] = useState({ defect_type: issue.defect_type, quantity: issue.quantity?.toString() || '', description: issue.description || '', cause: issue.cause || '', repair: issue.repair || '', cap: issue.cap || '', status: issue.status })
  const [dirty, setDirty] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const preset = defects.find((item) => item.name.toLowerCase() === draft.defect_type.toLowerCase() || item.aliases.some((alias) => alias.toLowerCase() === draft.defect_type.toLowerCase()))
  useEffect(() => {
    if (!dirty || saveFailed) return
    const timer = window.setTimeout(() => {
      setDirty(false)
      void run(() => api.patchIssue(issue.id, { ...draft, quantity: draft.quantity ? Number(draft.quantity) : null }), 'Issue tersimpan otomatis.').then((saved) => { if (!saved) { setDirty(true); setSaveFailed(true); onPendingChange(true) } })
    }, 850)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, issue.id, run, saveFailed, onPendingChange])
  function update(key: keyof typeof draft, value: string) { setDraft((current) => ({ ...current, [key]: value })); setDirty(true); setSaveFailed(false); onPendingChange(true) }
  const count = photos.filter((photo) => photo.issue_id === issue.id).length
  return <article className="issue-card"><div className="record-head"><div><span className="section-kicker">ISSUE · {count} FOTO</span><h3>{issue.defect_type}</h3></div><button type="button" className="small-action" disabled={dirty} onClick={() => capture(issue.id)}>+ Foto issue</button></div><div className="form-grid"><label>Defect<input value={draft.defect_type} onChange={(event) => update('defect_type', event.target.value)} /></label><label>Jumlah pcs<input type="number" min="1" value={draft.quantity} onChange={(event) => update('quantity', event.target.value)} /></label><label>Status<select value={draft.status} onChange={(event) => update('status', event.target.value)}><option>OPEN</option><option>REPAIRED</option><option>ACCEPTED</option></select></label><label className="span-2">Deskripsi<textarea value={draft.description} onChange={(event) => update('description', event.target.value)} /></label>{(['cause', 'repair', 'cap'] as const).map((field) => <div className="issue-field span-2" key={field}><label>{field.toUpperCase()}<textarea value={draft[field]} onChange={(event) => update(field, event.target.value)} placeholder={`Isi ${field} berdasarkan pemeriksaan QC`} /></label>{preset && <div className="preset-suggestion"><span>PRESET REFERENSI · PERLU QC SETUJUI</span><p>{(field === 'cause' ? preset.default_causes : field === 'repair' ? preset.default_repairs : preset.default_cap)[0] || 'Tidak ada preset'}</p><button type="button" onClick={() => update(field, (field === 'cause' ? preset.default_causes : field === 'repair' ? preset.default_repairs : preset.default_cap)[0] || '')}>Gunakan teks ini</button></div>}</div>)}</div>{saveFailed && <div className="save-recovery" role="alert">Penyimpanan issue gagal. Perbaiki isian lalu coba lagi.<button type="button" onClick={() => setSaveFailed(false)}>Coba simpan</button><button type="button" onClick={() => { setDraft({ defect_type: issue.defect_type, quantity: issue.quantity?.toString() || '', description: issue.description || '', cause: issue.cause || '', repair: issue.repair || '', cap: issue.cap || '', status: issue.status }); setDirty(false); setSaveFailed(false); onPendingChange(false) }}>Batalkan perubahan</button></div>}<button type="button" className="danger-text" disabled={dirty} onClick={() => { if (window.confirm(`Hapus issue ${issue.defect_type}? Foto akan lepas dari issue ini.`)) void run(() => api.deleteIssue(issue.id), 'Issue dihapus.') }}>Hapus issue</button></article>
}

function Issues({ inspection, defects, run, capture, onPendingChange }: { inspection: Inspection; defects: Defect[]; run: Action; capture: (id: string) => void; onPendingChange: (pending: boolean) => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  return <div className="field-card"><div className="field-card-heading"><div><span className="section-kicker">05 / ISSUES</span><h2>Temuan QC</h2></div><p>Preset hanya saran teks. QC tetap memeriksa Cause, Repair dan CAP.</p></div><form className="new-issue" onSubmit={(event) => { event.preventDefault(); void run(() => api.issues(inspection.id, { defect_type: name, quantity: quantity ? Number(quantity) : null, sort_order: inspection.issues.length }), 'Issue baru tersimpan.').then((saved) => { if (saved) { setName(''); setQuantity('') } }) }}><label>Jenis defect<input list="defect-options" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Gap, Scratch, atau defect baru" /><datalist id="defect-options">{defects.map((defect) => <option key={defect.id} value={defect.name} />)}</datalist></label><label>Jumlah pcs<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Opsional" /></label><button type="submit" className="primary-action" disabled={!name.trim()}>+ Buat issue</button></form><div className="record-list">{inspection.issues.map((issue) => <IssueCard key={issue.id} issue={issue} defects={defects} photos={inspection.photos} run={run} capture={capture} onPendingChange={onPendingChange} />)}{inspection.issues.length === 0 && <p className="empty-inline">Belum ada issue. Tambahkan bila ditemukan; tidak perlu membuat issue fiktif.</p>}</div></div>
}

function ReviewPanel({ inspection, run }: { inspection: Inspection; run: Action }) {
  const [review, setReview] = useState<Review | null>(null)
  const [reportBusy, setReportBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [selectedPage, setSelectedPage] = useState(0)
  const [message, setMessage] = useState('')
  const isDesktopView = typeof navigator !== 'undefined' && navigator.userAgent.includes('pywebview')
  useEffect(() => { let active = true; api.validate(inspection.id).then((result) => { if (active) setReview(result) }).catch((cause) => { if (active) setMessage(String(cause)) }); return () => { active = false } }, [inspection.id, inspection.revision])
  async function showPreview() {
    setPreviewBusy(true)
    setMessage('Merender halaman Word…')
    try {
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
      <button type="button" className="small-action" onClick={() => void api.validate(inspection.id).then(setReview)}>Periksa ulang</button>
      <button type="button" className="small-action" disabled={!ready || previewBusy} onClick={() => void showPreview()}>{previewBusy ? 'Merender…' : preview ? 'Perbarui preview' : 'Preview tiap halaman'}</button>
      <button type="button" className="primary-action" disabled={reportBusy || !ready} onClick={async () => { setReportBusy(true); setMessage('Membuat DOCX…'); try { const result = await api.downloadReport(inspection.id); setMessage(result === 'save-dialog' ? 'Android menyiapkan DOCX. Pilih lokasi saat diminta.' : 'DOCX diunduh.') } catch (cause) { const detail = String(cause); setMessage(isDesktopView ? `${detail} Jika dialog simpan tidak muncul di jendela Inspectra, ulangi dengan mode browser (--browser).` : detail) } finally { setReportBusy(false) } }}>{reportBusy ? 'Membuat…' : 'Unduh DOCX'}</button>
    </div>
    {preview && <section className="report-preview" aria-label="Preview laporan per halaman">
      <div className="report-preview-heading"><strong>Halaman {selectedPage + 1} dari {preview.page_count}</strong><span>Hasil render Microsoft Word</span></div>
      <div className="report-preview-viewer"><button type="button" aria-label="Halaman sebelumnya" disabled={selectedPage === 0} onClick={() => setSelectedPage((value) => value - 1)}>‹</button><img src={preview.pages[selectedPage]} alt={`Preview halaman ${selectedPage + 1} dari ${preview.page_count}`} /><button type="button" aria-label="Halaman berikutnya" disabled={selectedPage === preview.page_count - 1} onClick={() => setSelectedPage((value) => value + 1)}>›</button></div>
      <div className="report-preview-pages">{preview.pages.map((url, index) => <button type="button" key={url} className={selectedPage === index ? 'active' : ''} aria-label={`Lihat halaman ${index + 1}`} aria-current={selectedPage === index ? 'page' : undefined} onClick={() => setSelectedPage(index)}><img src={url} alt="" loading="lazy" /><span>{index + 1}</span></button>)}</div>
    </section>}
    {inspection.status !== 'COMPLETED' && <button type="button" className="small-action" onClick={() => void run(() => api.patchInspection(inspection.id, { revision: inspection.revision, status: 'COMPLETED' }), 'Inspeksi ditandai selesai.')}>Tandai inspeksi selesai</button>}
  </div>
}

export default function Workspace({ inspection, defects, run, refresh, onDelete, initialTab = 'overview', onPendingChange, busy }: {
  inspection: Inspection; defects: Defect[]; run: Action;
  refresh: () => Promise<void>; onDelete: () => Promise<void>; initialTab?: Tab;
  onPendingChange: (pending: boolean) => void; busy: boolean
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [captureIssue, setCaptureIssue] = useState<string | null>(null)
  const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'photos', label: 'Photos' }, { id: 'measurements', label: 'Measurement' }, { id: 'tests', label: 'Tests' }, { id: 'issues', label: 'Issues' }, { id: 'review', label: 'Review & Report' }]
  return <section className="workspace"><div className="workspace-tabs" role="tablist" aria-label="Bagian inspeksi">{tabs.map((item, index) => <button type="button" key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} disabled={busy} onClick={() => setTab(item.id)}><span className="step-number">{index + 1}</span>{item.label}</button>)}</div>
    {tab === 'overview' && <Overview inspection={inspection} run={run} onPendingChange={onPendingChange} />}
    {tab === 'photos' && <Photos inspection={inspection} run={run} captureIssue={captureIssue} refresh={refresh} />}
    {tab === 'measurements' && <Measurements inspection={inspection} run={run} tests={false} />}
    {tab === 'tests' && <Measurements inspection={inspection} run={run} tests />}
    {tab === 'issues' && <Issues inspection={inspection} defects={defects} run={run} capture={(issueId) => { setCaptureIssue(issueId); setTab('photos') }} onPendingChange={onPendingChange} />}
    {tab === 'review' && <ReviewPanel key={`${inspection.id}:${inspection.revision}`} inspection={inspection} run={run} />}
    <div className="workspace-bottom"><button type="button" className="small-action" disabled={busy} onClick={() => void refresh()}>Muat ulang data</button><button type="button" className="danger-text" disabled={busy} onClick={() => { if (window.confirm(`Hapus inspeksi ${inspection.inspection_number} beserta foto dan laporan? Tindakan ini tidak dapat dibatalkan.`)) void onDelete() }}>Hapus inspeksi</button></div>
  </section>
}
