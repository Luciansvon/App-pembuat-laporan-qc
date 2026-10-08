import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { getHealth } from '../services/health'
import type { Customer, Defect, Inspection, Product } from '../types/qc'
import Workspace from './Workspace'

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
const axes = ['L', 'W', 'D', 'H'] as const

function NewInspection({ customers, products, onCreate, onRefresh }: {
  customers: Customer[]; products: Product[];
  onCreate: (body: Record<string, unknown>) => Promise<void>;
  onRefresh: () => Promise<void>
}) {
  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [newCustomer, setNewCustomer] = useState(false)
  const [newProduct, setNewProduct] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [productName, setProductName] = useState('')
  const [standard, setStandard] = useState<Record<string, string>>({})
  const [po, setPo] = useState('')
  const [inspectionType, setInspectionType] = useState('INLINE')
  const [date, setDate] = useState(today())
  const [location, setLocation] = useState('QSF')
  const [qcName, setQcName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [aql, setAql] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const customerProducts = useMemo(() => products.filter((product) => product.customer_id === customerId), [products, customerId])

  async function createCustomer() {
    setBusy(true); setError('')
    try {
      const saved = await api.createCustomer({ code: customerCode.trim().toUpperCase(), name: customerName.trim() })
      await onRefresh(); setCustomerId(saved.id); setProductId(''); setNewCustomer(false)
    } catch (cause) { setError(String(cause)) } finally { setBusy(false) }
  }
  async function createProduct() {
    if (!customerId) return setError('Pilih customer dahulu.')
    setBusy(true); setError('')
    try {
      const dimensions = Object.fromEntries(Object.entries(standard).filter(([, value]) => value !== '').map(([key, value]) => [key, Number(value)]))
      const saved = await api.createProduct({ customer_id: customerId, name: productName.trim(), standard_dimensions: dimensions })
      await onRefresh(); setProductId(saved.id); setNewProduct(false)
    } catch (cause) { setError(String(cause)) } finally { setBusy(false) }
  }

  return <form className="field-card new-inspection" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await onCreate({ product_id: productId, po, inspection_type: inspectionType, date, location, qc_name: qcName, quantity: Number(quantity), aql: aql || null })
    } catch (cause) { setError(String(cause)) } finally { setBusy(false) }
  }}>
    <div className="field-card-heading"><div><span className="section-kicker">INSPEKSI BARU</span><h2>Identitas produk</h2></div><p>Metadata ini akan muncul pada setiap halaman Word.</p></div>
    <div className="form-grid">
      <label>Customer<select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setProductId('') }} required><option value="">Pilih customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}</select></label>
      <button className="small-action" type="button" onClick={() => setNewCustomer(!newCustomer)}>+ Customer baru</button>
      {newCustomer && <div className="inline-editor"><label>Kode<input value={customerCode} onChange={(event) => setCustomerCode(event.target.value)} placeholder="POLIFORM" /></label><label>Nama<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nama customer" /></label><button type="button" disabled={busy || !customerCode || !customerName} onClick={createCustomer}>Simpan customer</button></div>}
      <label>Produk<select value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">Pilih produk</option>{customerProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <button className="small-action" type="button" onClick={() => setNewProduct(!newProduct)}>+ Produk baru</button>
      {newProduct && <div className="inline-editor"><label>Nama produk<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Nama pada DESC" /></label><div className="axis-fields">{axes.map((axis) => <label key={axis}>Standar {axis} mm<input type="number" step="any" value={standard[axis] || ''} onChange={(event) => setStandard({ ...standard, [axis]: event.target.value })} /></label>)}</div><button type="button" disabled={busy || !productName || !customerId} onClick={createProduct}>Simpan produk</button></div>}
      <label>PO<input value={po} onChange={(event) => setPo(event.target.value)} required placeholder="PO tunggal atau multi-nilai" /></label>
      <label>Jenis inspeksi<select value={inspectionType} onChange={(event) => setInspectionType(event.target.value)}><option value="INLINE">INLINE</option><option value="FINAL">FINAL</option><option value="PRE_SHIPMENT">PRE SHIPMENT</option><option value="OTHER">OTHER</option></select></label>
      <label>Tanggal<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <label>Lokasi<input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
      <label>Nama QC<input value={qcName} onChange={(event) => setQcName(event.target.value)} required placeholder="Petugas inspeksi" /></label>
      <label>QTY<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
      <label>AQL sesuai dokumen<input value={aql} onChange={(event) => setAql(event.target.value)} placeholder="Opsional; makna belum diasumsikan" /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-action" type="submit" disabled={busy || !productId}>{busy ? 'Menyimpan…' : 'Buat inspeksi'}</button>
  </form>
}

export default function QcApp() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [defects, setDefects] = useState<Defect[]>([])
  const [current, setCurrent] = useState<Inspection | null>(null)
  const [creating, setCreating] = useState(false)
  const [connection, setConnection] = useState<'checking' | 'connected' | 'unavailable'>('checking')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refreshLists() {
    const [customersResult, productsResult, inspectionsResult, defectsResult] = await Promise.all([
      api.customers(), api.products(), api.inspections(), api.defects(),
    ])
    setCustomers(customersResult); setProducts(productsResult)
    setInspections(inspectionsResult); setDefects(defectsResult)
  }
  async function refreshCurrent(id = current?.id) {
    if (id) setCurrent(await api.inspection(id))
    await refreshLists()
  }
  useEffect(() => {
    let mounted = true
    Promise.all([getHealth(), api.customers(), api.products(), api.inspections(), api.defects()])
      .then(([, nextCustomers, nextProducts, nextInspections, nextDefects]) => {
        if (!mounted) return
        setConnection('connected'); setCustomers(nextCustomers); setProducts(nextProducts)
        setInspections(nextInspections); setDefects(nextDefects)
      }).catch(() => { if (mounted) setConnection('unavailable') })
    return () => { mounted = false }
  }, [])

  async function run(action: () => Promise<unknown>, success = 'Tersimpan.') {
    setError(''); setMessage('Menyimpan…')
    try { await action(); await refreshCurrent(); setMessage(success) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setMessage('Gagal menyimpan') }
  }
  async function create(body: Record<string, unknown>) {
    const saved = await api.createInspection(body)
    await refreshLists(); setCurrent(await api.inspection(saved.id)); setCreating(false); setMessage('Inspeksi baru tersimpan.')
  }
  async function open(id: string) {
    setError('')
    try { setCurrent(await api.inspection(id)); setCreating(false) } catch (cause) { setError(String(cause)) }
  }
  async function deleteCurrent(id: string) {
    setError(''); setMessage('Menghapus…')
    try {
      await api.deleteInspection(id)
      setCurrent(null)
      await refreshLists()
      setMessage('Inspeksi dihapus.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setMessage('Gagal menghapus')
    }
  }

  return <div className="app-shell qc-shell">
    <aside className="rail" aria-label="Navigasi utama">
      <button type="button" className="brand brand-button" onClick={() => { setCurrent(null); setCreating(false); void refreshLists() }}><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span><strong>Inspectra</strong><small>QC / V0.1</small></span></button>
      <p className="rail-label">WORKSPACE</p>
      <nav><button type="button" onClick={() => { setCurrent(null); setCreating(false) }}>Semua inspeksi</button><button type="button" disabled={connection !== 'connected'} onClick={() => { setCurrent(null); setCreating(true) }}>+ Inspeksi baru</button></nav>
      <div className="rail-footer"><span className="rail-footer-key">PENYIMPANAN LOKAL</span><span>SQLite & foto pada server kerja QC.</span></div>
    </aside>
    <main className="main-content qc-content">
      <div className="topline"><span>INSPECTRA</span><span>{today()}</span></div>
      <div className="page-head"><div><span className="section-kicker">INSPEKSI FURNITUR</span><h1>{current ? current.product_name : creating ? 'Inspeksi baru' : 'Laporan QC'}</h1><p>{current ? `${current.customer_name}  /  ${current.inspection_number}` : 'Catat di lapangan. Susun laporan Word dari data yang sudah diperiksa.'}</p></div>{!current && !creating && connection === 'connected' && <button className="primary-action" type="button" onClick={() => setCreating(true)}>+ Buat inspeksi</button>}{current && <button className="small-action" type="button" onClick={() => setCurrent(null)}>← Semua inspeksi</button>}</div>
      <div className={`app-connection ${connection}`} role="status"><span className="status-dot" />{connection === 'connected' ? 'Server & SQLite terhubung' : connection === 'checking' ? 'Memeriksa server lokal…' : 'Server lokal tidak terhubung. Jalankan backend untuk menyimpan data.'}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && !error && <p className="save-message" role="status">{message}</p>}
      {connection === 'unavailable' ? <section className="dashboard-list"><div className="empty-state"><strong>Server lokal terputus.</strong><p>Daftar inspeksi belum bisa dibaca. Data yang sudah tersimpan tetap ada di SQLite pada server kerja QC.</p><button className="primary-action" type="button" onClick={() => window.location.reload()}>Coba sambung ulang</button></div></section>
        : connection === 'checking' ? <section className="dashboard-list"><div className="empty-state">Memuat data inspeksi…</div></section>
        : current ? <Workspace inspection={current} defects={defects} run={run} refresh={() => refreshCurrent(current.id)} onDelete={() => deleteCurrent(current.id)} />
        : creating ? <NewInspection customers={customers} products={products} onCreate={create} onRefresh={refreshLists} />
          : <section className="dashboard-list"><div className="list-title"><h2>Inspeksi tersimpan</h2><span>{inspections.length} laporan</span></div>{inspections.length === 0 ? <div className="empty-state"><strong>Belum ada inspeksi.</strong><p>Mulai dengan membuat customer, produk, lalu inspeksi pertama.</p><button className="primary-action" onClick={() => setCreating(true)}>+ Buat inspeksi</button></div> : inspections.map((item) => <button className="inspection-row" key={item.id} onClick={() => void open(item.id)}><span className="inspection-number">{item.inspection_number}<small>{item.date}</small></span><span><strong>{item.product_name}</strong><small>{item.customer_name} · PO {item.po}</small></span><span className="status-label">{item.status}</span><span className="row-arrow">↗</span></button>)}</section>}
      <footer>LOCAL FIRST <span>•</span> SQLITE <span>•</span> WORD REPORT</footer>
    </main>
  </div>
}
