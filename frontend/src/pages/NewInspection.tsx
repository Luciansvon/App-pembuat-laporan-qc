import { useMemo, useState } from 'react'
import { api } from '../services/api'
import type { Customer, Product } from '../types/qc'
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
const axes = ['L', 'W', 'D', 'H'] as const

export default function NewInspection({ customers, products, onCreate, onRefresh }: {
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

