import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzePhoto,
  analyzePhotoLocally,
  auditPhotoPage,
  auditPhotoPageLocally,
  blobToDataUrl,
  askCopilot,
  parseChatCompletionResponse,
} from '../src/services/aiService.ts'

test('blobToDataUrl converts Blob to valid Data URL', async () => {
  const blob = new Blob(['sample-image-content'], { type: 'image/jpeg' })
  const dataUrl = await blobToDataUrl(blob)
  assert.ok(dataUrl.startsWith('data:image/jpeg;base64,'))
})

test('parseChatCompletionResponse parses standard single JSON object', () => {
  const raw = JSON.stringify({
    choices: [{ message: { content: 'Analisis visual normal.' } }],
  })
  assert.equal(parseChatCompletionResponse(raw), 'Analisis visual normal.')
})

test('parseChatCompletionResponse parses SSE streaming chunks from 9Router', () => {
  const sseRaw = [
    'data: {"choices":[{"delta":{"role":"assistant"}}]}',
    'data: {"choices":[{"delta":{"reasoning_content":"Memeriksa foto furnitur..."}}]}',
    'data: {"choices":[{"delta":{"content":"Ditemukan "}}]}',
    'data: {"choices":[{"delta":{"content":"cacat Crack pada kaki."}}]}',
    'data: [DONE]',
  ].join('\n\n')

  const parsed = parseChatCompletionResponse(sseRaw)
  assert.equal(parsed, 'Ditemukan cacat Crack pada kaki.')
})

test('parseChatCompletionResponse falls back to reasoning if delta content is empty', () => {
  const sseRaw = [
    'data: {"choices":[{"delta":{"reasoning_content":"Hanya ada penalaran"}}]}',
    'data: [DONE]',
  ].join('\n\n')

  const parsed = parseChatCompletionResponse(sseRaw)
  assert.equal(parsed, 'Hanya ada penalaran')
})

test('analyzePhoto local analysis identifies defect when caption indicates crack or issue', async () => {
  const mockDefects = [
    {
      id: 'def-1',
      name: 'Crack',
      aliases: ['retak', 'pecah'],
      default_causes: ['Kayu belum kering sempurna'],
      default_repairs: ['Suntik lem kayu khusus'],
      default_cap: ['Cek oven kiln sebelum rakit'],
      severity: 'MAJOR',
    },
  ]

  const result = await analyzePhoto('data:image/jpeg;base64,mockdata', {
    photoId: 'photo-1',
    caption: 'Retak pada sambungan kaki depan',
    section: 'ISSUE',
    defects: mockDefects,
    forceLocal: true,
  })

  assert.equal(result.defectDetected, true)
  assert.equal(result.defectType, 'Crack')
  assert.equal(result.severity, 'MAJOR')
  assert.equal(result.cause, 'Kayu belum kering sempurna')
  assert.equal(result.repair, 'Suntik lem kayu khusus')
  assert.equal(result.cap, 'Cek oven kiln sebelum rakit')
})

test('analyzePhoto local analysis marks normal product photo as PASS with recommended caption', async () => {
  const result = await analyzePhoto('data:image/jpeg;base64,mockdata', {
    photoId: 'photo-2',
    caption: '',
    section: 'PRODUCT_VIEW',
    forceLocal: true,
  })

  assert.equal(result.defectDetected, false)
  assert.equal(result.severity, 'NONE')
  assert.equal(result.captionSuggestion, 'Tampak keseluruhan produk (Product View)')
  assert.ok(result.findings.length > 0)
})

test('analyzePhotoLocally direct call produces identical consistent result', () => {
  const res = analyzePhotoLocally('PRODUCT_VIEW', 'Tampak depan meja')
  assert.equal(res.defectDetected, false)
  assert.equal(res.captionSuggestion, 'Tampak depan meja')
})

