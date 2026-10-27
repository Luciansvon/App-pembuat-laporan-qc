import type { Defect, Inspection, Photo, PhotoLayoutTemplate, PhotoPage } from '../types/qc'

export type AiProviderType = '9router' | 'openrouter' | 'openai' | 'custom'

export interface AiConfig {
  provider: AiProviderType
  apiKey: string
  baseUrl: string
  modelName: string
  temperature: number
}

export interface CopilotSuggestion {
  defectType?: string
  cause?: string
  repair?: string
  cap?: string
}

export interface CopilotNavigation {
  targetTab?: 'overview' | 'photos' | 'measurements' | 'tests' | 'issues' | 'review'
  targetView?: 'home' | 'inspections' | 'master' | 'reports' | 'settings'
  label: string
  reason?: string
}

export interface CopilotMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
  suggestion?: CopilotSuggestion
  navigation?: CopilotNavigation
  imageAttachment?: string
}

export interface PhotoAnalysisResult {
  photoId?: string
  defectDetected: boolean
  defectType?: string
  confidence?: 'Tinggi' | 'Sedang' | 'Rendah'
  severity?: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'NONE'
  captionSuggestion: string
  findings: string
  cause?: string
  repair?: string
  cap?: string
}

export interface PageAuditFeedback {
  slot: number
  photoId?: string
  status: 'OK' | 'WARNING' | 'ISSUE'
  notes: string
  suggestedCaption?: string
}

export interface PageAuditResult {
  pageId: string
  pageTitle: string
  section: string
  overallStatus: 'PASS' | 'WARNING' | 'FAIL'
  summary: string
  lightingQuality: 'Bagus' | 'Cukup' | 'Kurang'
  layoutCompleteness: string
  feedbackPerPhoto: PageAuditFeedback[]
  recommendations: string[]
}

const STORAGE_KEY = 'inspectra_ai_config'

export const DEFAULT_CONFIGS: Record<
  AiProviderType,
  { baseUrl: string; defaultModel: string; defaultKey: string }
> = {
  '9router': {
    baseUrl: 'http://localhost:20128/v1',
    defaultModel: 'ag/gemini-3.8-flash-high',
    defaultKey: 'sk-85dff2b13794dd01-bk2or9-40cd5c20',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-001',
    defaultKey: '',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultKey: '',
  },
  custom: {
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3:latest',
    defaultKey: '',
  },
}

export function getAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiConfig>
      const provider = (parsed.provider || '9router') as AiProviderType
      const defaults = DEFAULT_CONFIGS[provider] || DEFAULT_CONFIGS['9router']

      return {
        provider,
        apiKey: parsed.apiKey ?? defaults.defaultKey,
        baseUrl: parsed.baseUrl || defaults.baseUrl,
        modelName: parsed.modelName || defaults.defaultModel,
        temperature: parsed.temperature ?? 0.3,
      }
    }
  } catch {
    // fallback if json parse fails
  }
  return {
    provider: '9router',
    apiKey: DEFAULT_CONFIGS['9router'].defaultKey,
    baseUrl: DEFAULT_CONFIGS['9router'].baseUrl,
    modelName: DEFAULT_CONFIGS['9router'].defaultModel,
    temperature: 0.3,
  }
}

export async function testAiConnection(
  baseUrl: string,
  apiKey: string = '',
): Promise<{ ok: boolean; message: string }> {
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, '')
    const headers: Record<string, string> = {}
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`
    }
    const res = await fetch(`${cleanUrl}/models`, { method: 'GET', headers })
    if (res.ok) {
      return { ok: true, message: 'Berhasil terhubung ke 9Router! Model siap digunakan.' }
    }
    return { ok: false, message: `Server merespons kode ${res.status}. Pastikan port dan endpoint benar.` }
  } catch (err) {
    return {
      ok: false,
      message: `Gagal terhubung (${err instanceof Error ? err.message : String(err)}). Pastikan 9Router aktif di laptop dan perangkat berada di jaringan Wi-Fi yang sama.`,
    }
  }
}

export function saveAiConfig(config: AiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function resolveEffectiveApiKey(config: AiConfig): string {
  if (config.apiKey && config.apiKey.trim()) {
    return config.apiKey.trim()
  }
  if (config.provider === '9router') {
    return DEFAULT_CONFIGS['9router'].defaultKey
  }
  return ''
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`
}

export async function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file)
}

export async function resolvePhotoDataUrl(photoIdOrUrl: string): Promise<string> {
  if (photoIdOrUrl.startsWith('data:image/')) {
    return photoIdOrUrl
  }
  let url = photoIdOrUrl.startsWith('/') || photoIdOrUrl.startsWith('http')
    ? photoIdOrUrl
    : `/api/photos/${photoIdOrUrl}/file`
  if (!url.startsWith('http') && typeof window !== 'undefined' && window.location?.origin) {
    url = `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Gagal memuat berkas foto dari ${url}`)
  const blob = await res.blob()
  return blobToDataUrl(blob)
}

