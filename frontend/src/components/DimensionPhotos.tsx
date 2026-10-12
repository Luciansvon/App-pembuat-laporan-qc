import { useRef, useState } from 'react'
import { api } from '../services/api'
import type { Inspection, Measurement } from '../types/qc'

type Action = (action: () => Promise<unknown>, message: string) => Promise<boolean>

export function DimensionPair({ inspection, measurement, run }: { inspection: Inspection; measurement: Measurement; run: Action }) {
  const input = useRef<HTMLInputElement>(null)
  const selectedSlot = useRef<1 | 2>(1)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const photos = inspection.photos.filter(photo => photo.measurement_id === measurement.id)
  async function upload(files: File[]) {
    if (photos.length + files.length > 2) { setError('Setiap ukuran harus terdiri dari dua foto. Pilih maksimal foto yang masih kosong.'); return }
    setError('')
    setUploading(true)
    try { await run(() => api.upload(inspection.id, 'DIMENSION', files, undefined, measurement.id, selectedSlot.current), `Foto ${measurement.label} tersimpan.`) }
    finally { setUploading(false) }
  }
  return <div className="dimension-pair">
    <div className="dimension-pair-heading"><strong>{measurement.label}</strong><span>{photos.length}/2 foto{photos.length === 2 ? ' · Lengkap' : ' · Belum lengkap'}</span></div>
    <div className="dimension-values">
      {measurement.value_min === null && measurement.value_max === null && <label>Aktual ({measurement.unit || 'mm'})<input key={`${measurement.id}-${measurement.value}`} type="number" step="any" defaultValue={measurement.value ?? ''} placeholder="Opsional" onBlur={event => { const value = event.target.value === '' ? null : Number(event.target.value); if (value !== measurement.value) void run(() => api.patchMeasurement(measurement.id, { value }), 'Hasil ukur tersimpan.') }} /></label>}
      <label>Standar ({measurement.unit || 'mm'})<input key={`${measurement.id}-${measurement.standard_value}`} type="number" step="any" defaultValue={measurement.standard_value ?? ''} placeholder="Opsional" onBlur={event => { const standard_value = event.target.value === '' ? null : Number(event.target.value); if (standard_value !== measurement.standard_value) void run(() => api.patchMeasurement(measurement.id, { standard_value }), 'Standar tersimpan.') }} /></label>
    </div>
    <div className="dimension-photo-slots">{([1, 2] as const).map(slot => {
      const photo = photos.find(item => item.dimension_slot === slot)
      return <div className="dimension-photo-slot" key={slot}>
        {photo ? <><button type="button" className="photo-thumb" onClick={() => setPreview(photo.id)} aria-label={`Lihat ${measurement.label} foto ${slot}`}><img src={`/api/photos/${photo.id}/file?v=${inspection.revision}`} alt={photo.caption || `${measurement.label} foto ${slot}`} /></button><label>Foto {slot}<input key={`${photo.id}-${photo.caption}`} defaultValue={photo.caption || ''} placeholder="Keterangan foto" onBlur={event => { if (event.target.value !== (photo.caption || '')) void run(() => api.patchPhoto(photo.id, { caption: event.target.value }), 'Caption tersimpan.') }} /></label><div className="photo-controls"><button type="button" onClick={() => void run(() => api.patchPhoto(photo.id, { rotate_degrees: 90 }), 'Foto diputar.')}>Putar</button><button type="button" className="danger-text" onClick={() => { if (window.confirm(`Hapus foto ${slot} ${measurement.label}?`)) void run(() => api.deletePhoto(photo.id), 'Foto dihapus.') }}>Hapus</button></div></>
          : <button type="button" className="dimension-empty-slot" disabled={uploading} onClick={() => { selectedSlot.current = slot; input.current?.click() }}>＋<span>Foto {slot} · {measurement.label}</span></button>}
      </div>
    })}</div>
    <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple aria-label={`Tambah foto ${measurement.label}`} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void upload(files) }} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {preview && <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Foto dimension penuh" onClick={() => setPreview(null)}><button type="button" onClick={() => setPreview(null)}>Tutup ×</button><img src={`/api/photos/${preview}/file?v=${inspection.revision}`} alt={`Foto ${measurement.label} penuh`} /></div>}
  </div>
}

export default function DimensionPhotos({ inspection, run, addCustom }: { inspection: Inspection; run: Action; addCustom: () => void }) {
  const dimensions = inspection.measurements.filter(item => item.category === 'DIMENSION')
  return <section className="dimension-groups" aria-label="Foto per ukuran dimension"><div className="dimension-pair-heading"><h3>Dimension · dua foto per ukuran</h3><label>Layout laporan<select value={inspection.photo_layout?.['DIMENSION'] ?? 2} onChange={(event) => void run(() => api.patchInspection(inspection.id, { revision: inspection.revision, photo_layout: { ...(inspection.photo_layout || {}), DIMENSION: Number(event.target.value) } }), 'Layout laporan tersimpan.')} aria-label="Jumlah foto per baris untuk dimension">{[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option value={count} key={count}>{count} foto/baris</option>)}</select></label><button type="button" className="text-action" onClick={addCustom}>Tambah ukuran lain</button></div>
    <div className="dimension-add-buttons">{['Length', 'Width', 'Depth', 'Height'].map(label => <button type="button" className="small-action" key={label} disabled={dimensions.some(item => item.label.toLowerCase() === label.toLowerCase())} onClick={() => void run(() => api.addMeasurement(inspection.id, { category: 'DIMENSION', label, unit: 'mm', sort_order: inspection.measurements.length }), `Ukuran ${label} ditambahkan.`)}>＋ {label}</button>)}</div>
    {dimensions.map(measurement => <DimensionPair key={measurement.id} inspection={inspection} measurement={measurement} run={run} />)}
    {!dimensions.length && <p className="empty-inline">Pilih ukuran di atas, lalu isi kedua slot fotonya.</p>}
  </section>
}
