import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, StatCard, SectionTitle, Modal, Empty, Spinner,
  PRODUCTS_LIST
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import ImageUpload from '../components/ImageUpload'
import { Plus, Package, Clock, Boxes, ChevronRight } from 'lucide-react'

// ─── Inner Component (needs toast context) ────────────────────────────────
function Inner() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [products, setProducts]     = useState([])
  const [production, setProduction] = useState([])
  const [stats, setStats]           = useState({ total: 0, retail: 0, wholesale: 0 })
  const [stockMap, setStockMap]     = useState({})
  const [showForm, setShowForm]     = useState(false)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)

  // Form state
  const [form, setForm] = useState({
    product_id: '',
    quantity: '',
    destination: 'retail', // 'retail' | 'wholesale'
    image_url: null,
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: prods }, { data: prod }, { data: dist }, { data: sales }] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('production').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('distribution').select('product_id, quantity'),
        supabase.from('sales').select('product_id, quantity'),
      ])

      setProducts(prods || [])
      setProduction(prod || [])

      // Compute stats
      const total     = (prod || []).reduce((s, r) => s + r.quantity, 0)
      const retail    = (prod || []).filter(r => r.destination === 'retail').reduce((s, r) => s + r.quantity, 0)
      const wholesale = (prod || []).filter(r => r.destination === 'wholesale').reduce((s, r) => s + r.quantity, 0)
      setStats({ total, retail, wholesale })

      // Stock map per product
      const prodMap  = {}; const distMap = {}; const salesMap = {}
      ;(prod  || []).forEach(r => { prodMap[r.product_id]  = (prodMap[r.product_id]  || 0) + r.quantity })
      ;(dist  || []).forEach(r => { distMap[r.product_id]  = (distMap[r.product_id]  || 0) + r.quantity })
      ;(sales || []).forEach(r => { salesMap[r.product_id] = (salesMap[r.product_id] || 0) + r.quantity })

      const map = {}
      ;(prods || []).forEach(p => {
        const produced   = prodMap[p.id]  || 0
        const distributed = distMap[p.id] || 0
        const sold        = salesMap[p.id] || 0
        map[p.id] = { produced, distributed, sold, remaining: produced - distributed - sold }
      })
      setStockMap(map)

      if (prods?.length) setForm(f => ({ ...f, product_id: prods[0].id }))
    } catch (e) {
      toast.error('ໂຫລດຂໍ້ມູນຜິດພາດ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Realtime subscriptions ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('producer-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },   () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },        () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.product_id || !form.quantity) { toast.error('ກະລຸນາໃສ່ຂໍ້ມູນໃຫ້ຄົບ'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('production').insert({
        product_id:  form.product_id,
        quantity:    parseInt(form.quantity),
        destination: form.destination,
        image_url:   form.image_url,
        notes:       form.notes || null,
        created_by:  user.id,
      })
      if (error) throw error
      toast.success('ບັນທຶກການຜະລິດສຳເລັດ ✅')
      setShowForm(false)
      setForm(f => ({ ...f, quantity: '', image_url: null, notes: '' }))
      load()
    } catch (err) {
      toast.error('ບັນທຶກຜິດພາດ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="ຜູ້ຜະລິດ" subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />
      <Page>
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={36} /></div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="ຜະລິດທັງໝົດ" value={stats.total.toLocaleString()} sub="ຕຸກ" icon="📦" color="yellow" />
              <StatCard label="ຂື້ນຮ້ານດາດ"  value={stats.retail.toLocaleString()}    sub="ຕຸກ" icon="🏪" color="green" />
              <StatCard label="ຂາຍສົ່ງ"       value={stats.wholesale.toLocaleString()} sub="ຕຸກ" icon="🚚" color="blue" />
              <StatCard label="ລາຍການ"         value={production.length}               sub="ຄັ້ງ" icon="📋" color="white" />
            </div>

            {/* Stock per product */}
            <SectionTitle><Boxes size={18} className="text-brand-yellow" />Stock ຄ້າງສາງ</SectionTitle>
            <div className="space-y-2 mb-6">
              {products.map(p => {
                const s = stockMap[p.id] || {}
                const rem = s.remaining || 0
                return (
                  <div key={p.id} className="card flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium text-sm">{p.type} {p.size}</p>
                      <p className="text-gray-500 text-xs">ຜະລິດ {s.produced||0} | ກະຈາຍ {s.distributed||0} | ຂາຍ {s.sold||0}</p>
                    </div>
                    <div className={`text-xl font-bold ${rem > 0 ? 'text-brand-yellow' : 'text-red-400'}`}>
                      {rem}
                      <span className="text-xs font-normal text-gray-400 ml-1">ຕຸກ</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add button */}
            <button onClick={() => setShowForm(true)} className="btn-primary w-full mb-6">
              <Plus size={22} /> ບັນທຶກການຜະລິດ
            </button>

            {/* History */}
            <SectionTitle><Clock size={18} className="text-brand-yellow" />ປະຫວັດການຜະລິດ</SectionTitle>
            {production.length === 0 ? (
              <Empty icon="📦" message="ຍັງບໍ່ມີລາຍການ" />
            ) : (
              <div className="space-y-2">
                {production.slice(0, 30).map(r => (
                  <div key={r.id} className="card">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-medium text-sm">
                          {r.products?.type} {r.products?.size}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">{fmtDate(r.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-brand-yellow font-bold text-lg">{r.quantity.toLocaleString()}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.destination === 'retail'
                            ? 'bg-green-900/40 text-green-400'
                            : 'bg-blue-900/40 text-blue-400'
                        }`}>
                          {r.destination === 'retail' ? 'ຮ້ານດາດ' : 'ຂາຍສົ່ງ'}
                        </span>
                      </div>
                    </div>
                    {r.notes && <p className="text-gray-500 text-xs mt-2">📝 {r.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Page>

      {/* Production Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="🏭 ບັນທຶກການຜະລິດ">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product select */}
          <div>
            <label className="field-label">ສິນຄ້າ</label>
            <select
              value={form.product_id}
              onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
              className="select-field"
              required
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.type} {p.size}</option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="field-label">ຈຳນວນ (ຕຸກ)</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              placeholder="ໃສ່ຈຳນວນ"
              required
              className="input-field text-2xl font-bold text-brand-yellow"
            />
          </div>

          {/* Destination Toggle */}
          <div>
            <label className="field-label">ປາຍທາງ</label>
            <div className="flex gap-3">
              {[
                { val: 'retail',    label: '🏪 ຂື້ນຮ້ານດາດ' },
                { val: 'wholesale', label: '🚚 ຂາຍສົ່ງ' },
              ].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, destination: opt.val }))}
                  className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all ${
                    form.destination === opt.val
                      ? 'bg-brand-yellow text-dark-900'
                      : 'bg-dark-600 text-gray-300 border border-dark-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Image */}
          <ImageUpload
            bucket="production-images"
            label="ຮູບການຜະລິດ (ທາງເລືອກ)"
            onUpload={path => setForm(f => ({ ...f, image_url: path }))}
          />

          {/* Notes */}
          <div>
            <label className="field-label">ໝາຍເຫດ (ທາງເລືອກ)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="ໝາຍເຫດເພີ່ມເຕີມ..."
              rows={2}
              className="input-field resize-none"
            />
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

export default function ProducerDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