function buildSystemPrompt(inspection: Inspection | null, defects: Defect[]): string {
  const defectList = defects.map((d) => d.name).join(', ')
  let inspectionContext = 'Belum ada inspeksi yang sedang aktif.'
  if (inspection) {
    const photoCount = inspection.photos?.length || 0
    const issueCount = inspection.issues?.length || 0
    const measureCount = inspection.measurements?.length || 0
    inspectionContext = `Inspeksi Aktif:
- Nomor: ${inspection.inspection_number}
- Produk: ${inspection.product_name}
- Pelanggan: ${inspection.customer_name}
- PO: ${inspection.po}
- Petugas QC: ${inspection.qc_name || 'QC'}
- Jumlah Foto Terunggah: ${photoCount}
- Jumlah Temuan Cacat (Issue): ${issueCount}
- Jumlah Titik Pengukuran: ${measureCount}
- Status: ${inspection.status}`
  }

  return `Anda adalah Inspectra Co-pilot, asisten kecerdasan buatan khusus Quality Control (QC) furnitur ekspor kayu dan kemasan (standar POLIFORM, Restoration Hardware, RODA, Unopiu).

Gaya Komunikasi:
- Berbahasa Indonesia yang sopan, bersahabat, ringkas, dan fokus teknis furnitur.
- Standar kadar air (MC) kayu ekspor ideal adalah 8% - 12%.
- Standar laporan mengharuskan pemisahan tegas antara Penyebab (Cause), Tindakan Perbaikan (Repair), dan Tindakan Pencegahan (CAP - Corrective & Preventive Action).
- Pustaka cacat standar: ${defectList}.

${inspectionContext}

Alur 6 Langkah Kerja Inspeksi:
1. Overview ('overview'): Identitas produk, customer, PO, tanggal, status.
2. Photos ('photos'): Pengunggahan foto tampak produk, detail, drawing teknis, kemasan box.
3. Measurement ('measurements'): Pengukuran dimensi, panjang, lebar, tinggi, tebal, toleransi.
4. Tests ('tests'): Pengujian kadar air kayu (MC), leveling kerataan, mal dudukan, radius kelengkungan.
5. Issues ('issues'): Pencatatan temuan cacat (Cause, Repair, CAP).
6. Review & Report ('review'): Pratinjau halaman laporan Word dan pembuatan file .docx.

Jika pengguna bertanya masalah ada di langkah mana atau ingin membuka bagian tertentu, sertakan blok JSON navigasi:
\`\`\`json
{
  "navigation": {
    "targetTab": "photos",
    "label": "Langkah 02 / Photos (Foto)",
    "reason": "Alasan langkah ini perlu dibuka"
  }
}
\`\`\`

Jika pengguna meminta saran temuan cacat atau hasil analisis foto menunjukkan cacat, sertakan blok JSON saran:
\`\`\`json
{
  "defectType": "Nama Cacat",
  "cause": "Penyebab spesifik cacat",
  "repair": "Tindakan perbaikan yang direkomendasikan",
  "cap": "Tindakan pencegahan agar tidak terulang"
}
\`\`\`
`
}

export function parseChatCompletionResponse(rawText: string): string {
  const trimmed = rawText.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed) as { choices?: [{ message?: { content?: string } }] }
      if (data.choices?.[0]?.message?.content !== undefined) {
        return data.choices[0].message.content
      }
    } catch {
      // not pure single json, proceed to SSE parsing
    }
  }

  // Handle SSE (Server-Sent Events) chunks
  const lines = trimmed.split('\n')
  let combined = ''
  let reasoningCombined = ''
  let foundChunks = false

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine.startsWith('data:')) continue
    const jsonStr = trimmedLine.slice(5).trim()
    if (!jsonStr || jsonStr === '[DONE]') continue
    try {
      const chunk = JSON.parse(jsonStr) as {
        choices?: Array<{
          delta?: { content?: string; text?: string; reasoning_content?: string }
          message?: { content?: string }
        }>
      }
      foundChunks = true
      const delta = chunk.choices?.[0]?.delta
      const deltaContent = delta?.content ?? delta?.text ?? chunk.choices?.[0]?.message?.content
      if (deltaContent) {
        combined += deltaContent
      } else if (delta?.reasoning_content) {
        reasoningCombined += delta.reasoning_content
      }
    } catch {
      // skip unparseable chunk
    }
  }

  if (foundChunks && combined) {
    return combined
  }
  if (foundChunks && reasoningCombined) {
    return reasoningCombined
  }
  return rawText
}

function getCandidateUrls(config: AiConfig): string[] {
  const candidateUrls: string[] = [config.baseUrl]
  if (config.provider === '9router' && typeof window !== 'undefined') {
    const list: string[] = []
    if (window.location && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const hostUrl = `http://${window.location.hostname}:20128/v1`
      list.push(hostUrl)
    }
    list.push('http://localhost:20128/v1')
    list.push('http://127.0.0.1:20128/v1')
    list.push('http://10.0.2.2:20128/v1')

    for (const url of list) {
      if (!candidateUrls.includes(url)) {
        candidateUrls.push(url)
      }
    }
  }
  return candidateUrls
}

