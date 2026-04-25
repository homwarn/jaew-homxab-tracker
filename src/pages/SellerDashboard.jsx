import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, StatCard, SectionTitle, Modal, Empty, Spinner
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import ImageUpload from '../components/ImageUpload'
import { Plus, ShoppingCart, Clock, ClipboardList, Package } from 'lucide-react'

const ORDER_STATUS = {
  pending:   { label: 'ລໍຖ້າ',    color: 'bg-yellow-900/30 text-yellow-400' },
  confirmed: { label: 'ຢືນຢັນ',   color: 'bg-blue-900/30 text-blue-400' },
  delivered: { label: 'ສົ່ງແລ້ວ', color: 'bg-green-900/30 text-green-400' },
}

function Inner() {
  const { user, profile } = useAuth()
  const toast = useToast()

  const storeName = profile?.store_name || ''

  const [products, setProducts]     = useState([])
  const [sales, setSales]           = useState([])
  const [orders, setOrders]         = useState([])
  const [stats, setStats]           = useState({ totalSold: 0, totalRemaining: 0, count: 0 })
  const [loading, setLoading]       = useState(true)

  // ── Sales form ──
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({
    product_id: '', quantity: '', remaining: '',
    store_name: storeName, image_url: null, report_image_url: null, notes: '',
  })

  // ── Order form ──
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [savingOrder, setSavingOrder]     = useState(false)
  const [orderForm, setOrderForm] = useState({
    product_id: '', quantity: '', notes: '',
  })

  // ─── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [{ data: prods }, { data: s }, { data: ord }] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('sales')
          .select('*, products(*)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('orders')
          .select('*, products(*)')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      setProducts(prods || [])
      setSales(s || [])
      setOrders(ord || [])

      const totalSold      = (s || []).reduce((acc, r) => acc + (r.quantity || 0), 0)
      const totalRemaining = (s || []).length ? (s[0]?.remaining ?? 0) : 0
      setStats({ totalSold, totalRemaining, count: (s || []).length })

      if (prods?.length) {
        setForm(f => ({ ...f, product_id: f.product_id || prods[0].id }))
        setOrderForm(f => ({ ...f, product_id: f.product_id || prods[0].id }))
      }
    } catch {
      toast.error('ໂຫລດຂໍ້ມູນຜິດພາດ')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  // ─── Realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel('seller-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },   () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },       () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // ─── Report sales ─────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.product_id) { toast.error('ເລືອກສິນຄ້າ'); return }
    if (form.remaining === '' || form.remaining === null || form.remaining === undefined) {
      toast.error('ໃສ່ stock ຍັງເຫລືອ'); return
    }
    if (form.quantity !== '' && parseInt(form.quantity) < 0) {
      toast.error('ຈຳນວນຂາຍຕ້ອງຫຼາຍກວ່າ 0'); return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('sales').insert({
        product_id:       form.product_id,
        quantity:         form.quantity !== '' ? parseInt(form.quantity) : null,
        remaining:        parseInt(form.remaining),
        store_name:       form.store_name || storeName || 'ຮ້ານຂາຍ',
        image_url:        form.image_url,
        report_image_url: form.report_image_url,
        notes:            form.notes || null,
        created_by:       user.id,
      })
      if (error) throw error
      toast.success('ບັນທຶກຍອດຂາຍສຳເລັດ ✅')
      setShowForm(false)
      setForm(f => ({ ...f, quantity: '', remaining: '', image_url: null, report_image_url: null, notes: '' }))
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Place order ──────────────────────────────────────────────────────
  async function handleOrderSubmit(e) {
    e.preventDefault()
    if (!orderForm.product_id || !orderForm.quantity) { toast.error('ໃສ່ຂໍ້ມູນໃຫ້ຄົບ'); return }
    if (parseInt(orderForm.quantity) <= 0) { toast.error('ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0'); return }
    setSavingOrder(true)
    try {
      const { error } = await supabase.from('orders').insert({
        product_id: orderForm.product_id,
        quantity:   parseInt(orderForm.quantity),
        notes:      orderForm.notes || null,
        store_name: storeName || 'ຮ້ານຂາຍ',
        status:     'pending',
        created_by: user.id,
      })
      if (error) throw error
      toast.success('ສົ່ງ Order ສຳເລັດ ✅ ລໍຖ້າ Admin ຢືນຢັນ')
      setShowOrderForm(false)
      setOrderForm(f => ({ ...f, quantity: '', notes: '' }))
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally {
      setSavingOrder(false)
    }
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const today      = new Date().toDateString()
  const todaySales = sales.filter(r => new Date(r.created_at).toDateString() === today)
  const todayTotal = todaySales.reduce((s, r) => s + (r.quantity || 0), 0)
  const pendingOrderCount = orders.filter(o => o.status === 'pending').length

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title={storeName || 'ຜູ້ຂາຍ'} subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />
      <Page>
        {loading ? <div className="flex justify-center py-20"><Spinner size={36} /></div> : (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="ຂາຍວັນນີ້"     value={todayTotal.toLocaleString()}          sub="ຕຸກ" icon="📈" color="yellow" />
              <StatCard label="Stock ຍັງເຫລືອ" value={sales[0]?.remaining ?? '-'}           sub="ຕຸກ" icon="📦" color="green" />
              <StatCard label="ລວມທັງໝົດ"      value={stats.totalSold.toLocaleString()}      sub="ຕຸກ" icon="🛒" color="blue" />
              <StatCard label="Order ຂອງຂ້ອຍ"  value={pendingOrderCount}                    sub="ລໍຖ້າ" icon="📋" color={pendingOrderCount > 0 ? 'yellow' : 'white'} />
            </div>

            {/* ── Action buttons ── */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setShowForm(true)} className="btn-primary">
                <Plus size={20} /> ລາຍງານຍອດ
              </button>
              <button onClick={() => setShowOrderForm(true)}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-900/30 text-blue-400 border border-blue-400/30 hover:bg-blue-900/50 transition-colors font-medium text-sm">
                <Package size={20} /> ສັ່ງສິນຄ້າ
              </button>
            </div>

            {/* ── Today's sales ── */}
            {todaySales.length > 0 && (
              <>
                <SectionTitle><ShoppingCart size={18} className="text-brand-yellow" />ຍອດຂາຍວັນນີ້</SectionTitle>
                <div className="space-y-2 mb-6">
                  {todaySales.map(r => (
                    <div key={r.id} className="card border-brand-yellow/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                          <p className="text-gray-500 text-xs">{fmtDate(r.created_at)}</p>
                        </div>
                        <div className="text-right">
                          {r.quantity !== null && r.quantity !== undefined
                            ? <p className="text-brand-yellow font-bold text-lg">+{r.quantity}</p>
                            : <p className="text-gray-500 text-sm">-</p>
                          }
                          <p className="text-gray-400 text-xs">ເຫລືອ: {r.remaining}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── My orders ── */}
            {orders.length > 0 && (
              <>
                <SectionTitle><ClipboardList size={18} className="text-brand-yellow" />Order ຂອງຂ້ອຍ</SectionTitle>
                <div className="space-y-2 mb-6">
                  {orders.map(o => (
                    <div key={o.id} className="card">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium text-sm">{o.products?.type} {o.products?.size}</p>
                          <p className="text-gray-500 text-xs">{fmtDate(o.created_at)}</p>
                          {o.notes && <p className="text-gray-500 text-xs">📝 {o.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-brand-yellow font-bold">{o.quantity} ຕຸກ</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ORDER_STATUS[o.status]?.color}`}>
                            {ORDER_STATUS[o.status]?.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Full history ── */}
            <SectionTitle><Clock size={18} className="text-brand-yellow" />ປະຫວັດລາຍງານ</SectionTitle>
            {sales.length === 0 ? <Empty icon="🛒" message="ຍັງບໍ່ມີລາຍການ" /> : (
              <div className="space-y-2">
                {sales.slice(0, 30).map(r => (
                  <div key={r.id} className="card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">{r.products?.type} {r.products?.size}</p>
                        <p className="text-gray-500 text-xs">{fmtDate(r.created_at)}</p>
                      </div>
                      <div className="text-right">
                        {r.quantity !== null && r.quantity !== undefined
                          ? <p className="text-brand-yellow font-bold">{r.quantity} ຕຸກ</p>
                          : <p className="text-gray-500 text-sm">ບໍ່ລາຍງານ</p>
                        }
                        <p className="text-gray-400 text-xs">ເຫລືອ {r.remaining}</p>
                      </div>
                    </div>
                    {r.notes && <p className="text-gray-500 text-xs mt-1">📝 {r.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Page>

      {/* ── Sales Form Modal ────────────────────────────────────────────── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="🛒 ລາຍງານຍອດຂາຍ">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">ສິນຄ້າ *</label>
            <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} className="select-field" required>
              {products.map(p => <option key={p.id} value={p.id}>{p.type} {p.size}</option>)}
            </select>
          </div>

          {/* Remaining — required */}
          <div>
            <label className="field-label">Stock ຍັງເຫລືອ (ຕຸກ) *</label>
            <input
              type="number" inputMode="numeric" min="0"
              value={form.remaining}
              onChange={e => setForm(f => ({ ...f, remaining: e.target.value }))}
              placeholder="ຈຳນວນທີ່ຍັງຄ້າງໃນຮ້ານ"
              required
              className="input-field text-2xl font-bold text-green-400"
            />
          </div>

          {/* Quantity sold — optional */}
          <div>
            <label className="field-label">ຈຳນວນຂາຍ (ຕຸກ) <span className="text-gray-500 font-normal">— ທາງເລືອກ</span></label>
            <input
              type="number" inputMode="numeric" min="0"
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              placeholder="ໃສ່ຖ້າທ່ານຕ້ອງການລາຍງານ"
              className="input-field text-2xl font-bold text-brand-yellow"
            />
          </div>

          {!storeName && (
            <div>
              <label className="field-label">ຊື່ຮ້ານ</label>
              <input value={form.store_name} onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))} placeholder="ຊື່ຮ້ານ" className="input-field" />
            </div>
          )}

          <ImageUpload bucket="sales-images" label="ຮູບຮ້ານ / Stock (ທາງເລືອກ)" onUpload={path => setForm(f => ({ ...f, image_url: path }))} />
          <ImageUpload bucket="sales-images" label="ຮູບລາຍງານປະຈຳວັນ (ທາງເລືອກ)" onUpload={path => setForm(f => ({ ...f, report_image_url: path }))} />

          <div>
            <label className="field-label">ໝາຍເຫດ</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ໝາຍເຫດ..." rows={2} className="input-field resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Order Form Modal ────────────────────────────────────────────── */}
      <Modal open={showOrderForm} onClose={() => setShowOrderForm(false)} title="📦 ສັ່ງສິນຄ້າ">
        <form onSubmit={handleOrderSubmit} className="space-y-4">
          <p className="text-gray-400 text-sm">ສັ່ງສິນຄ້າໃຫ້ Admin ຢືນຢັນ ແລະ ຈັດສົ່ງ</p>

          <div>
            <label className="field-label">ສິນຄ້າ *</label>
            <select value={orderForm.product_id} onChange={e => setOrderForm(f => ({ ...f, product_id: e.target.value }))} className="select-field" required>
              {products.map(p => <option key={p.id} value={p.id}>{p.type} {p.size}</option>)}
            </select>
          </div>

          <div>
            <label className="field-label">ຈຳນວນທີ່ຕ້ອງການ (ຕຸກ) *</label>
            <input
              type="number" inputMode="numeric" min="1"
              value={orderForm.quantity}
              onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))}
              placeholder="ຈຳນວນທີ່ຕ້ອງການ"
              required
              className="input-field text-2xl font-bold text-blue-400"
            />
          </div>

          <div>
            <label className="field-label">ໝາຍເຫດ / ຂໍ້ຄວາມຫາ Admin</label>
            <textarea
              value={orderForm.notes}
              onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="ຂໍ້ຄວາມຫາ Admin..."
              rows={2}
              className="input-field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={() => setShowOrderForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button type="submit" disabled={savingOrder}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-900/30 text-blue-400 border border-blue-400/30 hover:bg-blue-900/50 transition-colors font-medium disabled:opacity-50">
              {savingOrder ? <><div className="spinner" style={{ borderColor: 'rgb(96 165 250 / 0.3)', borderTopColor: 'rgb(96 165 250)' }} />ກຳລັງສົ່ງ...</> : '📦 ສົ່ງ Order'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default function SellerDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
