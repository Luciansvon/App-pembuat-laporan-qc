import { useState, useRef, useEffect } from 'react'
import type { Defect, Inspection } from '../types/qc'
import {
  askCopilot,
  explainAppError,
  getAiConfig,
  saveAiConfig,
  testAiConnection,
  fileToDataUrl,
  DEFAULT_CONFIGS,
  type AiConfig,
  type AiProviderType,
  type CopilotMessage,
  type CopilotSuggestion,
  type CopilotNavigation,
} from '../services/aiService'

type MascotState = 'standby' | 'listening' | 'thinking' | 'suggesting' | 'success' | 'warning'

const MASCOT_IMAGES: Record<MascotState, string> = {
  standby: '/mascot/standby.jpg',
  listening: '/mascot/listening.jpg',
  thinking: '/mascot/thinking.jpg',
  suggesting: '/mascot/suggesting.jpg',
  success: '/mascot/success.jpg',
  warning: '/mascot/warning.jpg',
}

interface AiCopilotProps {
  currentInspection: Inspection | null
  defects: Defect[]
  appError?: string
  onApplyIssue?: (suggestion: { defectType: string; cause: string; repair: string; cap: string }) => Promise<void> | void
  onNavigate?: (nav: CopilotNavigation) => void
}

export default function AiCopilot({ currentInspection, defects, appError, onApplyIssue, onNavigate }: AiCopilotProps) {
  // Default tertutup: hanya lingkaran maskot yang tampil di pojok kanan bawah
  const [isOpen, setIsOpen] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [mascotState, setMascotState] = useState<MascotState>('standby')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastHandledError, setLastHandledError] = useState<string>('')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)

  const inspectorName = currentInspection?.qc_name ? `Rekan ${currentInspection.qc_name}` : 'Rekan QC'
  const [messages, setMessages] = useState<CopilotMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Halo ${currentInspection?.qc_name ? `Rekan ${currentInspection.qc_name}` : 'Rekan QC'}! Saya Inspectra Co-pilot siap mendampingi pemeriksaan mutu furnitur. Tanyakan seputar cacat produk, standar MC kayu, atau lampirkan foto melalui tombol 📷 untuk analisis visual AI.`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  // Config State
  const [config, setConfig] = useState<AiConfig>(getAiConfig)
  const [configSaved, setConfigSaved] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setTestResult(null)
    try {
      const res = await testAiConnection(config.baseUrl, config.apiKey)
      setTestResult(res)
    } finally {
      setTestingConnection(false)
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<number | null>(null)

  // Listen to photo inspection event from anywhere in the app
  useEffect(() => {
    const onPhotoEvent = (e: Event) => {
      const custom = e as CustomEvent<{ photoId?: string; dataUrl: string; caption?: string; prompt?: string }>
      if (custom.detail?.dataUrl) {
        setIsOpen(true)
        setAttachedImage(custom.detail.dataUrl)
        if (custom.detail.prompt) {
          setInput(custom.detail.prompt)
        } else {
          setInput(`Tolong periksa foto ${custom.detail.caption ? `"${custom.detail.caption}"` : ''} ini, apakah ada temuan cacat atau saran caption perbaikan?`)
        }
      }
    }
    window.addEventListener('inspectra-copilot-photo', onPhotoEvent)
    return () => window.removeEventListener('inspectra-copilot-photo', onPhotoEvent)
  }, [])

  // Deteksi kendala pada aplikasi secara otomatis
  useEffect(() => {
    if (appError && appError !== lastHandledError) {
      setLastHandledError(appError)
      setMascotState('warning')

      void explainAppError(appError).then(({ explanation, solution }) => {
        const errorCardMessage: CopilotMessage = {
          id: String(Date.now()),
          sender: 'assistant',
          text: `⚠️ **Terdeteksi Kendala pada Aplikasi:**\n\n` +
            `🧐 **Penyebab:** ${explanation}\n\n` +
            `💡 **Saran Tindakan:** ${solution}`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages((prev) => [...prev, errorCardMessage])
        setIsOpen(true) // Buka otomatis jika ada error penting
      })
    }
  }, [appError, lastHandledError])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Auto-grow textarea
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [input, isOpen])

  // Handle typing reaction on mascot
  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value)

    if (mascotState !== 'thinking' && mascotState !== 'success') {
      setMascotState('listening')
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = window.setTimeout(() => {
        setMascotState('standby')
      }, 1500)
    }
  }

  // Handle Image Attachment via file input
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      setAttachedImage(dataUrl)
      setIsOpen(true)
      if (!input.trim()) {
        setInput('Analisis visual foto ini untuk inspeksi QC.')
      }
    } catch {
      // ignore image read failure
    }
    event.target.value = ''
  }

  // Handle Send message
  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim()
    if ((!textToSend && !attachedImage) || loading) return

    const imageToSend = attachedImage
    const userMessage: CopilotMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: textToSend || 'Analisis foto terlampir ini dari perspektif QC.',
      imageAttachment: imageToSend || undefined,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMessage])
    if (!customPrompt) setInput('')
    setAttachedImage(null)
    setIsOpen(true)
    setLoading(true)
    setMascotState('thinking')

    try {
      const history = messages.slice(-4).map((m) => ({
        role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }))

      const reply = await askCopilot(
        textToSend || 'Analisis foto terlampir untuk Quality Control.',
        currentInspection,
        defects,
        history,
        imageToSend || undefined,
      )

      const assistantMessage: CopilotMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: reply.text,
        suggestion: reply.suggestion,
        navigation: reply.navigation,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, assistantMessage])

      if (reply.suggestion || reply.navigation) {
        setMascotState('suggesting')
      } else if (reply.text.includes('⚠️')) {
        setMascotState('warning')
      } else {
        setMascotState('standby')
      }
    } catch (err) {
      const isFetchError = err instanceof Error && (err.message.includes('fetch') || err.message.includes('Network') || err.message.includes('Failed'))
      const errorText = isFetchError
        ? `⚠️ **Koneksi Belum Terhubung:**\n` +
          `Tidak dapat menjangkau provider AI di \`${config.baseUrl}\`.\n\n` +
          `💡 **Petunjuk untuk HP Android & Emulator:**\n` +
          `- Jika di **Emulator**, buka Pengaturan ⚙️ dan pilih preset **Emulator (10.0.2.2:20128)**.\n` +
          `- Jika di **HP Fisik**, sambungkan HP ke Wi-Fi yang sama dengan laptop, lalu di Pengaturan ⚙️ masukkan IP laptop Anda.\n` +
          `- Pastikan 9Router di laptop sudah menyala (*Nyalakan_9Router.bat*).`
        : `⚠️ Maaf, ada kendala: ${err instanceof Error ? err.message : String(err)}`

      const errorMsg: CopilotMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: errorText,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
      setMascotState('warning')
    } finally {
      setLoading(false)
    }
  }

  // Handle Apply Suggestion to Report
  const handleApply = async (sugg: CopilotSuggestion) => {
    if (!sugg.defectType) return
    try {
      if (onApplyIssue) {
        await onApplyIssue({
          defectType: sugg.defectType,
          cause: sugg.cause || '',
          repair: sugg.repair || '',
          cap: sugg.cap || '',
        })
      }
      setMascotState('success')
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          sender: 'assistant',
          text: `✅ Saran cacat **${sugg.defectType}** berhasil diterapkan ke laporan!`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        },
      ])
      setTimeout(() => setMascotState('standby'), 3000)
    } catch {
      setMascotState('warning')
    }
  }

  // Handle Consent-based Navigation
  const handleNavigate = (nav: CopilotNavigation) => {
    if (onNavigate) {
      onNavigate(nav)
    }
    setMascotState('success')
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        sender: 'assistant',
        text: `👉 Layar telah diarahkan ke **${nav.label}**. Silakan periksa bagian tersebut.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      },
    ])
    setTimeout(() => setMascotState('standby'), 3000)
  }

  // Handle Provider Change in Config
  const handleProviderChange = (provider: AiProviderType) => {
    const defaults = DEFAULT_CONFIGS[provider]
    setConfig((prev) => ({
      ...prev,
      provider,
      baseUrl: defaults.baseUrl,
      modelName: defaults.defaultModel,
      apiKey: defaults.defaultKey || prev.apiKey,
    }))
  }

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault()
    saveAiConfig(config)
    setConfigSaved(true)
    setTimeout(() => {
      setConfigSaved(false)
      setShowConfig(false)
    }, 1200)
  }

  return (
    <div className="copilot-container">
      {/* Hidden File Input for Image Attachment */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        onChange={handleImageSelect}
        aria-label="Pilih foto untuk dianalisis oleh Co-pilot"
      />

      {/* Floating Chat & Suggestion Card Overlay */}
      {isOpen && (
        <div className="copilot-overlay" role="region" aria-label="Inspectra Co-pilot Chat">
          <div className="copilot-header">
            <div className="copilot-header-info">
              <div>
                <h4 className="copilot-header-title">Inspectra Co-Pilot</h4>
                <p className="copilot-header-subtitle">
                  {inspectorName} · {config.provider === '9router' ? '9Router Vision (Port 20128)' : `Terhubung (${config.provider})`}
                </p>
              </div>
            </div>
            <div className="copilot-header-actions">
              <button
                type="button"
                className="copilot-icon-btn"
                title="Pengaturan Model / Provider"
                onClick={() => setShowConfig((prev) => !prev)}
              >
                ⚙️
              </button>
              <button
                type="button"
                className="copilot-icon-btn"
                title="Tutup Percakapan"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages List */}
          <div className="copilot-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`copilot-bubble ${msg.sender}`}>
                {msg.imageAttachment && (
                  <div className="copilot-msg-image-wrap">
                    <img src={msg.imageAttachment} alt="Foto terlampir" className="copilot-msg-image" />
                  </div>
                )}
                <div>{msg.text}</div>

                {/* Suggestion Card if available */}
                {msg.suggestion && (
                  <div className="copilot-suggestion-card">
                    <div className="copilot-suggestion-title">
                      <span>📋</span> Rekomendasi: {msg.suggestion.defectType}
                    </div>
                    {msg.suggestion.cause && (
                      <div className="copilot-suggestion-item">
                        <strong>Penyebab:</strong> {msg.suggestion.cause}
                      </div>
                    )}
                    {msg.suggestion.repair && (
                      <div className="copilot-suggestion-item">
                        <strong>Perbaikan:</strong> {msg.suggestion.repair}
                      </div>
                    )}
                    {msg.suggestion.cap && (
                      <div className="copilot-suggestion-item">
                        <strong>Pencegahan (CAP):</strong> {msg.suggestion.cap}
                      </div>
                    )}

                    <div className="copilot-suggestion-actions">
                      <button
                        type="button"
                        className="copilot-apply-btn"
                        onClick={() => handleApply(msg.suggestion!)}
                      >
                        ✓ Terapkan ke Laporan
                      </button>
                      <button
                        type="button"
                        className="copilot-dismiss-btn"
                        onClick={() => {
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id ? { ...m, suggestion: undefined } : m,
                            ),
                          )
                        }}
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                )}

                {/* Navigation Card with User Consent */}
                {msg.navigation && (
                  <div className="copilot-navigation-card">
                    <div className="copilot-navigation-title">
                      <span>🧭</span> Rekomendasi Navigasi
                    </div>
                    <div className="copilot-navigation-reason">
                      {msg.navigation.reason || `Apakah Anda ingin membuka ${msg.navigation.label}?`}
                    </div>
                    <div className="copilot-navigation-actions">
                      <button
                        type="button"
                        className="copilot-nav-confirm-btn"
                        onClick={() => handleNavigate(msg.navigation!)}
                      >
                        Buka {msg.navigation.label}
                      </button>
                      <button
                        type="button"
                        className="copilot-nav-cancel-btn"
                        onClick={() => {
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id ? { ...m, navigation: undefined } : m,
                            ),
                          )
                        }}
                      >
                        Abaikan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="copilot-bubble assistant">
                <em>Sedang menganalisis visual dan menyiapkan draf...</em>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="copilot-chips">
            <button
              type="button"
              className="copilot-chip"
              onClick={() => handleSend('Cek kelengkapan laporan inspeksi ini')}
            >
              📋 Cek Kelengkapan
            </button>
            <button
              type="button"
              className="copilot-chip"
              onClick={() => fileInputRef.current?.click()}
            >
              📷 Analisis Foto (Vision)
            </button>
            <button
              type="button"
              className="copilot-chip"
              onClick={() => handleSend('Beri saran penanganan cacat Crack retak kayu')}
            >
              🪵 Cacat Crack
            </button>
            <button
              type="button"
              className="copilot-chip"
              onClick={() => handleSend('Berapa standar kadar air MC kayu ekspor?')}
            >
              💧 Standar MC
            </button>
          </div>
        </div>
      )}

      {/* Provider Config Modal */}
      {showConfig && (
        <form className="copilot-config-modal" onSubmit={handleSaveConfig}>
          <div className="copilot-config-title">
            <span>⚙️ Pengaturan AI Provider</span>
            <button
              type="button"
              className="copilot-icon-btn"
              style={{ color: '#4a5c4e', background: '#f4eee2' }}
              onClick={() => setShowConfig(false)}
            >
              ✕
            </button>
          </div>

          <div className="copilot-config-field">
            <label>Pilih Provider:</label>
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProviderType)}
            >
              <option value="9router">9Router (Lokal Port 20128 - BIMA Gateway)</option>
              <option value="openrouter">OpenRouter (Online Gateway)</option>
              <option value="openai">OpenAI (GPT Resmi)</option>
              <option value="custom">Custom Server / URL Bebas</option>
            </select>
          </div>

          <div className="copilot-config-field">
            <label>URL Endpoint API:</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder="http://localhost:20128/v1"
            />
          </div>

          {config.provider === '9router' && (
            <div className="copilot-config-field">
              <label>Pilihan Cepat Alamat 9Router:</label>
              <div style={{ display: 'grid', gap: '6px', marginTop: '4px' }}>
                <button
                  type="button"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    textAlign: 'left',
                    borderRadius: '6px',
                    border: config.baseUrl.includes('10.0.2.2') ? '2px solid #1e593d' : '1px solid #dcd4c5',
                    background: config.baseUrl.includes('10.0.2.2') ? '#eef7f1' : '#fff',
                    cursor: 'pointer',
                    color: '#1c241f',
                  }}
                  onClick={() => {
                    setConfig({ ...config, baseUrl: 'http://10.0.2.2:20128/v1' })
                    setTestResult(null)
                  }}
                >
                  📱 <strong>Emulator Android</strong> (10.0.2.2:20128)
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    textAlign: 'left',
                    borderRadius: '6px',
                    border: config.baseUrl.includes('192.168.') || config.baseUrl.includes(':20128') && !config.baseUrl.includes('localhost') && !config.baseUrl.includes('10.0.2.2') ? '2px solid #1e593d' : '1px solid #dcd4c5',
                    background: config.baseUrl.includes('192.168.') || (config.baseUrl.includes(':20128') && !config.baseUrl.includes('localhost') && !config.baseUrl.includes('10.0.2.2')) ? '#eef7f1' : '#fff',
                    cursor: 'pointer',
                    color: '#1c241f',
                  }}
                  onClick={() => {
                    const host = typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
                      ? window.location.hostname
                      : ''
                    if (host) {
                      setConfig({ ...config, baseUrl: `http://${host}:20128/v1` })
                    } else {
                      const ip = window.prompt('Masukkan alamat IP Wi-Fi laptop Anda (contoh: 192.168.1.15):', '192.168.1.')
                      if (ip && ip.trim()) {
                        const cleanIp = ip.trim().replace(/\/+$/, '').replace(/^http:\/\//, '')
                        setConfig({ ...config, baseUrl: `http://${cleanIp.includes(':') ? cleanIp : `${cleanIp}:20128`}/v1` })
                      }
                    }
                    setTestResult(null)
                  }}
                >
                  📶 <strong>HP Fisik via Wi-Fi Laptop</strong> (IP Laptop:20128)
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    textAlign: 'left',
                    borderRadius: '6px',
                    border: config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1') ? '2px solid #1e593d' : '1px solid #dcd4c5',
                    background: config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1') ? '#eef7f1' : '#fff',
                    cursor: 'pointer',
                    color: '#1c241f',
                  }}
                  onClick={() => {
                    setConfig({ ...config, baseUrl: 'http://localhost:20128/v1' })
                    setTestResult(null)
                  }}
                >
                  💻 <strong>Laptop Lokal (Browser Web)</strong> (localhost:20128)
                </button>
              </div>

              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  disabled={testingConnection}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: '#f4eee2',
                    color: '#1e593d',
                    border: '1px solid #c9dfd0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                  onClick={() => void handleTestConnection()}
                >
                  {testingConnection ? '⏳ Sedang menguji koneksi...' : '⚡ Tes Koneksi ke 9Router'}
                </button>
              </div>

              {testResult && (
                <div
                  style={{
                    padding: '7px 9px',
                    borderRadius: '6px',
                    fontSize: '0.71875rem',
                    marginTop: '6px',
                    background: testResult.ok ? '#eef7f1' : '#fef2f2',
                    color: testResult.ok ? '#166534' : '#991b1b',
                    border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
                  }}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          <div className="copilot-config-field">
            <label>Nama Model AI:</label>
            <input
              type="text"
              value={config.modelName}
              onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
              placeholder="ag/gemini-3.8-flash-high"
            />
            {config.provider === '9router' && (
              <p className="copilot-config-help">
                Model 9Router aktif: ag/gemini-3.8-flash-high, ag/gemini-2.5-flash, kr/claude-haiku-4.5
              </p>
            )}
          </div>

          <div className="copilot-config-field">
            <label>Kunci API (API Key):</label>
            <input
              type="password"
              placeholder="Kunci API bawaan 9Router sudah terpasang otomatis"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
            <p className="copilot-config-help">
              Untuk 9Router, kunci default lokal otomatis digunakan jika kolom ini dibiarkan apa adanya.
            </p>
          </div>

          <button type="submit" className="copilot-config-save">
            {configSaved ? '✓ Pengaturan Tersimpan!' : 'Simpan Pengaturan'}
          </button>
        </form>
      )}

      {/* Bottom Dock: Saat tertutup HANYA lingkaran maskot, saat terbuka ada bilah ketik */}
      <div className={`copilot-dock ${!isOpen ? 'collapsed' : ''}`}>
        {/* Mascot Avatar Circle */}
        <button
          type="button"
          className="copilot-mascot-trigger"
          title={isOpen ? 'Tutup asisten Inspectra' : 'Buka Asisten Inspectra Co-Pilot'}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <img
            src={MASCOT_IMAGES[mascotState]}
            alt={`Maskot ${mascotState}`}
            className="copilot-mascot-img"
          />
          <span className={`copilot-status-badge ${mascotState === 'thinking' ? 'thinking' : ''}`} />
        </button>

        {/* Input Bar: Hanya muncul ketika isOpen bernilai true */}
        {isOpen && (
          <div className="copilot-input-bar">
            {attachedImage && (
              <div className="copilot-attach-preview">
                <img src={attachedImage} alt="Lampiran foto" />
                <button
                  type="button"
                  className="copilot-attach-remove"
                  onClick={() => setAttachedImage(null)}
                  title="Hapus lampiran"
                >
                  ✕
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              placeholder={attachedImage ? 'Ketik pertanyaan mengenai foto terlampir ini...' : 'Tanya asisten atau minta saran...'}
              className="copilot-textarea"
              autoFocus
            />

            <div className="copilot-actions-bar">
              <button
                type="button"
                className="copilot-config-btn"
                title="Lampirkan foto untuk analisis Vision AI"
                onClick={() => fileInputRef.current?.click()}
              >
                📷
              </button>
              <button
                type="button"
                className="copilot-config-btn"
                title="Pengaturan Provider AI"
                onClick={() => {
                  setShowConfig((prev) => !prev)
                }}
              >
                ⚙️
              </button>
              <button
                type="button"
                className="copilot-send-btn"
                disabled={(!input.trim() && !attachedImage) || loading}
                onClick={() => void handleSend()}
                title="Kirim Perintah"
              >
                ➤
              </button>
              <button
                type="button"
                className="copilot-close-btn"
                title="Ciutkan ke maskot saja"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