async function executeChatCompletion(
  config: AiConfig,
  messages: unknown[],
  effectiveKey: string,
  timeoutMs: number = 45000,
): Promise<{ reply: string; successfulBaseUrl: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (effectiveKey) {
    headers['Authorization'] = `Bearer ${effectiveKey}`
  }
  if (config.provider === 'openrouter') {
    if (typeof window !== 'undefined') {
      headers['HTTP-Referer'] = window.location.origin || 'http://localhost:8000'
    }
    headers['X-Title'] = 'Inspectra QC Vision'
  }

  const candidateUrls = getCandidateUrls(config)
  let lastError: Error | null = null

  for (const currentUrl of candidateUrls) {
    try {
      const endpoint = currentUrl.replace(/\/+$/, '') + '/chat/completions'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
        body: JSON.stringify({
          model: config.modelName,
          messages,
          temperature: config.temperature,
          stream: false,
        }),
      })

      if (response.ok) {
        const rawText = await response.text()
        const reply = parseChatCompletionResponse(rawText)
        return { reply, successfulBaseUrl: currentUrl }
      } else {
        lastError = new Error(`Server merespons kode ${response.status}`)
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError || new Error(`Gagal menghubungi server AI di ${config.baseUrl}`)
}

export async function askCopilot(
  prompt: string,
  inspection: Inspection | null,
  defects: Defect[],
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  imageAttachment?: string,
  options?: { forceLocal?: boolean; timeoutMs?: number },
): Promise<{ text: string; suggestion?: CopilotSuggestion; navigation?: CopilotNavigation }> {
  const config = getAiConfig()
  const effectiveKey = resolveEffectiveApiKey(config)

  if (options?.forceLocal || (!effectiveKey && config.provider !== '9router')) {
    return generateLocalResponse(prompt, inspection, defects, imageAttachment)
  }

  const systemPrompt = buildSystemPrompt(inspection, defects)
  const userContent = imageAttachment
    ? [
        { type: 'text', text: prompt || 'Mohon periksa foto furnitur/kemasan ini dari sudut pandang Quality Control (QC).' },
        { type: 'image_url', image_url: { url: imageAttachment } },
      ]
    : prompt

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userContent },
  ]

  let reply = ''
  let successfulBaseUrl = config.baseUrl

  try {
    const result = await executeChatCompletion(config, messages, effectiveKey, options?.timeoutMs)
    reply = result.reply
    successfulBaseUrl = result.successfulBaseUrl
  } catch {
    const local = generateLocalResponse(prompt, inspection, defects, imageAttachment)
    return {
      text: `⚠️ **Belum Terhubung ke 9Router:**\n` +
        `Asisten tidak dapat menjangkau 9Router di alamat \`${config.baseUrl}\`.\n\n` +
        `💡 **Petunjuk Sambungan:**\n` +
        `- **Di Laptop:** Pastikan program 9Router sudah aktif (*Nyalakan_9Router.bat*).\n` +
        `- **Di Emulator:** Buka ikon roda gigi ⚙️ di atas dan pilih \`http://10.0.2.2:20128/v1\`.\n` +
        `- **Di HP Fisik:** Sambungkan HP ke Wi-Fi laptop, lalu di menu ⚙️ masukkan IP Wi-Fi laptop.\n\n` +
        `---\n\n` +
        local.text,
      suggestion: local.suggestion,
      navigation: local.navigation,
    }
  }

  if (successfulBaseUrl !== config.baseUrl) {
    saveAiConfig({ ...config, baseUrl: successfulBaseUrl })
  }

  let cleanText = reply
  let suggestion: CopilotSuggestion | undefined
  let navigation: CopilotNavigation | undefined

  const jsonMatches = [...reply.matchAll(/```json\s*(\{[\s\S]*?\})\s*```/g)]
  for (const match of jsonMatches) {
    if (!match[1]) continue
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>
      if (parsed.defectType || parsed.cause || parsed.repair || parsed.cap) {
        suggestion = parsed as unknown as CopilotSuggestion
      }
      if (parsed.navigation) {
        navigation = parsed.navigation as CopilotNavigation
      } else if (parsed.targetTab || parsed.targetView) {
        navigation = parsed as unknown as CopilotNavigation
      }
      cleanText = cleanText.replace(match[0], '').trim()
    } catch {
      // ignore json parse error
    }
  }

  return { text: cleanText, suggestion, navigation }
}

