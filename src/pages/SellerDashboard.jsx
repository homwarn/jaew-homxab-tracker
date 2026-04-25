import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, StatCard, SectionTitle, Modal, Empty, Spinner
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import ImageUpload from '../components/ImageUpload'
import { Plus, ShoppingCart, Clock, Package } from 'lucide-react'

function Inner() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [sales, setSales]       = useState([])
  const [stats, setStats]       = useState({ totalSold: 0, totalRemaining: 0, count: 0 })
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  const storeName = profile?.store_name || ''

  const [form, setForm] = useState({
    product_id: '',
    quantity: '',
    remaining: '',
    store_name: storeName,
    image_url: null,
    report_image_url: null,
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: prods }, { data: s }] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('sales')
          .select('*, products(*)')
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      setProducts(prods || [])
      setSales(s || [])

      const totalSold      = (s || []).reduce((acc, r) => acc + r.quantity, 0)
      const totalRemaining = (s || []).length ? (s[0]?.remaining || 0) : 0
      setStats({ totalSold, totalRemaining, count: (s || []).length })

      if (prods?.length) setForm(f => ({ ...f, product_id: prods[0].id }))
    } catch {
      toast.error('ໂຫລດຂໍ້ມູນຜິດພາດ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.product_id || !form.quantity) { toast.error('ໃສ່ຂໍ້ມູນໃຫ້ຄົບ'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('sales').insert({
        product_id:       form.product_id,
        quantity:         parseInt(form.quantity),
        remaining:        parseInt(form.remaining) || 0,
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

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
  }

  // Today's sales
  const today = new Date().toDateString()
  const todaySales = sales.filter(r => new Date(r.created_at).toDateString() === today)
  const todayTotal = todaySales.reduce((s, r) => s + r.quantity, 0)

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title={storeName || 'ຜູ້ຂາຍ'} subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />
      <Page>
        {loading ? <div className="flex justify-center py-20"><Spinner size={36} /></div> : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="ຂາຍວັນນີ້"     value={todayTotal.toLocaleString()} sub="ຕຸກ" icon="📈" color="yellow" />
              <StatCard label="Stock ຍັງເຫລືອ" value={sales[0]?.remaining ?? '-'}  sub="ຕຸກ" icon="📦" color="green" />
              <StatCard label="ລວມທັງໝົດ"      value={stats.totalSold.toLocaleString()} sub="ຕຸກ" icon="🛒" color="blue" />
              <StatCard label="ລາຍການ"          value={stats.count}                sub="ຄັ້ງ" icon="📋" color="white" />
            </div>

            <button onClick={() => setShowForm(true)} className="btn-primary w-full mb-6">
              <Plus size={22} /> ລາຍງານຍອດຂາຍ
            </button>

            {/* Today's report */}
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
                          <p className="text-brand-yellow font-bold text-lg">+{r.quantity}</p>
                          <p className="text-gray-400 text-xs">ເຫລືອ: {r.remaining}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Full History */}
            <SectionTitle><Clock size={18} className="text-brand-yellow" />ປະຫວັດ</SectionTitle>
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
                        <p className="text-brand-yellow font-bold">{r.quantity} ຕຸກ</p>
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

      {/* Sales Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="🛒 ລາຍງານຍອດຂາຍ">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product */}
          <div>
            <label className="field-label">ສິນຄ້າ</label>
            <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} className="select-field" required>
              {products.map(p => <option key={p.id} value={p.id}>{p.type} {p.size}</option>)}
            </select>
          </div>

          {/* Quantity sold */}
          <div>
            <label className="field-label">ຈຳນວນຂາຍ (ຕຸກ)</label>
            <input type="number" inputMode="numeric" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="ຈຳນວນທີ່ຂາຍໄດ້" required className="input-field text-2xl font-bold text-brand-yellow" />
          </div>

          {/* Remaining stock */}
          <div>
            <label className="field-label">ສິນຄ້າຍັງເຫລືອ (ຕຸກ)</label>
            <input type="number" inputMode="numeric" min="0" value={form.remaining} onChange={e => setForm(f => ({ ...f, remaining: e.target.value }))} placeholder="ຈຳນວນທີ່ຍັງຄ້າງ" className="input-field text-2xl font-bold text-green-400" />
          </div>

          {/* Store name (if not pre-filled) */}
          {!storeName && (
            <div>
              <label className="field-label">ຊື່ຮ້ານ</label>
              <input value={form.store_name} onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))} placeholder="ຊື່ຮ້ານ" className="input-field" />
            </div>
          )}

          {/* Store photo */}
          <ImageUpload bucket="sales-images" label="ຮູບຮ້ານ / Stock (ທາງເລືອກ)" onUpload={path => setForm(f => ({ ...f, image_url: path }))} />

          {/* Daily report image */}
          <ImageUpload bucket="sales-images" label="ຮູບລາຍງານປະຈຳວັນ (ທາງເລືອກ)" onUpload={path => setForm(f => ({ ...f, report_image_url: path }))} />

          {/* Notes */}
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
    </div>
  )
}

export default function SellerDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
