import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import DimensionPhotos from './DimensionPhotos'
import type { ConfirmOptions } from './ConfirmModal'
import type {
  Defect,
  Inspection,
  Photo,
  PhotoLayoutCatalog,
  PhotoLayoutTemplate,
  PhotoPage,
} from '../types/qc'
import {
  analyzePhoto,
  auditPhotoPage,
  type PageAuditResult,
  type PhotoAnalysisResult,
  resolvePhotoDataUrl,
} from '../services/aiService'

type Action = (task: () => Promise<unknown>, message?: string) => Promise<boolean>

const sections = [
  'PACKING_ATTRIBUTE', 'BOX_DIMENSION', 'PACKING_METHOD', 'INNER_SKU_GLIDE',
  'PRODUCT_VIEW', 'PRODUCT_DETAIL', 'DRAIN_HOLE', 'DRAWING', 'DIMENSION',
  'LEVEL_CHECK', 'MAL_CHECK', 'RADIUS', 'MC', 'INSPECTED_PRODUCT', 'GLOSS',
  'GAP_SLIDE', 'CORNER', 'SWATCH', 'TRIAL_BACKREST', 'ISSUE', 'OTHER',
]

const sectionLabel = (section: string) => {
  const map: Record<string, string> = {
    PACKING_ATTRIBUTE: 'Atribut Kemasan & Label',
    BOX_DIMENSION: 'Dimensi Kardus',
    PACKING_METHOD: 'Metode Pengemasan (Packing)',
    INNER_SKU_GLIDE: 'Inner SKU & Fixed Glide',
    PRODUCT_VIEW: 'Tampak Produk (Product View)',
    PRODUCT_DETAIL: 'Detail Produk',
    DRAIN_HOLE: 'Lubang Tirisan (Drain Hole)',
    DRAWING: 'Gambar Kerja (Drawing)',
    DIMENSION: 'Dimensi Produk',
    LEVEL_CHECK: 'Uji Kerataan Meja (Level Check)',
    MAL_CHECK: 'Uji Cetakan Kaki (Mal Jig)',
    RADIUS: 'Uji Radius Lengkung (Mal R)',
    MC: 'Kadar Air (MC)',
    INSPECTED_PRODUCT: 'Sampel Diinspeksi (Inspect Pcs)',
    GLOSS: 'Kilap Cat (Gloss)',
    GAP_SLIDE: 'Celah Rel (Gap Slide)',
    CORNER: 'Sudut (Corner)',
    SWATCH: 'Sampel Warna (Swatch)',
    TRIAL_BACKREST: 'Uji Sandaran',
    ISSUE: 'Temuan Masalah (Issue)',
    OTHER: 'Lainnya',
  }
  return map[section] || section.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export interface PhotoUploadSectionProps {
  inspection: Inspection
  run: Action
  captureIssue: string | null
  refresh: () => Promise<void>
  goIssues: () => void
  goDimensions: () => void
  askConfirm: (options: ConfirmOptions) => void
  defects?: Defect[]
}

export default function PhotoUploadSection({
  inspection,
  run,
  captureIssue,
  refresh,
  goIssues,
  goDimensions,
  askConfirm,
  defects = [],
}: PhotoUploadSectionProps) {
  const input = useRef<HTMLInputElement>(null)
  const slotFileInput = useRef<HTMLInputElement>(null)
  const slotUploadTarget = useRef<{ page: PhotoPage; slot: number } | null>(null)
  const [slotUploading, setSlotUploading] = useState<number | null>(null)
  const uploadTarget = useRef<{ section: string; issueId: string }>({
    section: captureIssue ? 'ISSUE' : 'PRODUCT_VIEW',
    issueId: captureIssue || '',
  })
  const [section, setSection] = useState(captureIssue ? 'ISSUE' : 'PRODUCT_VIEW')
  const [issueId, setIssueId] = useState(captureIssue || '')
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

  // AI Multimodal Vision States
  const [activeModalPhoto, setActiveModalPhoto] = useState<Photo | null>(null)
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null)
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [appliedCaptions, setAppliedCaptions] = useState<Record<string, boolean>>({})

  // Page Audit States
  const [auditModalPage, setAuditModalPage] = useState<{ page: PhotoPage; layout: PhotoLayoutTemplate } | null>(null)
  const [pageAuditResult, setPageAuditResult] = useState<PageAuditResult | null>(null)
  const [auditingPage, setAuditingPage] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  const photoPages = inspection.photo_pages || []

  useEffect(() => {
    void api.photoLayouts().then(setLayouts).catch(() => setLayouts(null))
  }, [])

  useEffect(() => {
    if (captureIssue) {
      setSection('ISSUE')
      setIssueId(captureIssue)
    }
  }, [captureIssue])

  const ordered = inspection.photos
    .filter((photo) => !['DIMENSION', 'BOX_DIMENSION'].includes(photo.section) || !photo.measurement_id)
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))

  const pageableSections = (layouts?.templates || [])
    .flatMap((layout) => layout.sections)
    .filter((item, index, all) => all.indexOf(item) === index)

  const categoryOptions = [
    'Semua',
    ...((layouts?.templates || []).map((layout) => layout.category).filter((item, index, all) => all.indexOf(item) === index)),
  ]

  const visibleLayouts = (layouts?.templates || []).filter(
    (layout) => layout.sections.includes(wizardSection) && (category === 'Semua' || layout.category === category),
  )

  const getLayout = (id: string) => layouts?.templates.find((layout) => layout.id === id)

  function quickCapture(nextSection: string) {
    setSection(nextSection)
    if (['DIMENSION', 'BOX_DIMENSION'].includes(nextSection)) return
    if (nextSection !== 'ISSUE') setIssueId('')
    uploadTarget.current = { section: nextSection, issueId: nextSection === 'ISSUE' ? issueId : '' }
    input.current?.click()
  }

  function openWizard() {
    const startSection = pageableSections.includes(section) ? section : 'PRODUCT_VIEW'
    setWizardSection(startSection)
    setCategory('Semua')
    setTemplateId(null)
    setActivePageId(null)
    setWizardStep('layout')
    setWizardOpen(true)
  }

  function patchPhotoPages(next: PhotoPage[], message: string) {
    if (pageSaveLock.current) return Promise.resolve(false)
    pageSaveLock.current = true
    setPageSaving(true)
    return run(async () => {
      const latest = await api.inspection(inspection.id)
      return api.patchInspection(inspection.id, { revision: latest.revision, photo_pages: next })
    }, message).finally(() => {
      pageSaveLock.current = false
      setPageSaving(false)
    })
  }

  async function continueToSlots() {
    const layout = templateId ? getLayout(templateId) : undefined
    if (!layout) return
    const previousPage = activePageId ? photoPages.find((page) => page.id === activePageId) : undefined
    const newPage: PhotoPage = {
      id: previousPage?.id || globalThis.crypto?.randomUUID?.() || `page-${Date.now()}`,
      section: wizardSection,
      template_id: layout.id,
      photo_ids: Array.from({ length: layout.photo_count }, (_, index) => {
        const previousPhotoId = previousPage?.photo_ids[index] || null
        return previousPhotoId && inspection.photos.find((photo) => photo.id === previousPhotoId)?.section === wizardSection
          ? previousPhotoId
          : null
      }),
    }
    const next = activePageId
      ? photoPages.map((page) => (page.id === activePageId ? newPage : page))
      : [...photoPages, newPage]
    const saved = await patchPhotoPages(next, 'Halaman foto dibuat.')
    if (saved) {
      setActivePageId(newPage.id)
      setWizardStep('slots')
    }
  }

  function changeSlot(page: PhotoPage, slot: number, photoId: string) {
    const nextPage = {
      ...page,
      photo_ids: page.photo_ids.map((item, index) => (index === slot ? photoId || null : item)),
    }
    void patchPhotoPages(
      photoPages.map((item) => (item.id === page.id ? nextPage : item)),
      'Pilihan foto dan caption tersimpan di halaman.',
    )
  }

  function removePage(page: PhotoPage) {
    askConfirm({
      title: 'Hapus Halaman Foto?',
      message: 'Apakah Anda yakin ingin menghapus tata letak halaman ini? Foto di galeri tetap tersimpan aman.',
      confirmText: 'Hapus Halaman',
      onConfirm: () => {
        void patchPhotoPages(
          photoPages.filter((item) => item.id !== page.id),
          'Halaman foto dihapus.',
        )
        if (activePageId === page.id) {
          setWizardOpen(false)
          setActivePageId(null)
        }
      },
    })
  }

  function movePage(index: number, delta: -1 | 1) {
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= photoPages.length) return
    const next = [...photoPages]
    ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
    void patchPhotoPages(next, 'Urutan halaman diperbarui.')
  }

  // --- Handlers for Single Photo Vision AI ---
  const handleOpenPhotoModal = (photo: Photo) => {
    setActiveModalPhoto(photo)
    setPhotoAnalysis(null)
    setAnalysisError(null)
  }

  const handleRunSingleAnalysis = async (photo: Photo) => {
    setAnalyzingPhoto(true)
    setAnalysisError(null)
    try {
      const result = await analyzePhoto(photo.id, {
        photoId: photo.id,
        caption: photo.caption || '',
        section: photo.section,
        inspection,
        defects,
      })
      setPhotoAnalysis(result)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzingPhoto(false)
    }
  }

  const handleApplySuggestedCaption = async (photoId: string, caption: string) => {
    await run(() => api.patchPhoto(photoId, { caption }), 'Caption saran AI berhasil diterapkan.')
    setAppliedCaptions((prev) => ({ ...prev, [photoId]: true }))
    await refresh()
    if (activeModalPhoto && activeModalPhoto.id === photoId) {
      setActiveModalPhoto({ ...activeModalPhoto, caption })
    }
  }

  const handleAddIssueFromVision = async (analysis: PhotoAnalysisResult, photo: Photo) => {
    if (!analysis.defectType) return
    await run(async () => {
      const issue = await api.issues(inspection.id, {
        defect_type: analysis.defectType,
        quantity: 1,
        cause: analysis.cause || '',
        repair: analysis.repair || '',
        cap: analysis.cap || '',
        description: analysis.findings || '',
        sort_order: inspection.issues.length,
      })
      await api.patchPhoto(photo.id, { section: 'ISSUE', issue_id: issue.id })
    }, `Temuan cacat ${analysis.defectType} berhasil ditambahkan ke Issues.`)
    await refresh()
    setActiveModalPhoto(null)
  }

  const handleOpenInCopilot = async (photo: Photo) => {
    try {
      const dataUrl = await resolvePhotoDataUrl(photo.id)
      window.dispatchEvent(
        new CustomEvent('inspectra-copilot-photo', {
          detail: {
            photoId: photo.id,
            dataUrl,
            caption: photo.caption,
            prompt: `Tolong analisis foto "${photo.caption || sectionLabel(photo.section)}" ini secara mendalam untuk QC furnitur.`,
          },
        }),
      )
      setActiveModalPhoto(null)
    } catch {
      // fallback
    }
  }

  // --- Handlers for Page Audit Vision AI ---
  const handleStartPageAudit = async (page: PhotoPage, layout: PhotoLayoutTemplate) => {
    setAuditModalPage({ page, layout })
    setAuditingPage(true)
    setAuditError(null)
    setPageAuditResult(null)
    try {
      const result = await auditPhotoPage(page, inspection.photos, layout, inspection, defects)
      setPageAuditResult(result)
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : String(err))
    } finally {
      setAuditingPage(false)
    }
  }

  function renderPageSlots(page: PhotoPage, layout: PhotoLayoutTemplate, showTitle = false) {
    const usedElsewhere = new Set(
      photoPages
        .filter((item) => item.id !== page.id)
        .flatMap((item) => item.photo_ids)
        .filter((id): id is string => Boolean(id)),
    )
    return (
      <>
        {showTitle && (
          <div className="photo-slot-heading">
            <strong>Pilih foto untuk {layout.code}</strong>
            <span>
              {page.photo_ids.filter(Boolean).length}/{layout.photo_count} slot · caption mengikuti foto di galeri
            </span>
          </div>
        )}
        <div className="report-page-slots" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}>
          {page.photo_ids.map((photoId, slot) => {
            const photo = inspection.photos.find((item) => item.id === photoId)
            const usedInOtherSlots = new Set(
              page.photo_ids.filter((item, index): item is string => index !== slot && Boolean(item)),
            )
            const candidates = inspection.photos.filter(
              (item) => item.section === page.section && !usedElsewhere.has(item.id) && !usedInOtherSlots.has(item.id),
            )
            return (
              <article className={`report-page-slot${photo ? ' filled' : ''}`} key={`${page.id}-${slot}`}>
                {photo ? (
                  <div className="report-page-slot-preview">
                    <img
                      src={`/api/photos/${photo.id}/file?v=${inspection.revision}`}
                      alt={photo.caption || `Foto ${slot + 1}`}
                      onClick={() => handleOpenPhotoModal(photo)}
                      title="Klik untuk membuka pratinjau & Analisis AI"
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
                <label>
                  Atau pilih dari galeri
                  <select
                    aria-label={`Foto slot ${slot + 1} ${layout.code}`}
                    disabled={pageSaving}
                    value={photoId || ''}
                    onChange={(event) => changeSlot(page, slot, event.target.value)}
                  >
                    <option value="">Pilih foto…</option>
                    {candidates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.caption?.trim() || `${sectionLabel(item.section)} · Foto ${item.sort_order}`}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="report-page-caption">{photo?.caption?.trim() || 'Caption belum diisi'}</p>
              </article>
            )
          })}
        </div>
      </>
    )
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
          // refresh handles alignment
        }
        throw cause
      }
    }, 'Urutan foto tersimpan.')
    if (!saved) await refresh()
  }

  return (
    <div className="field-card">
      <div className="field-card-heading">
        <div>
          <span className="section-kicker">02 / PHOTOS &amp; AI VISION</span>
          <h2>Foto &amp; Audit Visual</h2>
        </div>
        <p>
          Unggah foto inspeksi, atur halaman Word, dan gunakan AI Vision Multimodal untuk mendeteksi cacat serta mengaudit kesiapan halaman laporan.
        </p>
      </div>

      <div className="capture-grid">
        {['PRODUCT_VIEW', 'DIMENSION', 'MC', 'INSPECTED_PRODUCT', 'ISSUE'].map((item) => (
          <button key={item} type="button" onClick={() => quickCapture(item)}>
            <span>＋</span>
            {sectionLabel(item)}
          </button>
        ))}
      </div>

      <div className="upload-tools">
        <label>
          Section
          <select value={section} onChange={(event) => setSection(event.target.value)}>
            {sections.map((item) => (
              <option value={item} key={item}>
                {sectionLabel(item)}
              </option>
            ))}
          </select>
        </label>

        {section === 'ISSUE' &&
          (inspection.issues.length === 0 ? (
            <p className="empty-inline">
              Belum ada issue. <button type="button" className="text-action" onClick={goIssues}>Buat dulu di tab Issues</button>
            </p>
          ) : (
            <label>
              Issue
              <select value={issueId} onChange={(event) => setIssueId(event.target.value)}>
                <option value="">Belum ditautkan</option>
                {inspection.issues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.defect_type}
                  </option>
                ))}
              </select>
            </label>
          ))}

        <button
          type="button"
          className="small-action"
          disabled={section === 'DIMENSION'}
          onClick={() => {
            uploadTarget.current = { section, issueId }
            input.current?.click()
          }}
        >
          + Tambah foto
        </button>

        <button
          type="button"
          className="primary-action"
          disabled={!layouts || !pageableSections.includes(section)}
          title={!pageableSections.includes(section) ? 'Dimension dan Issue memakai susunan khusus.' : undefined}
          onClick={openWizard}
        >
          ＋ Tambah halaman
        </button>
      </div>

      {(section === 'DIMENSION' ||
        inspection.measurements.some((item) => item.category === 'DIMENSION') ||
        inspection.photos.some((photo) => photo.section === 'DIMENSION')) && (
        <DimensionPhotos
          inspection={inspection}
          run={run}
          addCustom={goDimensions}
          askConfirm={askConfirm}
        />
      )}

      {/* Hidden File Input for Multiple Uploads */}
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        multiple
        onChange={async (event) => {
          const files = event.target.files
          if (files?.length) {
            const target = uploadTarget.current
            await run(async () => {
              const uploaded = await api.upload(inspection.id, target.section, files, target.issueId || undefined)
              if (target.section === 'INSPECTED_PRODUCT') {
                const defaultQty = inspection.inspected_quantity || inspection.quantity || 1
                for (const p of uploaded) {
                  if (!p.caption) {
                    await api.patchPhoto(p.id, { caption: `inspect ${defaultQty} pcs` })
                  }
                }
              }
            }, `${files.length} foto tersimpan.`)
            await refresh()
          }
          event.target.value = ''
        }}
        aria-label="Unggah atau ambil foto"
      />

      {/* Hidden File Input for Slot Specific Upload */}
      <input
        ref={slotFileInput}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={async (event) => {
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
                  const nextPage = latestPages.map((item) =>
                    item.id === targetPage.id
                      ? {
                          ...item,
                          photo_ids: item.photo_ids.map((pId, index) => (index === targetSlot ? newPhotoId : pId)),
                        }
                      : item,
                  )
                  await api.patchInspection(inspection.id, {
                    revision: latest.revision,
                    photo_pages: nextPage,
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
        }}
        aria-label="Unggah foto langsung ke slot halaman"
      />

      {/* REPORT PAGES SECTION */}
      {!!photoPages.length && (
        <section className="report-pages" aria-label="Susunan halaman foto laporan">
          <div className="report-pages-heading">
            <div>
              <span className="section-kicker">SUSUNAN DOCX &amp; AUDIT HALAMAN</span>
              <h3>Halaman Foto Laporan</h3>
              <p>Setiap halaman mewakili 1 halaman cetak Word resmi. Gunakan tombol Audit AI untuk memeriksa kelayakan visual.</p>
            </div>
            <button type="button" className="small-action" onClick={openWizard}>
              ＋ Halaman
            </button>
          </div>

          {photoPages.map((page, index) => {
            const layout = getLayout(page.template_id)
            if (!layout) return null
            return (
              <article className="report-page-card" key={page.id}>
                <header>
                  <div>
                    <span className="section-kicker">
                      HALAMAN {index + 1} · {sectionLabel(page.section)}
                    </span>
                    <h4>
                      {layout.code} — {layout.title}
                    </h4>
                    <p>
                      {page.photo_ids.filter(Boolean).length} dari {layout.photo_count} slot terisi · foto maks{' '}
                      {layout.max_photo_height_cm} cm tinggi
                    </p>
                  </div>
                  <div className="report-page-actions" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="audit-page-btn"
                      onClick={() => handleStartPageAudit(page, layout)}
                      title="Audit kesesuaian dan kelengkapan visual halaman ini dengan AI"
                    >
                      🔍 Audit Halaman AI
                    </button>
                    <button
                      type="button"
                      aria-label={`Pindah halaman ${index + 1} ke atas`}
                      disabled={pageSaving || index === 0}
                      onClick={() => movePage(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Pindah halaman ${index + 1} ke bawah`}
                      disabled={pageSaving || index === photoPages.length - 1}
                      onClick={() => movePage(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="danger-text"
                      disabled={pageSaving}
                      onClick={() => removePage(page)}
                    >
                      Hapus
                    </button>
                  </div>
                </header>
                {renderPageSlots(page, layout)}
              </article>
            )
          })}
        </section>
      )}

      {/* PHOTO GALLERY LIST */}
      {ordered.length === 0 ? (
        inspection.photos.length === 0 && (
          <p className="empty-inline">Belum ada foto. Pilih tombol kamera di atas.</p>
        )
      ) : (
        <div className="photo-list">
          {ordered.map((photo, index) => (
            <article
              className="photo-card"
              key={photo.id}
              draggable
              onDragStart={() => setDragged(photo.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const source = ordered.find((item) => item.id === dragged)
                if (source) void reorder(source, photo)
                setDragged(null)
              }}
            >
              <button
                type="button"
                className="photo-thumb"
                onClick={() => handleOpenPhotoModal(photo)}
                aria-label={`Lihat foto ${index + 1} penuh & Analisis AI`}
              >
                <img
                  src={`/api/photos/${photo.id}/file?v=${inspection.revision}`}
                  alt={photo.caption || `Foto ${sectionLabel(photo.section)} ${index + 1}`}
                  loading="lazy"
                />
              </button>

              <div className="photo-meta">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="section-kicker">
                    {String(index + 1).padStart(2, '0')} / {sectionLabel(photo.section)}
                  </span>
                  <button
                    type="button"
                    className="photo-ai-badge-btn"
                    onClick={() => handleOpenPhotoModal(photo)}
                    title="Buka Pratinjau & Analisis Vision AI"
                  >
                    🔍 Analisis AI
                  </button>
                </div>

                <label>
                  Caption
                  <input
                    key={`${photo.id}-${photo.caption}`}
                    defaultValue={photo.caption || ''}
                    placeholder="Keterangan foto"
                    onBlur={(event) => {
                      if (event.target.value !== (photo.caption || '')) {
                        void run(() => api.patchPhoto(photo.id, { caption: event.target.value }), 'Caption tersimpan.')
                      }
                    }}
                  />
                </label>

                <div className="photo-controls">
                  <select
                    aria-label="Pindah section"
                    disabled={photoPages.some((page) => page.photo_ids.includes(photo.id))}
                    title={
                      photoPages.some((page) => page.photo_ids.includes(photo.id))
                        ? 'Lepas foto dari slot halaman terlebih dahulu'
                        : undefined
                    }
                    value={photo.section}
                    onChange={(event) => {
                      const nextSection = event.target.value
                      const isDim = nextSection === 'DIMENSION' || nextSection === 'BOX_DIMENSION'
                      const availableMeasurement = isDim
                        ? inspection.measurements.find(
                            (m) =>
                              m.category === nextSection &&
                              inspection.photos.filter((p) => p.measurement_id === m.id && p.id !== photo.id).length < 2,
                          )
                        : null
                      void run(
                        () =>
                          api.patchPhoto(photo.id, {
                            section: nextSection,
                            issue_id: nextSection === 'ISSUE' ? photo.issue_id : null,
                            measurement_id: isDim
                              ? photo.section === nextSection
                                ? photo.measurement_id
                                : availableMeasurement?.id || null
                              : null,
                          }),
                        'Section foto diperbarui.',
                      )
                    }}
                  >
                    {sections.map((item) => (
                      <option value={item} key={item}>
                        {sectionLabel(item)}
                      </option>
                    ))}
                  </select>

                  {(photo.section === 'DIMENSION' || photo.section === 'BOX_DIMENSION') && (
                    <select
                      aria-label="Tautkan foto ke ukuran"
                      value={photo.measurement_id || ''}
                      onChange={(event) =>
                        void run(
                          () =>
                            api.patchPhoto(photo.id, {
                              measurement_id: event.target.value || null,
                              issue_id: null,
                            }),
                          'Foto ditautkan ke ukuran.',
                        )
                      }
                    >
                      <option value="">Pilih ukuran untuk foto ini</option>
                      {inspection.measurements
                        .filter((item) => item.category === photo.section)
                        .map((item) => (
                          <option
                            key={item.id}
                            value={item.id}
                            disabled={
                              inspection.photos.filter((other) => other.measurement_id === item.id && other.id !== photo.id)
                                .length >= 2
                            }
                          >
                            {item.label}
                          </option>
                        ))}
                    </select>
                  )}

                  {photo.section === 'ISSUE' &&
                    (inspection.issues.length === 0 ? (
                      <p className="empty-inline">
                        Belum ada issue. <button type="button" className="text-action" onClick={goIssues}>Buat dulu di tab Issues</button>
                      </p>
                    ) : (
                      <select
                        aria-label="Tautkan issue"
                        value={photo.issue_id || ''}
                        onChange={(event) =>
                          void run(
                            () => api.patchPhoto(photo.id, { issue_id: event.target.value || null }),
                            'Tautan issue diperbarui.',
                          )
                        }
                      >
                        <option value="">Issue belum dipilih</option>
                        {inspection.issues.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.defect_type}
                          </option>
                        ))}
                      </select>
                    ))}
                </div>

                <div className="photo-controls">
                  <button type="button" disabled={index === 0} onClick={() => void reorder(photo, ordered[index - 1]!)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === ordered.length - 1}
                    onClick={() => void reorder(photo, ordered[index + 1]!)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => void run(() => api.patchPhoto(photo.id, { rotate_degrees: 90 }), 'Foto diputar.')}
                  >
                    Putar
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => {
                      askConfirm({
                        title: 'Hapus Foto?',
                        message: 'Apakah Anda yakin ingin menghapus foto ini dari sistem? Foto akan dihapus permanen dari galeri dan laporan.',
                        confirmText: 'Hapus Foto',
                        onConfirm: () => void run(() => api.deletePhoto(photo.id), 'Foto dihapus.'),
                      })
                    }}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* WIZARD MODAL */}
      {wizardOpen && (
        <div
          className="layout-wizard-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setWizardOpen(false)
          }}
        >
          <section className="layout-wizard" role="dialog" aria-modal="true" aria-labelledby="layout-wizard-title">
            <header className="layout-wizard-top">
              <span>
                LANGKAH {wizardStep === 'layout' ? '1' : '2'} DARI 2 ·{' '}
                {wizardStep === 'layout' ? 'PILIH TATA LETAK' : 'ISI SLOT FOTO'}
              </span>
              <button type="button" aria-label="Tutup pemilih layout" onClick={() => setWizardOpen(false)}>
                ×
              </button>
            </header>
            <div className="layout-wizard-body">
              <h2 id="layout-wizard-title">
                {wizardStep === 'layout' ? 'Pilih template halaman foto' : 'Sesuaikan foto dan caption'}
              </h2>
              <p>
                {wizardStep === 'layout'
                  ? 'Pilih jumlah foto untuk satu halaman. Foto tetap maksimal dua kolom; semakin sedikit slot, ukuran cetaknya semakin besar.'
                  : 'Pilih foto yang sudah diunggah atau klik langsung kotak slot untuk unggah foto baru. Caption otomatis mengikuti foto dan dapat diedit di galeri.'}
              </p>
              {wizardStep === 'layout' ? (
                <>
                  <label className="layout-section-select">
                    Section halaman
                    <select
                      value={wizardSection}
                      onChange={(event) => {
                        setWizardSection(event.target.value)
                        setTemplateId(null)
                      }}
                    >
                      {pageableSections.map((item) => (
                        <option key={item} value={item}>
                          {sectionLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="layout-category-tabs" role="tablist" aria-label="Kategori layout">
                    {categoryOptions.map((item) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={category === item}
                        className={category === item ? 'active' : ''}
                        key={item}
                        onClick={() => setCategory(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className="layout-template-grid">
                    {visibleLayouts.map((layout) => (
                      <button
                        type="button"
                        className={`layout-template-card${templateId === layout.id ? ' selected' : ''}`}
                        key={layout.id}
                        aria-pressed={templateId === layout.id}
                        onClick={() => setTemplateId(layout.id)}
                      >
                        <strong>
                          {layout.code} · {layout.title}
                        </strong>
                        <span
                          className="layout-template-preview"
                          style={{
                            gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                          }}
                        >
                          {Array.from({ length: layout.photo_count }, (_, slot) => (
                            <i key={slot} />
                          ))}
                        </span>
                        <span>{layout.description}</span>
                        <small>Area tabel 18 cm · foto maks. {layout.max_photo_height_cm} cm tinggi</small>
                      </button>
                    ))}
                  </div>
                  {!visibleLayouts.length && <p className="empty-inline">Belum ada template untuk section ini.</p>}
                </>
              ) : (
                (() => {
                  const page = photoPages.find((item) => item.id === activePageId)
                  const layout = page ? getLayout(page.template_id) : undefined
                  return page && layout ? (
                    <>
                      {renderPageSlots(page, layout, true)}
                      <p className="layout-print-note">
                        Saat dicetak: tabel selebar area isi Word, rata tengah, maksimal dua kolom, dan foto tidak dipotong.
                      </p>
                    </>
                  ) : (
                    <p role="alert">Halaman tidak ditemukan. Tutup lalu buka kembali pemilih layout.</p>
                  )
                })()
              )}
            </div>
            <footer className="layout-wizard-footer">
              <span>
                {wizardStep === 'layout'
                  ? `Section: ${sectionLabel(wizardSection)}`
                  : `${photoPages.find((item) => item.id === activePageId)?.photo_ids.filter(Boolean).length || 0} slot terisi`}
              </span>
              <div>
                {wizardStep === 'slots' && (
                  <button type="button" className="small-action" disabled={pageSaving} onClick={() => setWizardStep('layout')}>
                    Kembali
                  </button>
                )}
                {wizardStep === 'layout' ? (
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!templateId || pageSaving}
                    onClick={() => void continueToSlots()}
                  >
                    {pageSaving ? 'Menyimpan…' : 'Lanjutkan'}
                  </button>
                ) : (
                  <button type="button" className="primary-action" onClick={() => setWizardOpen(false)}>
                    Selesai
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      )}

      {/* SINGLE PHOTO VISION MODAL */}
      {activeModalPhoto && (
        <div
          className="photo-lightbox-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModalPhoto(null)
          }}
        >
          <div className="photo-modal-card">
            <header className="photo-modal-header">
              <div>
                <span className="section-kicker">INSPECTRA VISION AI · PRATINJAU FOTO</span>
                <h3 id="photo-modal-title">{sectionLabel(activeModalPhoto.section)}</h3>
              </div>
              <button
                type="button"
                className="photo-modal-close"
                onClick={() => setActiveModalPhoto(null)}
                aria-label="Tutup pratinjau foto"
              >
                ✕
              </button>
            </header>

            <div className="photo-modal-content">
              {/* Left Column: Image View */}
              <div className="photo-modal-image-col">
                <img
                  src={`/api/photos/${activeModalPhoto.id}/file?v=${inspection.revision}`}
                  alt={activeModalPhoto.caption || 'Foto penuh'}
                  className="photo-modal-img"
                />
                <div className="photo-modal-caption-bar">
                  <strong>Caption Saat Ini:</strong>
                  <p>{activeModalPhoto.caption || '(Belum ada keterangan/caption)'}</p>
                </div>
              </div>

              {/* Right Column: AI Vision Panel */}
              <div className="photo-modal-vision-col">
                <div className="photo-vision-header">
                  <h4>🔍 Analisis Visual AI</h4>
                  <p>Model mengevaluasi kondisi fisik kayu, finishing, ketajaman foto, dan menyarankan caption.</p>
                </div>

                <div className="photo-vision-actions">
                  <button
                    type="button"
                    className="primary-action photo-analyze-btn"
                    disabled={analyzingPhoto}
                    onClick={() => handleRunSingleAnalysis(activeModalPhoto)}
                  >
                    {analyzingPhoto ? '⏳ Sedang Menganalisis Visual...' : '🔍 Pindai Visual dengan AI'}
                  </button>

                  <button
                    type="button"
                    className="small-action photo-copilot-link"
                    onClick={() => handleOpenInCopilot(activeModalPhoto)}
                    title="Buka percakapan interaktif dengan foto ini di Co-pilot"
                  >
                    💬 Diskusi di Co-pilot
                  </button>
                </div>

                {analysisError && (
                  <div className="photo-vision-error" role="alert">
                    ⚠️ {analysisError}
                  </div>
                )}

                {photoAnalysis && (
                  <div className="photo-vision-result">
                    <div className="vision-result-status">
                      <span
                        className={`vision-badge ${photoAnalysis.defectDetected ? 'defect' : 'pass'}`}
                      >
                        {photoAnalysis.defectDetected
                          ? `⚠️ Cacat Terdeteksi (${photoAnalysis.severity || 'MAJOR'})`
                          : '✅ Kondisi Normal / Lulus'}
                      </span>
                      {photoAnalysis.defectType && (
                        <strong>{photoAnalysis.defectType}</strong>
                      )}
                    </div>

                    <div className="vision-findings-box">
                      <strong>Temuan Visual:</strong>
                      <p>{photoAnalysis.findings}</p>
                    </div>

                    {photoAnalysis.captionSuggestion && (
                      <div className="vision-caption-box">
                        <div className="caption-box-head">
                          <strong>Saran Caption Resmi:</strong>
                          <button
                            type="button"
                            className="apply-caption-btn"
                            disabled={appliedCaptions[activeModalPhoto.id]}
                            onClick={() =>
                              handleApplySuggestedCaption(activeModalPhoto.id, photoAnalysis.captionSuggestion)
                            }
                          >
                            {appliedCaptions[activeModalPhoto.id] ? '✓ Caption Diterapkan' : '✓ Gunakan Caption Ini'}
                          </button>
                        </div>
                        <p>"{photoAnalysis.captionSuggestion}"</p>
                      </div>
                    )}

                    {photoAnalysis.defectDetected && photoAnalysis.defectType && (
                      <div className="vision-issue-box">
                        <h5>Rekomendasi Penanganan Cacat:</h5>
                        {photoAnalysis.cause && (
                          <p>
                            <strong>Penyebab (Cause):</strong> {photoAnalysis.cause}
                          </p>
                        )}
                        {photoAnalysis.repair && (
                          <p>
                            <strong>Perbaikan (Repair):</strong> {photoAnalysis.repair}
                          </p>
                        )}
                        {photoAnalysis.cap && (
                          <p>
                            <strong>Pencegahan (CAP):</strong> {photoAnalysis.cap}
                          </p>
                        )}

                        <button
                          type="button"
                          className="add-to-issues-btn"
                          onClick={() => handleAddIssueFromVision(photoAnalysis, activeModalPhoto)}
                        >
                          ➕ Tambahkan ke Temuan Cacat (Issues)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAGE AUDIT MODAL */}
      {auditModalPage && (
        <div
          className="photo-lightbox-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAuditModalPage(null)
          }}
        >
          <div className="page-audit-modal-card">
            <header className="photo-modal-header">
              <div>
                <span className="section-kicker">AUDIT TATA LETAK HALAMAN · LEAD QC AUDITOR</span>
                <h3 id="audit-modal-title">
                  {sectionLabel(auditModalPage.page.section)} — {auditModalPage.layout.code} ({auditModalPage.layout.title})
                </h3>
              </div>
              <button
                type="button"
                className="photo-modal-close"
                onClick={() => setAuditModalPage(null)}
                aria-label="Tutup audit halaman"
              >
                ✕
              </button>
            </header>

            <div className="page-audit-body">
              {auditingPage && (
                <div className="audit-loading-state">
                  <div className="audit-spinner" />
                  <h4>Sedang mengaudit seluruh foto dalam halaman ini...</h4>
                  <p>Memeriksa keselarasan tema, pencahayaan, kualitas caption, dan kesiapan cetak laporan Word ekspor.</p>
                </div>
              )}

              {auditError && (
                <div className="photo-vision-error" role="alert">
                  ⚠️ {auditError}
                </div>
              )}

              {pageAuditResult && (
                <>
                  <div className="audit-summary-banner">
                    <div className="audit-status-strip">
                      <span className={`audit-badge ${pageAuditResult.overallStatus.toLowerCase()}`}>
                        {pageAuditResult.overallStatus === 'PASS'
                          ? '✅ MEMENUHI STANDAR (PASS)'
                          : pageAuditResult.overallStatus === 'WARNING'
                          ? '⚠️ PERLU PERHATIAN (WARNING)'
                          : '❌ BELUM MEMENUHI (FAIL)'}
                      </span>
                      <span>Kualitas Lighting: <strong>{pageAuditResult.lightingQuality}</strong></span>
                      <span>Kelengkapan: <strong>{pageAuditResult.layoutCompleteness}</strong></span>
                    </div>
                    <p className="audit-summary-text">{pageAuditResult.summary}</p>
                  </div>

                  <h4 className="audit-subheading">Evaluasi Tiap Slot Foto:</h4>
                  <div className="audit-slots-grid">
                    {pageAuditResult.feedbackPerPhoto.map((fb) => {
                      const photo = fb.photoId ? inspection.photos.find((p) => p.id === fb.photoId) : null
                      return (
                        <div className={`audit-slot-card ${fb.status.toLowerCase()}`} key={fb.slot}>
                          <div className="audit-slot-head">
                            <strong>Slot {fb.slot}</strong>
                            <span className={`audit-badge mini ${fb.status.toLowerCase()}`}>{fb.status}</span>
                          </div>
                          {photo && (
                            <div className="audit-slot-thumb">
                              <img
                                src={`/api/photos/${photo.id}/file?v=${inspection.revision}`}
                                alt={photo.caption || `Slot ${fb.slot}`}
                              />
                            </div>
                          )}
                          <p className="audit-slot-notes">{fb.notes}</p>
                          {fb.suggestedCaption && photo && (
                            <div className="audit-caption-suggest">
                              <small>Saran: "{fb.suggestedCaption}"</small>
                              <button
                                type="button"
                                className="apply-caption-btn-mini"
                                disabled={appliedCaptions[photo.id]}
                                onClick={() => handleApplySuggestedCaption(photo.id, fb.suggestedCaption!)}
                              >
                                {appliedCaptions[photo.id] ? '✓ Diterapkan' : 'Terapkan'}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {pageAuditResult.recommendations.length > 0 && (
                    <div className="audit-recommendations">
                      <h4>Rekomendasi Tindakan Pemeriksa:</h4>
                      <ul>
                        {pageAuditResult.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <footer className="page-audit-footer">
              <button
                type="button"
                className="small-action"
                disabled={auditingPage}
                onClick={() => handleStartPageAudit(auditModalPage.page, auditModalPage.layout)}
              >
                Audit Ulang
              </button>
              <button type="button" className="primary-action" onClick={() => setAuditModalPage(null)}>
                Selesai Ditinjau
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
