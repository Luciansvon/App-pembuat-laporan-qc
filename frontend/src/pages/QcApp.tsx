import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { getHealth } from '../services/health'
import type { Customer, Defect, Inspection, Product } from '../types/qc'
import Icon, { type IconName } from '../components/Icon'
import FurnitureScene from '../components/FurnitureScene'
import NewInspection from './NewInspection'
import Workspace, { type Tab } from './Workspace'

type View = 'home' | 'inspections' | 'master' | 'reports' | 'settings'
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
const statusLabel = (status: string) => ({ DRAFT: 'Draft', IN_PROGRESS: 'Dikerjakan', REVIEW: 'Review', COMPLETED: 'Selesai' })[status] || status
const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Beranda', icon: 'home' }, { id: 'inspections', label: 'Inspeksi', icon: 'inspection' },
  { id: 'master', label: 'Data master', icon: 'master' }, { id: 'reports', label: 'Laporan', icon: 'report' },
  { id: 'settings', label: 'Pengaturan', icon: 'settings' },
]

function InspectionTable({ items, onOpen, reports = false }: { items: Inspection[]; onOpen: (id: string, tab: Tab) => void; reports?: boolean }) {
  const tab = reports ? 'review' : 'overview'
  return <div className="table-scroll"><table className="inspection-table"><thead><tr><th>Inspeksi / tanggal</th><th>Produk</th><th>Customer</th><th>Qty</th><th>Status</th><th><span className="visually-hidden">Buka</span></th></tr></thead><tbody>{items.map(item => <tr key={item.id}>
    <td><button type="button" className="table-link" onClick={() => onOpen(item.id, tab)}>{item.inspection_number}</button><small>{dateLabel(item.date)}</small></td>
    <td><strong>{item.product_name}</strong><small>PO {item.po}</small></td><td>{item.customer_name}</td><td className="numeric">{item.quantity}</td>
    <td><span className={`status-badge ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></td>
    <td><button type="button" className="icon-button" aria-label={`${reports ? 'Review laporan' : 'Buka inspeksi'} ${item.inspection_number}`} onClick={() => onOpen(item.id, tab)}><Icon name="arrow" /></button></td>
  </tr>)}</tbody></table></div>
}

export default function QcApp() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [defects, setDefects] = useState<Defect[]>([])
  const [current, setCurrent] = useState<Inspection | null>(null)
  const [view, setView] = useState<View>('home')
  const [creating, setCreating] = useState(false)
  const [initialTab, setInitialTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [connection, setConnection] = useState<'checking' | 'connected' | 'unavailable'>('checking')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  const locked = pending || saving

  const refreshLists = useCallback(async () => {
    const [nextCustomers, nextProducts, nextInspections, nextDefects] = await Promise.all([api.customers(), api.products(), api.inspections(), api.defects()])
    setCustomers(nextCustomers); setProducts(nextProducts); setInspections(nextInspections); setDefects(nextDefects)
  }, [])
  const refreshCurrent = useCallback(async (id?: string) => { if (id) setCurrent(await api.inspection(id)); await refreshLists() }, [refreshLists])
  useEffect(() => {
    let mounted = true
    Promise.all([getHealth(), api.customers(), api.products(), api.inspections(), api.defects()])
      .then(([, nextCustomers, nextProducts, nextInspections, nextDefects]) => {
        if (!mounted) return
        setConnection('connected'); setCustomers(nextCustomers); setProducts(nextProducts); setInspections(nextInspections); setDefects(nextDefects)
      }).catch(() => { if (mounted) setConnection('unavailable') })
    return () => { mounted = false }
  }, [])
  const run = useCallback(async (action: () => Promise<unknown>, success = 'Tersimpan.'): Promise<boolean> => {
    setError(''); setMessage('Menyimpan…'); setSaving(true)
    try { await action(); await refreshCurrent(current?.id); setMessage(success); return true }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setMessage('Gagal menyimpan'); return false }
    finally { setSaving(false); setPending(false) }
  }, [current?.id, refreshCurrent])
  function navigate(target: View) { if (locked) return; setCurrent(null); setCreating(false); setView(target); setError(''); setMessage(''); setSearch(''); setStatusFilter('ALL') }
  function startNew() { if (locked) return; setCurrent(null); setCreating(true); setView('inspections'); setError(''); setMessage('') }
  async function create(body: Record<string, unknown>) {
    setError('')
    try {
      const saved = await api.createInspection(body)
      await refreshLists()
      setCurrent(await api.inspection(saved.id))
      setCreating(false)
      setInitialTab('overview')
      setMessage('Inspeksi baru tersimpan.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  async function open(id: string, tab: Tab) { if (locked) return; setError(''); try { setCurrent(await api.inspection(id)); setInitialTab(tab); setCreating(false); setView(tab === 'review' ? 'reports' : 'inspections') } catch (cause) { setError(String(cause)) } }
  async function deleteCurrent(id: string) { setError(''); setMessage('Menghapus…'); try { await api.deleteInspection(id); setCurrent(null); await refreshLists(); setMessage('Inspeksi dihapus.') } catch (cause) { setError(String(cause)); setMessage('Gagal menghapus') } }
  const filtered = useMemo(() => inspections.filter(item => (statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? ['IN_PROGRESS', 'REVIEW'].includes(item.status) : item.status === statusFilter)) && [item.inspection_number, item.product_name, item.customer_name, item.po].join(' ').toLowerCase().includes(search.toLowerCase())), [inspections, search, statusFilter])
  const stats: { label: string; value: number; icon: IconName; tone: string; filter: string; hint: string }[] = [
    { label: 'Total inspeksi', value: inspections.length, icon: 'inspection', tone: 'sage', filter: 'ALL', hint: 'Semua data tersimpan' },
    { label: 'Selesai', value: inspections.filter(item => item.status === 'COMPLETED').length, icon: 'check', tone: 'green', filter: 'COMPLETED', hint: 'Ditandai selesai oleh QC' },
    { label: 'Draft', value: inspections.filter(item => item.status === 'DRAFT').length, icon: 'report', tone: 'amber', filter: 'DRAFT', hint: 'Siap dilanjutkan' },
    { label: 'Dalam proses', value: inspections.filter(item => ['IN_PROGRESS', 'REVIEW'].includes(item.status)).length, icon: 'clock', tone: 'clay', filter: 'ACTIVE', hint: 'Dikerjakan atau direview' },
  ]
  const user = current?.qc_name || inspections[0]?.qc_name || 'QC'
  const title = current ? current.inspection_number : creating ? 'Inspeksi baru' : view === 'home' ? 'Selamat datang.' : navigation.find(item => item.id === view)?.label || 'Inspectra'

  return <div className="app-shell qc-shell"><a href="#main-content" className="skip-link">Langsung ke isi</a>
    <aside className="rail" aria-label="Navigasi utama">
      <button type="button" className="brand-button" disabled={locked} onClick={() => navigate('home')}><img src="/icon-192.png" alt="" /><span><strong>Inspectra</strong><small>Furniture quality control</small></span></button>
      <p className="rail-label">RUANG KERJA</p>
      <nav>{navigation.map(item => <button type="button" key={item.id} className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} disabled={locked} onClick={() => navigate(item.id)}><Icon name={item.icon} />{item.label}{item.id === 'inspections' && <span className="nav-count">{inspections.length}</span>}</button>)}</nav>
      <button className="rail-new" disabled={locked || connection !== 'connected'} onClick={startNew}><Icon name="plus" />Inspeksi baru</button>
      <div className="rail-scene"><FurnitureScene /><div><span>Better quality.</span><strong>Better furniture.</strong></div></div>
      <div className="rail-footer"><span className={`status-dot ${connection}`} /><span>{connection === 'connected' ? 'Penyimpanan lokal aktif' : connection === 'checking' ? 'Menghubungkan…' : 'Koneksi terputus'}<small>Inspectra · v0.1</small></span></div>
    </aside>
    <div className="content-shell"><header className="topbar"><div className="breadcrumb">{current || creating ? <><button disabled={locked} onClick={() => navigate(view)}>{view === 'reports' ? 'Laporan' : 'Inspeksi'}</button><span>/</span>{current?.inspection_number || 'Baru'}</> : navigation.find(item => item.id === view)?.label}</div>
      {!current && !creating && view !== 'settings' && <label className="global-search"><Icon name="search" /><input aria-label="Cari inspeksi, PO, produk atau customer" value={search} onChange={event => { setSearch(event.target.value); if (view === 'home') setView('inspections') }} placeholder="Cari inspeksi, PO, produk atau customer…" /></label>}
      <div className="qc-user"><span className="avatar">{user.split(' ').map(word => word.trim()[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'QC'}</span><span>{user}<small>QC workspace</small></span></div>
    </header><main className="main-content qc-content" id="main-content">
      <div className="page-head"><div><span className="section-kicker">{current ? current.customer_name : dateLabel(today())}</span><h1>{title}{current && <span className={`status-badge ${current.status.toLowerCase()}`}>{statusLabel(current.status)}</span>}</h1><p>{current ? `${current.product_name} · PO ${current.po} · ${dateLabel(current.date)} · ${current.location || 'Lokasi belum diisi'}` : creating ? 'Lengkapi identitas, lalu lanjutkan pemeriksaan produk.' : view === 'home' ? 'Mulai inspeksi baru atau lanjutkan pekerjaan yang sudah ada.' : view === 'reports' ? 'Pilih inspeksi untuk periksa halaman dan membuat laporan Word.' : view === 'master' ? 'Customer, produk, dan pustaka defect untuk inspeksi.' : view === 'settings' ? 'Informasi aplikasi dan penyimpanan di komputer ini.' : 'Semua inspeksi tersimpan di ruang kerja lokal.'}</p></div>
        {connection === 'connected' && !current && !creating && ['home', 'inspections', 'reports'].includes(view) && <button type="button" className="primary-action" disabled={locked} onClick={startNew}><Icon name="plus" />Buat inspeksi baru</button>}
        {current && <button type="button" className="small-action" disabled={locked} onClick={() => navigate(view)}><Icon name="back" />Kembali ke daftar</button>}
        {creating && <button type="button" className="small-action" onClick={() => navigate('inspections')}>Batal</button>}
      </div>
      {error && <p className="form-error" role="alert"><Icon name="warning" />{error}</p>}
      {(message || pending) && !error && <p className="save-message" role="status"><Icon name={pending || saving ? 'clock' : 'check'} />{pending ? 'Perubahan belum tersimpan…' : message}</p>}
      {connection === 'checking' ? <div className="loading-panels" aria-label="Memuat inspeksi"><div /><div /><div /></div>
      : <>{connection === 'unavailable' && <div className="save-recovery" role="alert">Koneksi ke penyimpanan lokal terputus. Draf yang sedang dibuka tetap ditampilkan agar tidak hilang; penyimpanan baru akan gagal sampai tersambung.<button type="button" onClick={() => window.location.reload()}>Coba sambung ulang</button></div>}
      {connection === 'unavailable' && !current && !creating ? <div className="panel empty-state"><Icon name="database" /><h2>Penyimpanan belum terhubung</h2><p>Data tetap tersimpan di komputer ini. Buka kembali aplikasi untuk menyambung.</p><button className="primary-action" onClick={() => window.location.reload()}><Icon name="refresh" />Coba sambung ulang</button></div>
      : current ? <Workspace key={current.id} inspection={current} defects={defects} run={run} refresh={() => refreshCurrent(current.id)} onDelete={() => deleteCurrent(current.id)} initialTab={initialTab} onPendingChange={setPending} busy={locked} />
      : creating ? <NewInspection customers={customers} products={products} onCreate={create} onRefresh={refreshLists} />
      : view === 'master' ? <div className="master-grid"><section className="panel"><h2>Customer <span className="count-label">{customers.length}</span></h2><p>Dipilih saat membuat inspeksi.</p>{customers.filter(c => `${c.code} ${c.name}`.toLowerCase().includes(search.toLowerCase())).map(c => <div className="master-row" key={c.id}><strong>{c.name}</strong><span>{c.code}</span></div>)}</section><section className="panel"><h2>Produk <span className="count-label">{products.length}</span></h2><p>Standar produk tetap terpisah dari hasil ukur.</p>{products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <div className="master-row" key={p.id}><strong>{p.name}</strong><span>{customers.find(c => c.id === p.customer_id)?.name || '—'}</span></div>)}</section><section className="panel"><h2>Jenis defect <span className="count-label">{defects.length}</span></h2><p>Saran Cause, Repair, CAP perlu persetujuan QC.</p><div className="defect-tags">{defects.filter(d => d.name.toLowerCase().includes(search.toLowerCase())).map(d => <span key={d.id}>{d.name}</span>)}</div></section><button className="small-action master-create" onClick={startNew}><Icon name="plus" />Tambah customer atau produk melalui inspeksi baru</button></div>
      : view === 'settings' ? <div className="settings-grid"><article className="panel"><Icon name="database" /><h2>Data di komputer ini</h2><p>SQLite menyimpan inspeksi. Foto dan laporan disimpan sebagai berkas lokal. Internet tidak diperlukan saat melakukan inspeksi.</p><p className="field-help">Paket EXE menyimpan data di folder pengguna Windows. Pembaruan aplikasi mempertahankan data yang sudah ada.</p></article><article className="panel"><Icon name="report" /><h2>Preview & laporan Word</h2><p>DOCX bisa dibuat langsung dari Inspectra. Preview tiap halaman memerlukan Microsoft Word yang terpasang di Windows.</p><p className="field-help">Versi 0.1 · Tidak ada layanan AI atau akun cloud yang wajib digunakan.</p></article></div>
      : <div className={view === 'home' ? 'dashboard-layout' : 'list-layout'}><div className="dashboard-main">
        {view === 'home' && <div className="stats-grid">{stats.map(stat => <button key={stat.label} className={`stat-card ${stat.tone}`} onClick={() => { setView('inspections'); setStatusFilter(stat.filter) }}><Icon name={stat.icon} /><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.hint}</small></button>)}</div>}
        <section className="panel dashboard-list"><div className="list-title"><h2>{view === 'home' ? 'Inspeksi terbaru' : view === 'reports' ? 'Review & laporan' : 'Daftar inspeksi'} <span className="count-label">{filtered.length}</span></h2>{view === 'home' ? <button className="text-action" onClick={() => setView('inspections')}>Lihat semua <Icon name="arrow" /></button> : <select className="status-filter" aria-label="Filter status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">Semua status</option><option value="ACTIVE">Dalam proses</option>{['DRAFT', 'IN_PROGRESS', 'REVIEW', 'COMPLETED'].map(status => <option value={status} key={status}>{statusLabel(status)}</option>)}</select>}</div>
          {filtered.length ? <InspectionTable items={view === 'home' ? filtered.slice(0, 6) : filtered} onOpen={(id, tab) => void open(id, tab)} reports={view === 'reports'} /> : <div className="empty-state"><Icon name="inspection" /><h3>{search || statusFilter !== 'ALL' ? 'Tidak ada inspeksi yang cocok' : 'Inspeksi pertamamu dimulai di sini'}</h3><p>{search || statusFilter !== 'ALL' ? 'Ubah kata pencarian atau filter status.' : 'Buat customer, pilih produk, dan catat hasil pemeriksaan.'}</p>{!search && statusFilter === 'ALL' && <button className="primary-action" onClick={startNew}><Icon name="plus" />Buat inspeksi baru</button>}</div>}
        </section>{view === 'home' && <div className="workflow-note"><Icon name="inspection" /><div><strong>Dari lantai produksi ke laporan</strong><span>Identitas → Foto → Ukuran → Test → Temuan → Review</span></div><span>6 tahap</span></div>}</div>
        {view === 'home' && <aside className="dashboard-aside"><article className="report-promo"><div><span className="section-kicker">LAPORAN QC</span><h2>Detail yang jelas.<br />Laporan yang rapi.</h2><p>Catat temuan, periksa tiap halaman, lalu simpan sebagai Word.</p></div><FurnitureScene /><button className="primary-action" onClick={startNew}>Mulai inspeksi <Icon name="arrow" /></button></article><article className="local-note"><Icon name="database" /><div><strong>Data tersimpan lokal</strong><p>Inspeksi, foto, dan laporan tetap di komputer ini. Siap digunakan tanpa internet.</p></div></article></aside>}</div>}</>}
      <footer className="app-footer"><span>Inspectra · Furniture QC workspace</span><span><span className={`status-dot ${connection}`} />{connection === 'connected' ? 'Penyimpanan terhubung' : 'Menunggu koneksi'}</span></footer>
    </main></div>
  </div>
}
