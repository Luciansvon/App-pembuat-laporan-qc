export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmModal({
  options,
  onClose,
}: {
  options: ConfirmOptions | null
  onClose: () => void
}) {
  if (!options) return null

  const handleConfirm = async () => {
    try {
      await options.onConfirm()
    } finally {
      onClose()
    }
  }

  return (
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="confirm-modal-header">
          <div className="confirm-modal-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <span className="confirm-modal-kicker">KONFIRMASI TINDAKAN</span>
            <h3 id="confirm-modal-title">{options.title}</h3>
          </div>
        </div>
        <p className="confirm-modal-message">{options.message}</p>
        <div className="confirm-modal-actions">
          <button
            type="button"
            className="confirm-btn-cancel"
            onClick={onClose}
          >
            {options.cancelText || 'Batal'}
          </button>
          <button
            type="button"
            className={options.danger !== false ? 'confirm-btn-danger' : 'confirm-btn-primary'}
            onClick={() => void handleConfirm()}
            autoFocus
          >
            {options.confirmText || 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </div>
  )
}
