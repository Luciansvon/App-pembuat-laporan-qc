import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { DimensionPair } from '../components/DimensionPhotos'
import PhotoUploadSection from '../components/PhotoUploadSection'
import { ConfirmModal, type ConfirmOptions } from '../components/ConfirmModal'
import { isAndroidApp } from '../services/android'
import { useAutosave } from '../hooks/useAutosave'
import type { Defect, Inspection, Issue, Measurement, Photo, ReportPreview, Review } from '../types/qc'

type Action = (task: () => Promise<unknown>, message?: string) => Promise<boolean>
export type Tab = 'overview' | 'photos' | 'measurements' | 'tests' | 'issues' | 'review'
const axes = ['L', 'W', 'D', 'H']
const isDesktopView = typeof window !== 'undefined' && ('pywebview' in window || navigator.userAgent.includes('pywebview'))

function initialDraft(inspection: Inspection): Record<string, string> {
  const result: Record<string, string> = {
    po: inspection.po, inspection_type: inspection.inspection_type, report_type: inspection.report_type || 'STANDARD', date: inspection.date,
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
      const latest = await api.inspection(inspection.id)
      const dimensions = (source: Record<string, number>, prefix: string) => ({
        ...Object.fromEntries(Object.entries(source).filter(([axis]) => !axes.includes(axis))),
        ...Object.fromEntries(axes.filter((axis) => draft[`${prefix}_${axis}`] !== '').map((axis) => [axis, Number(draft[`${prefix}_${axis}`])])),
      })
      const product_dimensions = dimensions(latest.product_dimensions, 'dim')
      const box_dimensions = dimensions(latest.box_dimensions, 'box')
      const patch = {
        revision: latest.revision, po: draft.po, inspection_type: draft.inspection_type,
        report_type: draft.report_type || 'STANDARD',
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
    <div className="summary-strip"><span>FORMAT <strong>{draft.report_type === 'COMBINED' ? 'Gabungan' : draft.report_type === 'PACKING' ? 'Khusus Packing' : 'Standar'}</strong></span><span>PO <strong>{inspection.po}</strong></span><span>QTY <strong>{inspection.quantity}</strong></span><span>AQL <strong>{inspection.aql || '—'}</strong></span><span>STATUS <strong>{inspection.status}</strong></span></div>
    <p className="field-help">Perubahan form ini tersimpan otomatis setelah berhenti mengetik. Angka di header adalah standar produk; hasil pengukuran di tab Measurement.</p>
    <div className="form-grid">
      <label>Format laporan<select value={draft.report_type || 'STANDARD'} onChange={(event) => update('report_type', event.target.value)}><option value="STANDARD">Laporan Standar (Hanya Produk / Format Lama)</option><option value="COMBINED">Laporan Gabungan (Inspect &amp; Packing Jadi Satu / Format Baru)</option><option value="PACKING">Laporan Khusus Packing (Kemasan Box RH)</option></select></label>
      <label>PO<input value={draft.po} onChange={(event) => update('po', event.target.value)} /></label>
      <label>Inspect<select value={draft.inspection_type} onChange={(event) => update('inspection_type', event.target.value)}><option>INLINE</option><option>FINAL</option><option>PACKING</option><option>PRE_SHIPMENT</option><option>OTHER</option></select></label>
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

// Photos handling extracted to PhotoUploadSection component

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
  useEffect(() => {
    const onNav = (e: Event) => {
      const custom = e as CustomEvent<Tab>
      if (custom.detail) setTab(custom.detail)
    }
    window.addEventListener('inspectra-navigate-tab', onNav)
    return () => window.removeEventListener('inspectra-navigate-tab', onNav)
  }, [])
  const [captureIssue, setCaptureIssue] = useState<string | null>(null)
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null)
  const askConfirm = useCallback((opts: ConfirmOptions) => setConfirmOptions(opts), [])
  const overviewPending = useCallback((pending: boolean) => onPendingChange('overview', pending), [onPendingChange])
  const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'photos', label: 'Photos' }, { id: 'measurements', label: 'Measurement' }, { id: 'tests', label: 'Tests' }, { id: 'issues', label: 'Issues' }, { id: 'review', label: 'Review & Report' }]
  return <section className="workspace"><div className="workspace-tabs" role="tablist" aria-label="Bagian inspeksi">{tabs.map((item, index) => <button type="button" key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} disabled={busy} onClick={() => setTab(item.id)}><span className="step-number">{index + 1}</span>{item.label}</button>)}</div>
    {tab === 'overview' && <Overview inspection={inspection} run={run} onPendingChange={overviewPending} />}
    {tab === 'photos' && <PhotoUploadSection inspection={inspection} run={run} captureIssue={captureIssue} refresh={refresh} goIssues={() => setTab('issues')} goDimensions={() => setTab('measurements')} askConfirm={askConfirm} defects={defects} />}
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