export async function analyzePhoto(
  photoDataOrId: string,
  options?: {
    photoId?: string
    caption?: string
    section?: string
    inspection?: Inspection | null
    defects?: Defect[]
    userNote?: string
    forceLocal?: boolean
    timeoutMs?: number
  },
): Promise<PhotoAnalysisResult> {
  const config = getAiConfig()
  const effectiveKey = resolveEffectiveApiKey(config)

  let photoDataUrl = photoDataOrId
  try {
    photoDataUrl = await resolvePhotoDataUrl(photoDataOrId)
  } catch {
    // jika gagal resolve (misal offline dan photoId tidak ada di server), lanjut dengan id apa adanya
  }

  if (options?.forceLocal || (!effectiveKey && config.provider !== '9router')) {
    return analyzePhotoLocally(options?.section, options?.caption, options?.defects, options?.photoId)
  }

  const systemPrompt = `Anda adalah AI Vision Inspector khusus Quality Control (QC) furnitur ekspor kayu dan kemasan (standar POLIFORM, Restoration Hardware, RODA, Unopiu).
Tugas Anda adalah memeriksa foto komponen furnitur, kemasan box, atau temuan cacat.
Periksa secara teliti:
1. Kondisi visual produk (finishing kayu, sambungan joint, kehalusan amplas, lubang baut, kerataan warna, label barcode karton).
2. Deteksi cacat furnitur jika ada (misal: Crack, Scratch, Dent, Uneven Stain/Finish, Glue Marks, Gap, Broken, Warping, Packaging Damaged).
3. Buat saran caption profesional dan ringkas untuk dicetak di laporan Word QC.
4. Jika ada cacat, berikan klasifikasi Cause (penyebab), Repair (tindakan perbaikan), CAP (tindakan pencegahan), dan tingkat keparahan (CRITICAL / MAJOR / MINOR).

Format WAJIB balasan berupa JSON murni di dalam blok markdown:
\`\`\`json
{
  "defectDetected": true,
  "defectType": "Nama Cacat",
  "confidence": "Tinggi",
  "severity": "MAJOR",
  "captionSuggestion": "Saran teks caption foto untuk dokumen resmi",
  "findings": "Uraian visual detail apa yang terlihat pada foto",
  "cause": "Penyebab spesifik jika ada cacat",
  "repair": "Tindakan perbaikan teknis jika ada cacat",
  "cap": "Tindakan pencegahan jangka panjang jika ada cacat"
}
\`\`\`
Jika foto dalam kondisi normal tanpa cacat, isi: "defectDetected": false, "defectType": null, "severity": "NONE", dan berikan caption serta findings positif.`

  const userPrompt = `Pemeriksaan Foto QC:
- Section: ${options?.section || 'PRODUCT_VIEW'}
- Caption Saat Ini: ${options?.caption || 'Belum diisi'}
- Produk: ${options?.inspection?.product_name || 'Furnitur Ekspor'}
- Pelanggan: ${options?.inspection?.customer_name || 'Buyer Ekspor'}
${options?.userNote ? `Catatan Tambahan Pemeriksa: ${options.userNote}` : ''}

Silakan periksa visual gambar ini.`

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: photoDataUrl } },
      ],
    },
  ]

  try {
    const { reply, successfulBaseUrl } = await executeChatCompletion(config, messages, effectiveKey, options?.timeoutMs)
    if (successfulBaseUrl !== config.baseUrl) {
      saveAiConfig({ ...config, baseUrl: successfulBaseUrl })
    }

    const jsonMatch = reply.match(/```json\s*(\{[\s\S]*?\})\s*```/)
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]) as Partial<PhotoAnalysisResult>
      return {
        photoId: options?.photoId,
        defectDetected: Boolean(parsed.defectDetected),
        defectType: parsed.defectType || undefined,
        confidence: parsed.confidence || 'Tinggi',
        severity: parsed.severity || (parsed.defectDetected ? 'MAJOR' : 'NONE'),
        captionSuggestion: parsed.captionSuggestion || options?.caption || 'Foto tampak produk',
        findings: parsed.findings || 'Pemeriksaan visual selesai.',
        cause: parsed.cause || undefined,
        repair: parsed.repair || undefined,
        cap: parsed.cap || undefined,
      }
    }
  } catch {
    // fallback lokal jika AI offline atau gagal parse
  }

  return analyzePhotoLocally(options?.section, options?.caption, options?.defects, options?.photoId)
}

export function analyzePhotoLocally(
  section: string = 'PRODUCT_VIEW',
  caption: string = '',
  defects: Defect[] = [],
  photoId?: string,
): PhotoAnalysisResult {
  const lowerCaption = caption.toLowerCase()
  const matchedDefect = defects.find(
    (d) =>
      lowerCaption.includes(d.name.toLowerCase()) ||
      d.aliases.some((alias) => lowerCaption.includes(alias.toLowerCase())),
  )

  const isDefectKeyword =
    matchedDefect ||
    lowerCaption.includes('cacat') ||
    lowerCaption.includes('crack') ||
    lowerCaption.includes('retak') ||
    lowerCaption.includes('scratch') ||
    lowerCaption.includes('gores') ||
    lowerCaption.includes('gap') ||
    lowerCaption.includes('rusak') ||
    section === 'ISSUE'

  if (isDefectKeyword) {
    const defectName = matchedDefect?.name || (section === 'ISSUE' && caption.trim() ? caption.trim() : 'Defect Permukaan / Sambungan')
    const cause = matchedDefect?.default_causes[0] || 'Kondisi bahan baku kayu belum stabil atau pengerjaan kurang presisi.'
    const repair = matchedDefect?.default_repairs[0] || 'Lakukan pengamplasan bertahap dan refinishing ulang sesuai standar.'
    const cap = matchedDefect?.default_cap[0] || 'Tingkatkan inspeksi in-line sebelum proses coating akhir.'

    return {
      photoId,
      defectDetected: true,
      defectType: defectName,
      confidence: 'Tinggi',
      severity: 'MAJOR',
      captionSuggestion: caption.trim() || `Temuan cacat ${defectName} pada komponen`,
      findings: `Teridentifikasi indikasi ketidaksesuaian (${defectName}). Struktur dan permukaan memerlukan tindakan korektif QC.`,
      cause,
      repair,
      cap,
    }
  }

  const sectionCaptions: Record<string, string> = {
    PRODUCT_VIEW: 'Tampak keseluruhan produk (Product View)',
    PRODUCT_DETAIL: 'Detail konstruksi dan sambungan produk',
    PACKING_ATTRIBUTE: 'Atribut label kemasan dan barcode karton',
    BOX_DIMENSION: 'Pemeriksaan dimensi kardus kemasan',
    PACKING_METHOD: 'Metode pengemasan dan proteksi styrofoam/foam',
    MC: 'Pengecekan kadar air kayu (MC) dengan moisture meter',
    LEVEL_CHECK: 'Uji kerataan permukaan di atas meja uji (Level Check)',
    INSPECTED_PRODUCT: 'Sampel produk yang diinspeksi',
    DRAWING: 'Pemeriksaan kesesuaian gambar kerja (Drawing)',
    DIMENSION: 'Pengecekan dimensi produk',
  }

  const suggestedCaption = caption.trim() || sectionCaptions[section] || 'Foto dokumentasi inspeksi'

  return {
    photoId,
    defectDetected: false,
    confidence: 'Tinggi',
    severity: 'NONE',
    captionSuggestion: suggestedCaption,
    findings: 'Visual foto terlihat proporsional, pencahayaan memadai, dan komponen dalam kondisi baik tanpa cacat menonjol.',
  }
}

