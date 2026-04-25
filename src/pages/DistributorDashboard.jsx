import { useState, useEffect, useCallback } from 'react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, StatCard, SectionTitle, Modal, Empty, Spinner
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import ImageUpload from '../components/ImageUpload'
import { Plus, Truck, Store, Clock, Trash2, ChevronRight, Image, Bell, CheckCircle, ClipboardList } from 'lucide-react'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('lo-LA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function Inner() {
  const { user } = useAuth()
  const toast = useToast()
  const [products, setProducts]   = useState([])
  const [stores, setStores]       = useState([])
  const [distributions, setDist]  = useState([])
  const [stats, setStats]         = useState({ total: 0, cash: 0, transfer: 0, count: 0 })
  const [showForm, setShowForm]   = useState(false)
  const [showNewStore, setShowNewStore] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [newStoreName, setNewStoreName] = useState('')
  const [addingStore, setAddingStore]   = useState(false)

  // Multi-product items
  const [items, setItems]               = useState([{ product_id: '', quantity: '', unit_price: '' }])
  // Shared form fields
  const [storeName, setStoreName]       = useState('')
  const [payMethod, setPayMethod]       = useState('cash')
  const [receiverName, setReceiverName] = useState('')
  const [transferNote, setTransferNote] = useState('')
  const [billImg, setBillImg]           = useState(null)
  const [slipImg, setSlipImg]           = useState(null)
  const [deliveryImg, setDeliveryImg]   = useState(null)
  const [formNotes, setFormNotes]       = useState('')

  // Detail modal
  const [detail, setDetail]             = useState(null)
  const [detailImgs, setDetailImgs]     = useState({})
  const [loadingImg, setLoadingImg]     = useState(false)

  // Notifications (Admin → Distributor pickup orders)
  const [notifications, setNotifications] = useState([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: prods }, { data: storeList }, { data: dist }, { data: notifs }] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('stores').select('*').order('name'),
        supabase.from('distribution').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('notifications')
          .select('*, profiles!notifications_created_by_fkey(name)')
          .or(`assigned_to.eq.${user.id},assigned_to.is.null`)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      setProducts(prods || [])
      setStores(storeList || [])
      setDist(dist || [])
      setNotifications(notifs || [])
      const total    = (dist || []).reduce((s, r) => s + r.quantity, 0)
      const cash     = (dist || []).filter(r => r.payment_method === 'cash').reduce((s, r) => s + r.quantity, 0)
      const transfer = (dist || []).filter(r => r.payment_method === 'transfer').reduce((s, r) => s + r.quantity, 0)
      setStats({ total, cash, transfer, count: (dist||[]).length })
      if (prods?.length) setItems([{ product_id: prods[0].id, quantity: '', unit_price: '' }])
      if (storeList?.length) setStoreName(storeList[0].name)
    } catch { toast.error('ໂຫລດຂໍ້ມູນຜິດພາດ') }
    finally { setLoading(false) }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('distributor-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },   () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  // ─── Acknowledge notification (กดรับ) ─────────────────────────────────────
  async function acknowledgeNotif(id) {
    try {
      const { error } = await supabase.from('notifications').update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      toast.success('ຮັບຄຳສັ່ງສຳເລັດ ✅')
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    }
  }

  // ─── Item helpers ─────────────────────────────────────────────────────────
  function addItem() {
    setItems(prev => [...prev, { product_id: products[0]?.id || '', quantity: '', unit_price: '' }])
  }
  function removeItem(i) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateItem(i, field, val) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }

  // ─── Open detail with images ───────────────────────────────────────────────
  async function openDetail(r) {
    setDetail(r)
    setDetailImgs({})
    setLoadingImg(true)
    const urls = {}
    const imageFields = ['bill_image_url', 'slip_image_url', 'delivery_image_url']
    await Promise.all(imageFields.map(async field => {
      if (r[field]) {
        const url = await getSignedUrl('distribution-images', r[field])
        if (url) urls[field] = url
      }
    }))
    setDetailImgs(urls)
    setLoadingImg(false)
  }

  // ─── Add store ────────────────────────────────────────────────────────────
  async function addStore() {
    if (!newStoreName.trim()) return
    setAddingStore(true)
    try {
      const { error } = await supabase.from('stores').insert({ name: newStoreName.trim() })
      if (error) throw error
      toast.success('ເພີ່ມຮ້ານສຳເລັດ')
      const { data } = await supabase.from('stores').select('*').order('name')
      setStores(data || [])
      setStoreName(newStoreName.trim())
      setNewStoreName('')
      setShowNewStore(false)
    } catch (err) {
      toast.error(err.message.includes('unique') ? 'ມີຊື່ຮ້ານນີ້ແລ້ວ' : err.message)
    } finally { setAddingStore(false) }
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const valid = items.filter(i => i.product_id && i.quantity && parseInt(i.quantity) > 0)
    if (!valid.length) { toast.error('ໃສ່ສິນຄ້າ ແລະ ຈຳນວນໃຫ້ຄົບ'); return }
    if (!storeName)    { toast.error('ເລືອກຮ້ານຄ້າ'); return }
    if (payMethod === 'cash' && !receiverName) { toast.error('ໃສ່ຊື່ຜູ້ຮັບເງິນ'); return }
    setSaving(true)
    try {
      const records = valid.map(i => ({
        product_id:         i.product_id,
        quantity:           parseInt(i.quantity),
        unit_price:         i.unit_price !== '' ? parseFloat(i.unit_price) : 0,
        store_name:         storeName,
        payment_method:     payMethod,
        receiver_name:      payMethod==='cash' ? receiverName : null,
        transfer_note:      payMethod==='transfer' ? transferNote : null,
        bill_image_url:     billImg,
        slip_image_url:     payMethod==='transfer' ? slipImg : null,
        delivery_image_url: deliveryImg,
        notes:              formNotes || null,
        created_by:         user.id,
      }))
      const { error } = await supabase.from('distribution').insert(records)
      if (error) throw error
      toast.success(`ບັນທຶກ ${records.length} ລາຍການ ສຳເລັດ ✅`)
      setShowForm(false)
      setItems([{ product_id: products[0]?.id || '', quantity: '', unit_price: '' }])
      setReceiverName(''); setTransferNote(''); setFormNotes('')
      setBillImg(null); setSlipImg(null); setDeliveryImg(null)
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
    finally { setSaving(false) }
  }

  // ─── Notification stats ───────────────────────────────────────────────────
  const pendingNotifs = notifications.filter(n => n.status === 'pending')
  const ackedNotifs   = notifications.filter(n => n.status === 'acknowledged')

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="ຜູ້ກະຈາຍ" subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />
      <Page>
        {loading ? <div className="flex justify-center py-20"><Spinner size={36} /></div> : (
          <>
            {/* ─── Pending Pickup Alerts (Top banner) ─── */}
            {pendingNotifs.length > 0 && (
              <button onClick={() => setShowNotifPanel(true)}
                className="w-full mb-4 card border-yellow-500/40 bg-yellow-900/10 hover:bg-yellow-900/20 transition-colors text-left animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Bell size={24} className="text-yellow-400" />
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {pendingNotifs.length}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-yellow-400 font-semibold text-sm">
                      🔔 ມີຄຳສັ່ງຈາກ Admin {pendingNotifs.length} ລາຍການ
                    </p>
                    <p className="text-yellow-400/70 text-xs mt-0.5">ກົດເພື່ອເບິ່ງ ແລະ ກົດຮັບ →</p>
                  </div>
                </div>
              </button>
            )}

            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="ກະຈາຍທັງໝົດ" value={stats.total.toLocaleString()} sub="ຕຸກ" icon="🚚" color="yellow" />
              <StatCard label="ລາຍການ"        value={stats.count}                   sub="ຄັ້ງ" icon="📋" color="white" />
              <StatCard label="ເງິນສົດ"        value={stats.cash.toLocaleString()}   sub="ຕຸກ" icon="💵" color="green" />
              <StatCard label="ໂອນ"            value={stats.transfer.toLocaleString()} sub="ຕຸກ" icon="💳" color="blue" />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setShowForm(true)} className="btn-primary">
                <Plus size={20} /> ບັນທຶກກະຈາຍ
              </button>
              <button onClick={() => setShowNotifPanel(true)}
                className="relative btn-secondary border-blue-400/30 text-blue-400 hover:bg-blue-900/20">
                <ClipboardList size={20} /> ຄຳສັ່ງຈາກ Admin
                {pendingNotifs.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {pendingNotifs.length}
                  </span>
                )}
              </button>
            </div>

            <SectionTitle><Clock size={18} className="text-brand-yellow" />ປະຫວັດການກະຈາຍ</SectionTitle>
            {distributions.length === 0 ? <Empty icon="🚚" message="ຍັງບໍ່ມີລາຍການ" /> : (
              <div className="space-y-2">
                {distributions.slice(0, 50).map(r => (
                  <button key={r.id} onClick={() => openDetail(r)}
                    className="card w-full text-left hover:border-brand-yellow/40 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                        <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5"><Store size={11}/> {r.store_name}</p>
                        <p className="text-gray-500 text-xs">{fmtDate(r.created_at)}</p>
                        {(r.bill_image_url || r.slip_image_url || r.delivery_image_url) &&
                          <p className="text-brand-yellow text-xs mt-1 flex items-center gap-1"><Image size={11}/>ມີຮູບພາບ</p>}
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="text-brand-yellow font-bold text-lg">{r.quantity}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.payment_method==='cash'?'bg-green-900/30 text-green-400':'bg-blue-900/30 text-blue-400'}`}>
                            {r.payment_method==='cash'?'💵 ສົດ':'💳 ໂອນ'}
                          </span>
                        </div>
                        <ChevronRight size={16} className="text-gray-500" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Page>

      {/* ─── Distribution Form Modal ─── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="🚚 ບັນທຶກການກະຈາຍ">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Multi-product items */}
          <div className="space-y-3">
            <label className="field-label">ລາຍການສິນຄ້າ</label>
            {items.map((item, i) => (
              <div key={i} className="bg-dark-600 rounded-2xl p-3 space-y-2 border border-dark-400">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">ລາຍການ {i+1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-red-400 p-1"><Trash2 size={14}/></button>
                  )}
                </div>
                <select value={item.product_id} onChange={e => updateItem(i,'product_id',e.target.value)} className="select-field" required>
                  {products.map(p => <option key={p.id} value={p.id}>{p.type} {p.size}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" inputMode="numeric" min="1" value={item.quantity}
                    onChange={e => updateItem(i,'quantity',e.target.value)}
                    placeholder="ຈຳນວນ (ຕຸກ)" required
                    className="input-field text-xl font-bold text-brand-yellow" />
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={item.unit_price}
                    onChange={e => updateItem(i,'unit_price',e.target.value)}
                    placeholder="ລາຄາ/ຕຸກ (₭)"
                    className="input-field text-lg font-semibold text-green-400" />
                </div>
              </div>
            ))}
            {items.length < products.length && (
              <button type="button" onClick={addItem}
                className="w-full py-2 rounded-2xl border border-dashed border-brand-yellow/40 text-brand-yellow text-sm flex items-center justify-center gap-2 hover:bg-brand-yellow/5">
                <Plus size={16}/> ເພີ່ມສິນຄ້າລາຍການອື່ນ
              </button>
            )}
          </div>

          {/* Store */}
          <div>
            <label className="field-label">ຮ້ານຄ້າ</label>
            <div className="flex gap-2">
              <select value={storeName} onChange={e => setStoreName(e.target.value)} className="select-field flex-1" required>
                <option value="">-- ເລືອກຮ້ານ --</option>
                {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewStore(!showNewStore)}
                className="px-4 py-3 bg-dark-600 border border-dark-400 text-brand-yellow rounded-2xl font-bold text-lg shrink-0">+</button>
            </div>
          </div>
          {showNewStore && (
            <div className="flex gap-2">
              <input value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="ຊື່ຮ້ານໃໝ່" className="input-field flex-1" />
              <button type="button" onClick={addStore} disabled={addingStore} className="btn-primary px-4">
                {addingStore ? <div className="spinner border-dark-900"/> : 'ເພີ່ມ'}
              </button>
            </div>
          )}

          {/* Payment */}
          <div>
            <label className="field-label">ວິທີຊຳລະ</label>
            <div className="flex gap-3">
              {[{val:'cash',label:'💵 ເງິນສົດ'},{val:'transfer',label:'💳 ໂອນ'}].map(opt => (
                <button key={opt.val} type="button" onClick={() => setPayMethod(opt.val)}
                  className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all ${payMethod===opt.val?'bg-brand-yellow text-dark-900':'bg-dark-600 text-gray-300 border border-dark-400'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'cash' && (
            <div>
              <label className="field-label">ຊື່ຜູ້ຮັບເງິນ *</label>
              <input value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="ຊື່ຜູ້ຮັບ" className="input-field" required />
            </div>
          )}
          {payMethod === 'transfer' && (
            <>
              <div>
                <label className="field-label">ໝາຍເຫດໂອນ</label>
                <input value={transferNote} onChange={e => setTransferNote(e.target.value)} placeholder="ເລກ Ref / ໝາຍເຫດ" className="input-field" />
              </div>
              <ImageUpload bucket="distribution-images" label="ອັບໂຫລດ Slip ໂອນ" onUpload={setSlipImg} />
            </>
          )}
          <ImageUpload bucket="distribution-images" label="ຮູບໃບບິນ (ທາງເລືອກ)" onUpload={setBillImg} />
          <ImageUpload bucket="distribution-images" label="ຮູບການສົ່ງ (ທາງເລືອກ)" onUpload={setDeliveryImg} />
          <div>
            <label className="field-label">ໝາຍເຫດ</label>
            <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="ໝາຍເຫດ..." rows={2} className="input-field resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <><div className="spinner border-dark-900"/>ກຳລັງບັນທຶກ...</> : `✅ ບັນທຶກ ${items.length} ລາຍການ`}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Notification Panel (Admin orders) ─── */}
      <Modal open={showNotifPanel} onClose={() => setShowNotifPanel(false)} title="📬 ຄຳສັ່ງຈາກ Admin">
        <div className="space-y-4">
          {/* Pending */}
          {pendingNotifs.length > 0 && (
            <div>
              <p className="text-yellow-400 text-xs font-semibold mb-2 flex items-center gap-1">
                ⏳ ລໍຖ້າຮັບ ({pendingNotifs.length})
              </p>
              <div className="space-y-2">
                {pendingNotifs.map(n => (
                  <div key={n.id} className="card border-yellow-500/30 bg-yellow-900/5">
                    <div className="flex items-start gap-2 mb-3">
                      <Bell size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-white text-sm">{n.message}</p>
                        <p className="text-gray-500 text-xs mt-1">
                          ➜ ຈາກ {n.profiles?.name || 'Admin'} · {fmtDate(n.created_at)}
                        </p>
                        {n.assigned_to === null && (
                          <p className="text-blue-400 text-xs mt-0.5">📢 ສົ່ງໃຫ້ທຸກ Distributor</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => acknowledgeNotif(n.id)}
                      className="w-full py-2.5 rounded-xl bg-green-900/40 text-green-400 border border-green-400/40 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-green-900/60 transition-colors active:scale-95">
                      <CheckCircle size={18} /> ກົດຮັບຄຳສັ່ງ
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acknowledged */}
          {ackedNotifs.length > 0 && (
            <div>
              <p className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-1">
                ✅ ຮັບແລ້ວ ({ackedNotifs.length})
              </p>
              <div className="space-y-2">
                {ackedNotifs.slice(0, 10).map(n => (
                  <div key={n.id} className="card opacity-70">
                    <div className="flex items-start gap-2">
                      <CheckCircle size={14} className="text-green-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-gray-300 text-sm">{n.message}</p>
                        <p className="text-gray-500 text-xs mt-1">
                          ສົ່ງເມື່ອ {fmtDate(n.created_at)}
                          {n.acknowledged_at && ` · ຮັບເມື່ອ ${fmtDate(n.acknowledged_at)}`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notifications.length === 0 && (
            <Empty icon="📭" message="ຍັງບໍ່ມີຄຳສັ່ງຈາກ Admin" />
          )}

          <button onClick={() => setShowNotifPanel(false)} className="btn-secondary w-full">ປິດ</button>
        </div>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal open={!!detail} onClose={() => { setDetail(null); setDetailImgs({}) }} title="📋 ລາຍລະອຽດການກະຈາຍ">
        {detail && (
          <div className="space-y-4">
            <div className="bg-dark-600 rounded-2xl p-4 space-y-2">
              <Row label="ສິນຄ້າ"     val={`${detail.products?.type} ${detail.products?.size}`} />
              <Row label="ຈຳນວນ"     val={<span className="text-brand-yellow font-bold text-xl">{detail.quantity?.toLocaleString()} ຕຸກ</span>} />
              {detail.unit_price > 0 && <Row label="ລາຄາ/ຕຸກ"  val={<span className="text-green-400">{detail.unit_price?.toLocaleString('lo-LA')} ₭</span>} />}
              {detail.unit_price > 0 && <Row label="ລວມ"        val={<span className="text-green-300 font-bold">{(detail.quantity * detail.unit_price).toLocaleString('lo-LA')} ₭</span>} />}
              <Row label="ຮ້ານຄ້າ"   val={detail.store_name} />
              <Row label="ຊຳລະ"      val={detail.payment_method==='cash'?'💵 ເງິນສົດ':'💳 ໂອນ'} />
              {detail.receiver_name && <Row label="ຜູ້ຮັບ"    val={detail.receiver_name} />}
              {detail.transfer_note && <Row label="ໝາຍເຫດໂອນ" val={detail.transfer_note} />}
              <Row label="ວັນທີ"     val={fmtDate(detail.created_at)} />
              {detail.notes && <div className="pt-1 border-t border-dark-400"><span className="text-gray-400 text-xs">📝 {detail.notes}</span></div>}
            </div>

            {/* Images */}
            {loadingImg ? (
              <div className="flex justify-center py-6"><Spinner size={28}/></div>
            ) : (
              <div className="space-y-3">
                {[
                  { key:'bill_image_url',     label:'ຮູບໃບບິນ' },
                  { key:'slip_image_url',     label:'ສລິບໂອນ' },
                  { key:'delivery_image_url', label:'ຮູບການສົ່ງ' },
                ].map(({ key, label }) => detailImgs[key] ? (
                  <div key={key}>
                    <p className="field-label mb-2">{label}</p>
                    <img src={detailImgs[key]} alt={label} className="w-full rounded-2xl object-cover max-h-60"/>
                  </div>
                ) : null)}
                {Object.keys(detailImgs).length === 0 && detail.bill_image_url === null && detail.slip_image_url === null && detail.delivery_image_url === null && (
                  <p className="text-gray-600 text-sm text-center py-2">ບໍ່ມີຮູບພາບ</p>
                )}
              </div>
            )}

            <button onClick={() => { setDetail(null); setDetailImgs({}) }} className="btn-secondary w-full">ປິດ</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Row({ label, val }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{val}</span>
    </div>
  )
}

export default function DistributorDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
