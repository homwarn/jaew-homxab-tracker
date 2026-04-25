import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, StatCard, SectionTitle, Modal, Empty, Spinner
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import ImageUpload from '../components/ImageUpload'
import { Plus, Truck, Store, Clock, CreditCard, Banknote } from 'lucide-react'

function Inner() {
  const { user } = useAuth()
  const toast = useToast()
  const [products, setProducts]      = useState([])
  const [stores, setStores]          = useState([])
  const [distributions, setDist]     = useState([])
  const [stats, setStats]            = useState({ total: 0, cash: 0, transfer: 0, count: 0 })
  const [showForm, setShowForm]      = useState(false)
  const [showNewStore, setShowNewStore] = useState(false)
  const [loading, setLoading]        = useState(true)
  const [saving, setSaving]          = useState(false)
  const [newStoreName, setNewStoreName] = useState('')
  const [addingStore, setAddingStore] = useState(false)

  const [form, setForm] = useState({
    product_id: '',
    quantity: '',
    store_name: '',
    payment_method: 'cash',
    receiver_name: '',
    transfer_note: '',
    bill_image_url: null,
    slip_image_url: null,
    delivery_image_url: null,
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: prods }, { data: storeList }, { data: dist }] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('stores').select('*').order('name'),
        supabase.from('distribution').select('*, products(*)').order('created_at', { ascending: false }),
      ])
      setProducts(prods || [])
      setStores(storeList || [])
      setDist(dist || [])

      const total    = (dist || []).reduce((s, r) => s + r.quantity, 0)
      const cash     = (dist || []).filter(r => r.payment_method === 'cash').reduce((s, r) => s + r.quantity, 0)
      const transfer = (dist || []).filter(r => r.payment_method === 'transfer').reduce((s, r) => s + r.quantity, 0)
      setStats({ total, cash, transfer, count: (dist || []).length })

      if (prods?.length) setForm(f => ({ ...f, product_id: prods[0].id }))
      if (storeList?.length) setForm(f => ({ ...f, store_name: storeList[0].name }))
    } catch {
      toast.error('ໂຫລດຂໍ້ມູນຜິດພາດ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Realtime subscriptions ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('distributor-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },   () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },        () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function addStore() {
    if (!newStoreName.trim()) return
    setAddingStore(true)
    try {
      const { error } = await supabase.from('stores').insert({ name: newStoreName.trim() })
      if (error) throw error
      toast.success('ເພີ່ມຮ້ານສຳເລັດ')
      setNewStoreName('')
      setShowNewStore(false)
      const { data } = await supabase.from('stores').select('*').order('name')
      setStores(data || [])
      setForm(f => ({ ...f, store_name: newStoreName.trim() }))
    } catch (err) {
      toast.error(err.message.includes('unique') ? 'ມີຊື່ຮ້ານນີ້ແລ້ວ' : err.message)
    } finally {
      setAddingStore(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.product_id || !form.quantity || !form.store_name) { toast.error('ໃສ່ຂໍ້ມູນໃຫ້ຄົບ'); return }
    if (form.payment_method === 'cash' && !form.receiver_name) { toast.error('ໃສ່ຊື່ຜູ້ຮັບເງິນ'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('distribution').insert({
        product_id:          form.product_id,
        quantity:            parseInt(form.quantity),
        store_name:          form.store_name,
        payment_method:      form.payment_method,
        receiver_name:       form.payment_method === 'cash'     ? form.receiver_name  : null,
        transfer_note:       form.payment_method === 'transfer' ? form.transfer_note  : null,
        bill_image_url:      form.bill_image_url,
        slip_image_url:      form.payment_method === 'transfer' ? form.slip_image_url : null,
        delivery_image_url:  form.delivery_image_url,
        notes:               form.notes || null,
        created_by:          user.id,
      })
      if (error) throw error
      toast.success('ບັນທຶກການກະຈາຍສຳເລັດ ✅')
      setShowForm(false)
      setForm(f => ({ ...f, quantity: '', receiver_name: '', transfer_note: '', bill_image_url: null, slip_image_url: null, delivery_image_url: null, notes: '' }))
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

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="ຜູ້ກະຈາຍ" subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />
      <Page>
        {loading ? <div className="flex justify-center py-20"><Spinner size={36} /></div> : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="ກະຈາຍທັງໝົດ" value={stats.total.toLocaleString()} sub="ຕຸກ" icon="🚚" color="yellow" />
              <StatCard label="ລາຍການ"        value={stats.count}                 sub="ຄັ້ງ" icon="📋" color="white" />
              <StatCard label="ເງິນສົດ"        value={stats.cash.toLocaleString()} sub="ຕຸກ" icon="💵" color="green" />
              <StatCard label="ໂອນ"           value={stats.transfer.toLocaleString()} sub="ຕຸກ" icon="💳" color="blue" />
            </div>

            <button onClick={() => setShowForm(true)} className="btn-primary w-full mb-6">
              <Plus size={22} /> ບັນທຶກການກະຈາຍ
            </button>

            {/* History */}
            <SectionTitle><Clock size={18} className="text-brand-yellow" />ປະຫວັດການກະຈາຍ</SectionTitle>
            {distributions.length === 0 ? <Empty icon="🚚" message="ຍັງບໍ່ມີລາຍການ" /> : (
              <div className="space-y-2">
                {distributions.slice(0, 30).map(r => (
                  <div key={r.id} className="card">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                        <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                          <Store size={12} /> {r.store_name}
                        </p>
                        <p className="text-gray-500 text-xs">{fmtDate(r.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-brand-yellow font-bold text-lg">{r.quantity}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.payment_method === 'cash'
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-blue-900/30 text-blue-400'
                        }`}>
                          {r.payment_method === 'cash' ? '💵 ສົດ' : '💳 ໂອນ'}
                        </span>
                      </div>
                    </div>
                    {r.receiver_name && <p className="text-gray-500 text-xs mt-1">👤 {r.receiver_name}</p>}
                    {r.transfer_note  && <p className="text-gray-500 text-xs mt-1">📝 {r.transfer_note}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Page>

      {/* Distribution Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="🚚 ບັນທຶກການກະຈາຍ">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product */}
          <div>
            <label className="field-label">ສິນຄ້າ</label>
            <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} className="select-field" required>
              {products.map(p => <option key={p.id} value={p.id}>{p.type} {p.size}</option>)}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="field-label">ຈຳນວນ (ຕຸກ)</label>
            <input type="number" inputMode="numeric" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="ໃສ່ຈຳນວນ" required className="input-field text-2xl font-bold text-brand-yellow" />
          </div>

          {/* Store */}
          <div>
            <label className="field-label">ຮ້ານຄ້າ</label>
            <div className="flex gap-2">
              <select value={form.store_name} onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))} className="select-field flex-1" required>
                <option value="">-- ເລືອກຮ້ານ --</option>
                {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewStore(true)} className="px-4 py-3 bg-dark-600 border border-dark-400 text-brand-yellow rounded-2xl font-bold text-lg shrink-0">+</button>
            </div>
          </div>

          {/* Add New Store */}
          {showNewStore && (
            <div className="flex gap-2">
              <input value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="ຊື່ຮ້ານໃໝ່" className="input-field flex-1" />
              <button type="button" onClick={addStore} disabled={addingStore} className="btn-primary px-4">
                {addingStore ? <div className="spinner border-dark-900" /> : 'ເພີ່ມ'}
              </button>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <label className="field-label">ວິທີຊຳລະ</label>
            <div className="flex gap-3">
              {[
                { val: 'cash',     label: '💵 ເງິນສົດ' },
                { val: 'transfer', label: '💳 ໂອນ' },
              ].map(opt => (
                <button key={opt.val} type="button" onClick={() => setForm(f => ({ ...f, payment_method: opt.val }))}
                  className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all ${form.payment_method === opt.val ? 'bg-brand-yellow text-dark-900' : 'bg-dark-600 text-gray-300 border border-dark-400'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash: receiver name */}
          {form.payment_method === 'cash' && (
            <div>
              <label className="field-label">ຊື່ຜູ້ຮັບເງິນ *</label>
              <input value={form.receiver_name} onChange={e => setForm(f => ({ ...f, receiver_name: e.target.value }))} placeholder="ຊື່ຜູ້ຮັບ" className="input-field" required />
            </div>
          )}

          {/* Transfer: note + slip */}
          {form.payment_method === 'transfer' && (
            <>
              <div>
                <label className="field-label">ໝາຍເຫດໂອນ</label>
                <input value={form.transfer_note} onChange={e => setForm(f => ({ ...f, transfer_note: e.target.value }))} placeholder="ເລກ Ref / ໝາຍເຫດ" className="input-field" />
              </div>
              <ImageUpload bucket="distribution-images" label="ອັບໂຫລດ Slip ໂອນ" onUpload={path => setForm(f => ({ ...f, slip_image_url: path }))} />
            </>
          )}

          {/* Bill image */}
          <ImageUpload bucket="distribution-images" label="ຮູບໃບບິນ (ທາງເລືອກ)" onUpload={path => setForm(f => ({ ...f, bill_image_url: path }))} />

          {/* Delivery image */}
          <ImageUpload bucket="distribution-images" label="ຮູບການສົ່ງ (ທາງເລືອກ)" onUpload={path => setForm(f => ({ ...f, delivery_image_url: path }))} />

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

export default function DistributorDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