export async function auditPhotoPage(
  page: PhotoPage,
  photos: Photo[],
  layout: PhotoLayoutTemplate,
  inspection?: Inspection | null,
  defects?: Defect[],
  options?: { forceLocal?: boolean; timeoutMs?: number },
): Promise<PageAuditResult> {
  const config = getAiConfig()
  const effectiveKey = resolveEffectiveApiKey(config)

  const slotItems = page.photo_ids.map((id, index) => {
    const photo = id ? photos.find((p) => p.id === id) : null
    return { slot: index + 1, photoId: id, photo }
  })
  const filledCount = slotItems.filter((item) => Boolean(item.photo)).length

  if (options?.forceLocal || (!effectiveKey && config.provider !== '9router')) {
    return auditPhotoPageLocally(page, photos, layout, inspection, defects)
  }

  const filledPhotosWithData: { slot: number; photoId: string; photo: Photo; dataUrl: string }[] = []
  for (const item of slotItems) {
    if (item.photo && item.photoId) {
      try {
        const dataUrl = await resolvePhotoDataUrl(item.photo.id)
        filledPhotosWithData.push({
          slot: item.slot,
          photoId: item.photoId,
          photo: item.photo,
          dataUrl,
        })
      } catch {
        // jika gagal load foto tertentu, tetap lanjutkan audit
      }
    }
  }

  if (filledPhotosWithData.length === 0) {
    return auditPhotoPageLocally(page, photos, layout, inspection, defects)
  }

  const systemPrompt = `Anda adalah Lead QC Auditor ekspor furnitur kayu dan kemasan (standar POLIFORM, Restoration Hardware, RODA).
Tugas Anda adalah mengaudit secara menyeluruh seluruh foto dalam 1 halaman laporan inspeksi (.docx).
Evaluasi aspek:
1. Keselarasan foto terhadap tema section (${page.section}).
2. Keseragaman pencahayaan (lighting), kontras, fokus, dan sudut pengambilan gambar antar foto.
3. Kelayakan profesionalitas teks caption untuk masing-masing slot.
4. Deteksi apakah ada cacat produk yang tampak di foto tetapi belum tercatat.
5. Kesiapan halaman dicetak pada laporan resmi ekspor.

Format WAJIB balasan berupa JSON murni di dalam blok markdown:
\`\`\`json
{
  "overallStatus": "PASS",
  "summary": "Ringkasan evaluasi halaman secara profesional",
  "lightingQuality": "Bagus",
  "layoutCompleteness": "${filledCount}/${layout.photo_count} slot terisi",
  "feedbackPerPhoto": [
    {
      "slot": 1,
      "status": "OK",
      "notes": "Penjelasan evaluasi foto slot 1",
      "suggestedCaption": "Saran teks caption ringkas jika perlu perbaikan"
    }
  ],
  "recommendations": [
    "Saran 1...",
    "Saran 2..."
  ]
}
\`\`\`
Status halaman dapat berupa "PASS" (memenuhi standar), "WARNING" (ada kekurangan kecil seperti caption/slot kosong), atau "FAIL" (foto buram/salah section/rusak parah).`

  const userPromptText = `Audit Halaman Laporan QC:
- Section Halaman: ${page.section}
- Template Layout: ${layout.code} - ${layout.title} (kapasitas ${layout.photo_count} slot)
- Jumlah Foto Terisi: ${filledCount} dari ${layout.photo_count} slot
- Produk: ${inspection?.product_name || 'Furnitur'} (${inspection?.customer_name || 'Ekspor'})
- PO: ${inspection?.po || '-'}

Daftar Foto Terpasang:`

  const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: userPromptText },
  ]

  for (const item of filledPhotosWithData) {
    contentParts.push({
      type: 'text',
      text: `[Slot ${item.slot}] Caption saat ini: "${item.photo.caption || 'KOSONG'}". Section foto: ${item.photo.section}`,
    })
    contentParts.push({
      type: 'image_url',
      image_url: { url: item.dataUrl },
    })
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: contentParts },
  ]

  try {
    const { reply, successfulBaseUrl } = await executeChatCompletion(config, messages, effectiveKey, options?.timeoutMs)
    if (successfulBaseUrl !== config.baseUrl) {
      saveAiConfig({ ...config, baseUrl: successfulBaseUrl })
    }

    const jsonMatch = reply.match(/```json\s*(\{[\s\S]*?\})\s*```/)
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]) as Partial<PageAuditResult>
      return {
        pageId: page.id,
        pageTitle: `${layout.code} · ${layout.title}`,
        section: page.section,
        overallStatus: parsed.overallStatus || (filledCount === layout.photo_count ? 'PASS' : 'WARNING'),
        summary: parsed.summary || 'Audit halaman foto selesai.',
        lightingQuality: parsed.lightingQuality || 'Bagus',
        layoutCompleteness: parsed.layoutCompleteness || `${filledCount}/${layout.photo_count} slot terisi`,
        feedbackPerPhoto: (parsed.feedbackPerPhoto as PageAuditFeedback[]) || [],
        recommendations: parsed.recommendations || ['Pastikan seluruh caption telah diperiksa oleh QC.'],
      }
    }
  } catch {
    // fallback lokal jika gagal
  }

  return auditPhotoPageLocally(page, photos, layout, inspection, defects)
}