test('auditPhotoPage detects empty page and returns FAIL status', async () => {
  const page = {
    id: 'page-1',
    section: 'PRODUCT_VIEW',
    template_id: 'pv-4',
    photo_ids: [null, null, null, null],
  }
  const layout = {
    id: 'pv-4',
    code: 'PV-04',
    title: '4-Grid Tampak Produk',
    columns: 2,
    rows: 2,
    photo_count: 4,
    max_photo_height_cm: 10,
    sections: ['PRODUCT_VIEW'],
  }

  const audit = await auditPhotoPage(page, [], layout, null, [], { forceLocal: true })
  assert.equal(audit.overallStatus, 'FAIL')
  assert.ok(audit.summary.includes('masih kosong'))
  assert.equal(audit.feedbackPerPhoto.length, 4)
  assert.equal(audit.feedbackPerPhoto[0].status, 'WARNING')
})

test('auditPhotoPage flags missing captions and partial slots as WARNING', async () => {
  const photos = [
    {
      id: 'p-1',
      inspection_id: 'i-1',
      section: 'PRODUCT_VIEW',
      caption: '', // missing caption
      sort_order: 1,
      file_path: 'p1.jpg',
      created_at: '2026-10-24',
    },
    {
      id: 'p-2',
      inspection_id: 'i-1',
      section: 'PRODUCT_VIEW',
      caption: 'Tampak samping produk',
      sort_order: 2,
      file_path: 'p2.jpg',
      created_at: '2026-10-24',
    },
  ]

  const page = {
    id: 'page-1',
    section: 'PRODUCT_VIEW',
    template_id: 'pv-4',
    photo_ids: ['p-1', 'p-2', null, null],
  }
  const layout = {
    id: 'pv-4',
    code: 'PV-04',
    title: '4-Grid Tampak Produk',
    columns: 2,
    rows: 2,
    photo_count: 4,
    max_photo_height_cm: 10,
    sections: ['PRODUCT_VIEW'],
  }

  const audit = await auditPhotoPage(page, photos, layout, null, [], { forceLocal: true })
  assert.equal(audit.overallStatus, 'WARNING')
  // slot 1 has missing caption
  assert.equal(audit.feedbackPerPhoto[0].status, 'WARNING')
  assert.ok(audit.feedbackPerPhoto[0].suggestedCaption?.length > 0)
  // slot 2 is ok
  assert.equal(audit.feedbackPerPhoto[1].status, 'OK')
  // slot 3 and 4 are empty
  assert.equal(audit.feedbackPerPhoto[2].status, 'WARNING')
})

test('auditPhotoPage returns PASS when all slots are filled with captions', async () => {
  const photos = [
    {
      id: 'p-1',
      inspection_id: 'i-1',
      section: 'PRODUCT_VIEW',
      caption: 'Tampak depan produk',
      sort_order: 1,
      file_path: 'p1.jpg',
      created_at: '2026-10-24',
    },
    {
      id: 'p-2',
      inspection_id: 'i-1',
      section: 'PRODUCT_VIEW',
      caption: 'Tampak belakang produk',
      sort_order: 2,
      file_path: 'p2.jpg',
      created_at: '2026-10-24',
    },
  ]

  const page = {
    id: 'page-1',
    section: 'PRODUCT_VIEW',
    template_id: 'pv-2',
    photo_ids: ['p-1', 'p-2'],
  }
  const layout = {
    id: 'pv-2',
    code: 'PV-02',
    title: '2-Grid Tampak Produk',
    columns: 2,
    rows: 1,
    photo_count: 2,
    max_photo_height_cm: 12,
    sections: ['PRODUCT_VIEW'],
  }

  const audit = await auditPhotoPage(page, photos, layout, null, [], { forceLocal: true })
  assert.equal(audit.overallStatus, 'PASS')
  assert.equal(audit.feedbackPerPhoto[0].status, 'OK')
  assert.equal(audit.feedbackPerPhoto[1].status, 'OK')
  assert.ok(audit.recommendations.length > 0)
})

test('askCopilot includes image attachment note in local fallback response', async () => {
  const reply = await askCopilot(
    'Cek foto ini',
    null,
    [],
    [],
    'data:image/jpeg;base64,mockimage',
    { forceLocal: true },
  )
  assert.ok(reply.text.includes('Foto Terlampir Diperiksa'))
})