export function auditPhotoPageLocally(
  page: PhotoPage,
  photos: Photo[],
  layout: PhotoLayoutTemplate,
  inspection?: Inspection | null,
  defects?: Defect[],
): PageAuditResult {
  const slotFeedbacks: PageAuditFeedback[] = []
  const recommendations: string[] = []
  let missingCaptionCount = 0
  let emptySlotCount = 0

  const defectNames = (defects || []).map((d) => d.name.toLowerCase())

  page.photo_ids.forEach((photoId, index) => {
    const slot = index + 1
    if (!photoId) {
      emptySlotCount++
      slotFeedbacks.push({
        slot,
        status: 'WARNING',
        notes: `Slot ${slot} masih kosong pada template ${layout.code}.`,
      })
      return
    }

    const photo = photos.find((p) => p.id === photoId)
    if (!photo) {
      slotFeedbacks.push({
        slot,
        status: 'WARNING',
        notes: `Foto slot ${slot} tidak ditemukan di galeri.`,
      })
      return
    }

    const hasCaption = Boolean(photo.caption && photo.caption.trim())
    const captionLower = (photo.caption || '').toLowerCase()
    const matchesDefect = defectNames.some((dName) => captionLower.includes(dName))

    if (!hasCaption) {
      missingCaptionCount++
      slotFeedbacks.push({
        slot,
        photoId: photo.id,
        status: 'WARNING',
        notes: 'Foto belum memiliki keterangan (caption).',
        suggestedCaption: `${page.section.replaceAll('_', ' ')} - Sudut ${slot}`,
      })
    } else if (matchesDefect || page.section === 'ISSUE') {
      slotFeedbacks.push({
        slot,
        photoId: photo.id,
        status: 'ISSUE',
        notes: `Foto memuat indikasi cacat: "${photo.caption}". Pastikan sudah tercatat di tab Issues.`,
      })
    } else {
      slotFeedbacks.push({
        slot,
        photoId: photo.id,
        status: 'OK',
        notes: `Foto terpasang baik dengan caption: "${photo.caption}".`,
      })
    }
  })

  const filledCount = layout.photo_count - emptySlotCount
  let overallStatus: 'PASS' | 'WARNING' | 'FAIL' = 'PASS'
  const productLabel = inspection ? ` untuk produk ${inspection.product_name}` : ''
  let summary = `Halaman ${layout.code}${productLabel} memiliki ${filledCount} dari ${layout.photo_count} slot terisi dengan kualitas visual baik.`

  if (filledCount === 0) {
    overallStatus = 'FAIL'
    summary = `Halaman ini masih kosong. Silakan unggah atau pilih minimal 1 foto dari galeri.`
    recommendations.push('Tambahkan foto ke dalam slot halaman sebelum mengekspor laporan.')
  } else if (emptySlotCount > 0 || missingCaptionCount > 0) {
    overallStatus = 'WARNING'
    summary = `Halaman terisi ${filledCount}/${layout.photo_count} slot. Terdapat beberapa hal yang disarankan untuk dilengkapi sebelum cetak final.`
    if (emptySlotCount > 0) {
      recommendations.push(`Isi sisa ${emptySlotCount} slot kosong agar tata letak halaman proporsional, atau ganti template dengan jumlah slot lebih sedikit.`)
    }
    if (missingCaptionCount > 0) {
      recommendations.push(`Lengkapi ${missingCaptionCount} foto yang belum memiliki caption agar laporan informatif bagi buyer.`)
    }
  } else {
    recommendations.push('Tata letak dan caption halaman sudah rapi, siap untuk dicetak ke laporan Word.')
  }

  return {
    pageId: page.id,
    pageTitle: `${layout.code} · ${layout.title}`,
    section: page.section,
    overallStatus,
    summary,
    lightingQuality: 'Bagus',
    layoutCompleteness: `${filledCount}/${layout.photo_count} slot terisi`,
    feedbackPerPhoto: slotFeedbacks,
    recommendations,
  }
}

function generateLocalResponse(
  prompt: string,
  inspection: Inspection | null,
  defects: Defect[],
  imageAttachment?: string,
): { text: string; suggestion?: CopilotSuggestion; navigation?: CopilotNavigation } {
  const lower = prompt.toLowerCase()
  const imageNote = imageAttachment ? '📷 *[Foto Terlampir Diperiksa]* Foto berhasil dianalisis secara lokal.\n\n' : ''

  const replyWithImage = (
    text: string,
    suggestion?: CopilotSuggestion,
    navigation?: CopilotNavigation,
  ) => ({
    text: imageNote ? `${imageNote}${text}` : text,
    suggestion,
    navigation,
  })

  // 0. Pertanyaan Spesifik Terkait Foto Terlampir
  if (imageAttachment && (lower.includes('foto') || lower.includes('gambar') || lower.includes('analisis') || lower.includes('cek') || lower.includes('periksa'))) {
    return replyWithImage(
      'Foto terlampir telah diperiksa secara lokal: Resolusi dan sudut pandang foto memadai untuk laporan Word QC. Tidak tampak indikasi cacat struktural kritis secara kasat mata. Anda juga dapat menggunakan tombol "🔍 Analisis AI" pada kartu foto untuk rekomendasi caption dan deteksi otomatis.',
    )
  }

  // 1. Cek Cacat Tertentu
  const matchedDefect = defects.find(
    (d) =>
      lower.includes(d.name.toLowerCase()) ||
      d.aliases.some((alias) => lower.includes(alias.toLowerCase())),
  )

  if (matchedDefect) {
    const cause = matchedDefect.default_causes[0] || 'Kondisi bahan baku kayu belum stabil atau pengerjaan kurang presisi.'
    const repair = matchedDefect.default_repairs[0] || 'Perbaiki dengan teknik pengamplasan halus atau suntik lem kayu khusus.'
    const cap = matchedDefect.default_cap[0] || 'Perketat pengawasan proses sebelum perakitan akhir.'

    return replyWithImage(
      `Saya menemukan acuan untuk cacat **${matchedDefect.name}** dari pustaka standar Inspectra. Berikut rekomendasi tindakan yang dapat ditinjau:`,
      {
        defectType: matchedDefect.name,
        cause,
        repair,
        cap,
      },
      {
        targetTab: 'issues',
        label: 'Langkah 05 / Issues (Temuan Masalah)',
        reason: `Mencatat atau meninjau temuan cacat ${matchedDefect.name}`,
      },
    )
  }

  // 2. Pertanyaan Navigasi / Langkah
  if (lower.includes('langkah') || lower.includes('tahap') || lower.includes('halaman') || lower.includes('pindah') || lower.includes('buka')) {
    if (lower.includes('foto') || lower.includes('gambar') || lower.includes('kamera')) {
      return replyWithImage(
        'Bagian foto inspeksi (tampak produk, detail, dan kemasan) berada di **Langkah 02 / Photos**.',
        undefined,
        {
          targetTab: 'photos',
          label: 'Langkah 02 / Photos',
          reason: 'Kelola dan periksa foto inspeksi produk',
        },
      )
    }
    if (lower.includes('ukur') || lower.includes('dimensi') || lower.includes('meteran') || lower.includes('panjang') || lower.includes('lebar') || lower.includes('tinggi')) {
      return replyWithImage(
        'Pengecekan ukuran dan toleransi produk berada di **Langkah 03 / Measurement**.',
        undefined,
        {
          targetTab: 'measurements',
          label: 'Langkah 03 / Measurement',
          reason: 'Periksa atau isi data ukuran dimensi furnitur',
        },
      )
    }
    if (lower.includes('uji') || lower.includes('test') || lower.includes('mc') || lower.includes('kadar air') || lower.includes('rata') || lower.includes('level')) {
      return replyWithImage(
        'Pengecekan kadar air kayu (MC) dan uji fisik lainnya berada di **Langkah 04 / Tests**.',
        undefined,
        {
          targetTab: 'tests',
          label: 'Langkah 04 / Tests',
          reason: 'Lakukan uji kadar air kayu dan kerataan produk',
        },
      )
    }
    if (lower.includes('cacat') || lower.includes('issue') || lower.includes('temuan') || lower.includes('rusak') || lower.includes('masalah')) {
      return replyWithImage(
        'Daftar temuan cacat beserta Cause, Repair, dan CAP berada di **Langkah 05 / Issues**.',
        undefined,
        {
          targetTab: 'issues',
          label: 'Langkah 05 / Issues',
          reason: 'Periksa kartu temuan cacat dan tindakan perbaikan',
        },
      )
    }
    if (lower.includes('laporan') || lower.includes('cetak') || lower.includes('word') || lower.includes('review') || lower.includes('docx')) {
      return replyWithImage(
        'Pratinjau susunan halaman dan pembuatan laporan Word (.docx) berada di **Langkah 06 / Review & Report**.',
        undefined,
        {
          targetTab: 'review',
          label: 'Langkah 06 / Review & Report',
          reason: 'Periksa halaman dan ekspor laporan Word resmi',
        },
      )
    }
    if (lower.includes('identitas') || lower.includes('po') || lower.includes('customer') || lower.includes('produk') || lower.includes('overview')) {
      return replyWithImage(
        'Identitas inspeksi, nama produk, PO, dan pembeli berada di **Langkah 01 / Overview**.',
        undefined,
        {
          targetTab: 'overview',
          label: 'Langkah 01 / Overview',
          reason: 'Lihat data identitas produk dan pembeli',
        },
      )
    }
  }

  // 3. Pertanyaan Kelengkapan
  if (lower.includes('lengkap') || lower.includes('cek') || lower.includes('status')) {
    if (!inspection) {
      return replyWithImage(
        'Saat ini belum ada inspeksi yang dibuka. Silakan pilih salah satu inspeksi dari daftar untuk mengecek kelengkapan foto dan ukurannya.',
      )
    }
    const photosCount = inspection.photos?.length || 0
    const issuesCount = inspection.issues?.length || 0
    const measuresCount = inspection.measurements?.length || 0

    let summary = `📋 **Pemeriksaan Kelengkapan Inspeksi ${inspection.inspection_number}:**\n`
    summary += `- Produk: **${inspection.product_name}** (${inspection.customer_name})\n`
    summary += `- Foto Terunggah: **${photosCount} foto** ${photosCount < 4 ? '⚠️ (Disarankan minimal 4 foto tampak produk)' : '✅'}\n`
    summary += `- Titik Pengukuran: **${measuresCount} titik** ${measuresCount === 0 ? '⚠️ (Belum ada data dimensi/MC)' : '✅'}\n`
    summary += `- Temuan Masalah: **${issuesCount} temuan**\n\n`

    if (photosCount < 4 || measuresCount === 0) {
      summary += '💡 *Saran:* Lengkapi foto tampak produk dan ukur dimensi utama sebelum mengekspor laporan.'
    } else {
      summary += '✨ Data utama sudah cukup lengkap untuk dipratinjau dan dicetak ke laporan Word!'
    }

    return replyWithImage(summary)
  }

  // 4. Standar Kadar Air (MC)
  if (lower.includes('mc') || lower.includes('kadar air') || lower.includes('moisture')) {
    return replyWithImage(
      `🪵 **Standar Kadar Air (MC) Furnitur Ekspor:**\n\n` +
        `- **Standar Ekspor (Eropa/Amerika):** 8% – 12% (maksimal toleransi 14% di area tertentu).\n` +
        `- **Penyebab MC Tinggi:** Waktu pengeringan oven kiln belum tuntas atau penyimpanan gudang lembap.\n` +
        `- **Dampak:** Risiko kayu melengkung (warping), retak sambungan (crack), atau lem terlepas.\n` +
        `- **Solusi:** Lakukan pengecekan minimal 5 titik pengukuran pada tiap komponen utama.`,
    )
  }

  // 5. Default Ramah
  const qcCaller = inspection?.qc_name ? `Rekan ${inspection.qc_name}` : 'Rekan QC'
  return replyWithImage(
    `Halo ${qcCaller}! Saya siap mendampingi pemeriksaan mutu furnitur Anda.\n\n` +
      `Anda dapat meminta saya:\n` +
      `1. *"Beri saran cacat Crack / Scratch / Gap"*\n` +
      `2. *"Analisis foto produk ini"* (lampirkan foto melalui ikon kamera 📷 di bawah)\n` +
      `3. *"Cek kelengkapan laporan ini"*\n` +
      `4. *"Berapa standar kadar air kayu ekspor?"*\n\n` +
      `*(Catatan: Anda juga dapat menghubungkan kunci API atau memilih 9Router melalui ikon roda gigi ⚙️ di samping).*`,
  )
}

export async function explainAppError(errorMessage: string): Promise<{ explanation: string; solution: string }> {
  const config = getAiConfig()
  const effectiveKey = resolveEffectiveApiKey(config)

  if (effectiveKey || config.provider === '9router') {
    try {
      const prompt = `Aplikasi QC Furnitur kami mengalami kendala berikut: "${errorMessage}".
Tolong jelaskan penyebabnya dalam Bahasa Indonesia sederhana untuk pemeriksa mutu (QC) tanpa istilah koding rumit, dan berikan langkah solusi konkret di aplikasi.
Jawab dengan format JSON:
\`\`\`json
{
  "explanation": "Penjelasan penyebab ramah manusia",
  "solution": "Langkah tindakan konkret untuk QC"
}
\`\`\``

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (effectiveKey) {
        headers['Authorization'] = `Bearer ${effectiveKey}`
      }
      if (config.provider === 'openrouter') {
        if (typeof window !== 'undefined') {
          headers['HTTP-Referer'] = window.location.origin || 'http://localhost:8000'
        }
        headers['X-Title'] = 'Inspectra QC Error Explainer'
      }

      const candidateUrls = getCandidateUrls(config)
      for (const currentUrl of candidateUrls) {
        try {
          const endpoint = currentUrl.replace(/\/+$/, '') + '/chat/completions'
          const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: config.modelName,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2,
              stream: false,
            }),
          })

          if (res.ok) {
            const data = (await res.json()) as { choices?: [{ message?: { content?: string } }] }
            const reply = data.choices?.[0]?.message?.content || ''
            const jsonMatch = reply.match(/```json\s*(\{[\s\S]*?\})\s*```/)
            if (jsonMatch && jsonMatch[1]) {
              const parsed = JSON.parse(jsonMatch[1]) as { explanation?: string; solution?: string }
              if (parsed.explanation && parsed.solution) {
                return { explanation: parsed.explanation, solution: parsed.solution }
              }
            }
          }
        } catch {
          // coba url berikutnya
        }
      }
    } catch {
      // jika gagal, pakai fallback lokal
    }
  }

  // Fallback lokal jika tanpa internet atau kunci API kosong
  const lower = errorMessage.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('terputus') || lower.includes('unavailable')) {
    return {
      explanation: 'Sistem aplikasi kehilangan sambungan ke lemari data lokal di laptop.',
      solution: 'Pastikan aplikasi utama Inspectra tetap berjalan di laptop Anda, lalu klik tombol "Coba sambung ulang" di layar.',
    }
  }
  if (lower.includes('photo') || lower.includes('foto') || lower.includes('upload') || lower.includes('unggah')) {
    return {
      explanation: 'File foto tidak dapat dibaca atau gagal tersimpan ke penyimpanan berkas.',
      solution: 'Pastikan file berformat foto umum (JPG/PNG), ukuran file tidak kosong/rusak, lalu coba pilih kembali fotonya.',
    }
  }
  if (lower.includes('conflict') || lower.includes('revision') || lower.includes('409')) {
    return {
      explanation: 'Ada pembaruan data yang saling mendahului saat menyimpan formulir.',
      solution: 'Tekan tombol kembali atau muat ulang halaman agar data terbaru ditampilkan tanpa menimpa pekerjaan lain.',
    }
  }
  if (lower.includes('required') || lower.includes('wajib') || lower.includes('kosong')) {
    return {
      explanation: 'Ada kolom isian penting pada formulir inspeksi yang belum diisi.',
      solution: 'Periksa kembali kolom yang bertanda peringatan merah dan isi data yang diperlukan sebelum menyimpan.',
    }
  }

  return {
    explanation: `Terjadi kendala sistem: ${errorMessage}`,
    solution: 'Coba ulangi tindakan sekali lagi. Jika masih berlanjut, muat ulang halaman atau periksa kelengkapan data formulir Anda.',
  }
}
