import { useState, useEffect, useCallback } from 'react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, SectionTitle, Modal, Empty, Spinner
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import ImageUpload from '../components/ImageUpload'
import {
  Bell, CheckCircle, Truck, Store, Clock, ChevronRight, Image,
  MapPin, Package, Printer
} from 'lucide-react'
import { generateInvoiceNo, printInvoice } from '../lib/invoice'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('lo-LA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Row helper for detail modal ───────────────────────────────────────────
function Row({ label, val }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{val}</span>
    </div>
  )
}

function Inner() {
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab]               = useState('orders')  // 'orders' | 'history'
  const [loading, setLoading]       = useState(true)
  const [products, setProducts]     = useState([])
  const [distributions, setDist]    = useState([])
  const [notifications, setNotifs]  = useState([])

  // ── Delivery form state ──────────────────────────────────────────────────
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [activeNotif, setActiveNotif]           = useState(null)
  const [deliveryItems, setDeliveryItems]       = useState([])
  const [payMethod, setPayMethod]               = useState('cash')
  const [isPaid, setIsPaid]                     = useState(false)
  const [receiverName, setReceiverName]         = useState('')
  const [transferNote, setTransferNote]         = useState('')
  const [billImg, setBillImg]                   = useState(null)
  const [slipImg, setSlipImg]                   = useState(null)
  const [deliveryImg, setDeliveryImg]           = useState(null)
  const [formNotes, setFormNotes]               = useState('')
  const [saving, setSaving]                     = useState(false)

  // ── Detail modal (history) ───────────────────────────────────────────────
  const [detail, setDetail]         = useState(null)
  const [detailImgs, setDetailImgs] = useState({})
  const [loadingImg, setLoadingImg] = useState(false)

  // ─── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: prods },
        { data: dist },
        { data: notifs },
      ] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('distribution')
          .select('*, products(*)')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('notifications')
          .select('*, profiles!notifications_created_by_fkey(name)')
          .order('created_at', { ascending: false })
          .limit(60),
      ])
      setProducts(prods || [])
      setDist(dist || [])
      setNotifs(notifs || [])
    } catch {
      toast.error('ໂຫລດຂໍ້ມູນຜິດພາດ')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('distributor-rt-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' },  () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  // ─── Acknowledge notification ──────────────────────────────────────────
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

  // ─── Open delivery form pre-filled from notification items ─────────────
  function openDeliveryForm(notif) {
    setActiveNotif(notif)
    const notifItems = Array.isArray(notif.items) ? notif.items : []
    if (notifItems.length === 0) {
      // Fallback: one blank row per product (for old-format notifs)
      setDeliveryItems(
        products.map(p => ({
          product_id:   p.id,
          product_name: `${p.type} ${p.size}`,
          quantity:     '',
          unit_price:   '',
        }))
      )
    } else {
      setDeliveryItems(
        notifItems.map(item => ({
          product_id:   item.product_id,
          product_name: item.product_name || '',
          quantity:     String(item.quantity || ''),
          unit_price:   String(item.unit_price || ''),
        }))
      )
    }
    setPayMethod('cash')
    setIsPaid(false)
    setReceiverName('')
    setTransferNote('')
    setBillImg(null); setSlipImg(null); setDeliveryImg(null)
    setFormNotes('')
    setShowDeliveryForm(true)
  }

  // ─── Submit delivery ───────────────────────────────────────────────────
  async function handleDeliverySubmit(e) {
    e.preventDefault()
    const valid = deliveryItems.filter(i => i.product_id && i.quantity && parseInt(i.quantity) > 0)
    if (!valid.length)                               { toast.error('ໃສ່ຈຳນວນສິນຄ້າຢ່າງໜ້ອຍ 1 ລາຍການ'); return }
    if (!activeNotif?.store_name)                    { toast.error('ບໍ່ພົບຂໍ້ມູນຮ້ານ'); return }
    if (payMethod === 'cash' && !receiverName.trim()) { toast.error('ໃສ່ຊື່ຜູ້ຮັບເງິນ'); return }
    setSaving(true)
    try {
      const records = valid.map(i => ({
        product_id:         i.product_id,
        quantity:           parseInt(i.quantity),
        unit_price:         parseFloat(i.unit_price) || 0,
        store_name:         activeNotif.store_name,
        payment_method:     payMethod,
        is_paid:            isPaid,
        receiver_name:      payMethod === 'cash'     ? receiverName.trim() : null,
        transfer_note:      payMethod === 'transfer' ? transferNote        : null,
        bill_image_url:     billImg,
        slip_image_url:     payMethod === 'transfer' ? slipImg             : null,
        delivery_image_url: deliveryImg,
        notes:              formNotes || null,
        notification_id:    activeNotif.id,
        created_by:         user.id,
      }))

      const { error: distErr } = await supabase.from('distribution').insert(records)
      if (distErr) throw distErr

      const { error: notifErr } = await supabase
        .from('notifications')
        .update({ status: 'delivered' })
        .eq('id', activeNotif.id)
      if (notifErr) throw notifErr

      toast.success(`ບັນທຶກການສົ່ງ ${records.length} ລາຍການ ສຳເລັດ ✅`)
      setShowDeliveryForm(false)
      setActiveNotif(null)
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Print Invoice from delivery items ────────────────────────────────
  function handlePrintInvoice({ storeName, storeMapsUrl, items, paymentMethod, isPaid, receiverName, notes }) {
    const invoiceNo = generateInvoiceNo()
    printInvoice({
      invoiceNo,
      storeName,
      storeMapsUrl,
      distributorName: user?.user_metadata?.name || user?.email || '',
      items,
      paymentMethod,
      isPaid,
      receiverName,
      notes,
    })
  }

  // ─── Update delivery item quantity ─────────────────────────────────────
  function updateItemQty(i, val) {
    setDeliveryItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: val } : it))
  }
  function updateItemPrice(i, val) {
    setDeliveryItems(prev => prev.map((it, idx) => idx === i ? { ...it, unit_price: val } : it))
  }

  // ─── Open detail (history) ─────────────────────────────────────────────
  async function openDetail(r) {
    setDetail(r)
    setDetailImgs({})
    setLoadingImg(true)
    const urls = {}
    await Promise.all(['bill_image_url', 'slip_image_url', 'delivery_image_url'].map(async f => {
      if (r[f]) {
        const url = await getSignedUrl('distribution-images', r[f])
        if (url) urls[f] = url
      }
    }))
    setDetailImgs(urls)
    setLoadingImg(false)
  }

  // ─── Computed ──────────────────────────────────────────────────────────
  const pendingNotifs   = notifications.filter(n => n.status === 'pending')
  const ackedNotifs     = notifications.filter(n => n.status === 'acknowledged')
  const deliveredNotifs = notifications.filter(n => n.status === 'delivered')
  const pendingCount    = pendingNotifs.length + ackedNotifs.length

  // Group distributions by store
  function getGroupedHistory() {
    const map = {}
    distributions.forEach(r => {
      const key = r.store_name || 'ບໍ່ລະບຸ'
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return Object.entries(map).sort((a, b) => {
      const aMax = Math.max(...a[1].map(r => new Date(r.created_at).getTime()))
      const bMax = Math.max(...b[1].map(r => new Date(r.created_at).getTime()))
      return bMax - aMax
    })
  }

  // ─── Notification card ─────────────────────────────────────────────────
  function NotifCard({ notif }) {
    const items     = Array.isArray(notif.items) ? notif.items : []
    const isPending = notif.status === 'pending'
    const isAcked   = notif.status === 'acknowledged'

    return (
      <div className={`card ${
        isPending ? 'border-yellow-500/30 bg-yellow-900/5'
                  : 'border-blue-500/30 bg-blue-900/5'
      }`}>
        {/* Store + sender */}
        <div className="flex items-start gap-2 mb-3">
          <Store size={16} className={`mt-0.5 shrink-0 ${isPending ? 'text-yellow-400' : 'text-blue-400'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">
              {notif.store_name || 'ຮ້ານຄ້າ'}
            </p>
            {notif.store_maps_url && (
              <a
                href={notif.store_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 flex items-center gap-1 mt-0.5 hover:text-blue-300"
              >
                <MapPin size={11} /> ເປີດ Google Maps →
              </a>
            )}
            {notif.message && (
              <p className="text-gray-400 text-xs mt-0.5 break-words">{notif.message}</p>
            )}
            <p className="text-gray-500 text-xs mt-1">
              ➜ {notif.profiles?.name || 'Admin'} · {fmtDate(notif.created_at)}
            </p>
            {notif.assigned_to === null && (
              <p className="text-blue-400 text-xs mt-0.5">📢 ສົ່ງໃຫ້ທຸກ Distributor</p>
            )}
          </div>
        </div>

        {/* Items list */}
        {items.length > 0 && (
          <div className="bg-dark-700/50 rounded-xl px-3 py-2 mb-3 space-y-1.5">
            <p className="text-gray-500 text-xs mb-1 flex items-center gap-1">
              <Package size={11} /> ລາຍການສິນຄ້າ
            </p>
            {items.map((item, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">{item.product_name || 'ສິນຄ້າ'}</span>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-brand-yellow font-bold text-sm">{item.quantity} ຕຸກ</span>
                  {item.unit_price > 0 && (
                    <span className="text-green-400 text-xs">{Number(item.unit_price).toLocaleString('lo-LA')} ₭/ຕຸກ</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <button
            onClick={() => acknowledgeNotif(notif.id)}
            className="w-full py-2.5 rounded-xl bg-green-900/40 text-green-400 border border-green-400/40 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-green-900/60 transition-colors active:scale-95"
          >
            <CheckCircle size={18} /> ກົດຮັບຄຳສັ່ງ
          </button>
        )}
        {isAcked && (
          <button
            onClick={() => openDeliveryForm(notif)}
            className="w-full py-2.5 rounded-xl bg-brand-yellow text-dark-900 font-bold text-sm flex items-center justify-center gap-2 hover:bg-brand-yellow/90 transition-colors active:scale-95"
          >
            <Truck size={18} /> ບັນທຶກການສົ່ງ
          </button>
        )}
      </div>
    )
  }

  // ─── Tab: Orders ───────────────────────────────────────────────────────
  function renderOrders() {
    const hasAny = pendingNotifs.length || ackedNotifs.length || deliveredNotifs.length
    if (!hasAny) {
      return <Empty icon="📭" message="ຍັງບໍ່ມີຄຳສັ່ງຈາກ Admin" />
    }

    return (
      <div className="space-y-6">
        {/* Pending — ຕ້ອງ ກົດຮັບ */}
        {pendingNotifs.length > 0 && (
          <div>
            <p className="text-yellow-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />
              ລໍຖ້າຮັບ ({pendingNotifs.length})
            </p>
            <div className="space-y-3">
              {pendingNotifs.map(n => <NotifCard key={n.id} notif={n} />)}
            </div>
          </div>
        )}

        {/* Acknowledged — ຕ້ອງ ສົ່ງ */}
        {ackedNotifs.length > 0 && (
          <div>
            <p className="text-blue-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              ກົດຮັບແລ້ວ — ລໍຖ້າສົ່ງ ({ackedNotifs.length})
            </p>
            <div className="space-y-3">
              {ackedNotifs.map(n => <NotifCard key={n.id} notif={n} />)}
            </div>
          </div>
        )}

        {/* Delivered — recent */}
        {deliveredNotifs.length > 0 && (
          <div>
            <p className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              ສົ່ງສຳເລັດແລ້ວ ({deliveredNotifs.length})
            </p>
            <div className="space-y-2">
              {deliveredNotifs.slice(0, 8).map(n => (
                <div key={n.id} className="card opacity-60">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 text-sm truncate">{n.store_name || n.message || 'ສົ່ງແລ້ວ'}</p>
                      <p className="text-gray-500 text-xs">{fmtDate(n.created_at)}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 shrink-0">
                      ສົ່ງແລ້ວ
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: History ──────────────────────────────────────────────────────
  function renderHistory() {
    const grouped = getGroupedHistory()
    if (grouped.length === 0) {
      return <Empty icon="🚚" message="ຍັງບໍ່ມີປະຫວັດການກະຈາຍ" />
    }

    return (
      <div className="space-y-6">
        {grouped.map(([storeName, records]) => {
          const totalQty    = records.reduce((s, r) => s + r.quantity, 0)
          const totalAmount = records.reduce((s, r) => s + r.quantity * (r.unit_price || 0), 0)
          const paidQty     = records.filter(r => r.is_paid).reduce((s, r) => s + r.quantity, 0)
          const unpaidQty   = totalQty - paidQty

          return (
            <div key={storeName}>
              {/* Store header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-white font-semibold flex items-center gap-2">
                  <Store size={15} className="text-brand-yellow" />
                  {storeName}
                </p>
                <div className="text-right">
                  <span className="text-brand-yellow text-sm font-bold">{totalQty.toLocaleString()} ຕຸກ</span>
                  {totalAmount > 0 && (
                    <p className="text-green-400 text-xs">{totalAmount.toLocaleString('lo-LA')} ₭</p>
                  )}
                </div>
              </div>

              {/* Paid summary pills */}
              <div className="flex gap-2 mb-2 px-1">
                {paidQty > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400">
                    ✅ ຊຳລະ {paidQty} ຕຸກ
                  </span>
                )}
                {unpaidQty > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/30 text-orange-400">
                    ⏳ ຄ້າງ {unpaidQty} ຕຸກ
                  </span>
                )}
              </div>

              {/* Records */}
              <div className="space-y-2">
                {records.map(r => (
                  <button
                    key={r.id}
                    onClick={() => openDetail(r)}
                    className="card w-full text-left hover:border-brand-yellow/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">{r.products?.type} {r.products?.size}</p>
                        <p className="text-gray-500 text-xs">{fmtDate(r.created_at)}</p>
                        {(r.bill_image_url || r.slip_image_url || r.delivery_image_url) && (
                          <p className="text-brand-yellow text-xs flex items-center gap-1 mt-0.5">
                            <Image size={10} />ມີຮູບ
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-brand-yellow font-bold">{r.quantity.toLocaleString()}</p>
                          {r.unit_price > 0 && (
                            <p className="text-green-400 text-xs">{(r.quantity * r.unit_price).toLocaleString('lo-LA')} ₭</p>
                          )}
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              r.payment_method === 'cash' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'
                            }`}>
                              {r.payment_method === 'cash' ? '💵' : '💳'}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              r.is_paid ? 'bg-green-900/30 text-green-400' : 'bg-dark-700 text-gray-500'
                            }`}>
                              {r.is_paid ? '✅' : '⏳'}
                            </span>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-gray-500" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="ຜູ້ກະຈາຍ" subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />

      {/* ── Tab Bar ── */}
      <div className="sticky top-[61px] z-30 bg-dark-800 border-b border-dark-500">
        <div className="flex">
          {[
            { id: 'orders',  label: 'ຄຳສັ່ງ',  icon: Bell  },
            { id: 'history', label: 'ປະຫວັດ', icon: Clock },
          ].map(t => {
            const Icon   = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors border-b-2 ${
                  active
                    ? 'border-brand-yellow text-brand-yellow'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={18} />
                {t.label}
                {t.id === 'orders' && pendingCount > 0 && (
                  <span className="absolute top-1.5 right-[calc(50%-20px)] bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <Page>
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={36} /></div>
        ) : (
          <div className="animate-fade-in">
            {tab === 'orders'  && renderOrders()}
            {tab === 'history' && renderHistory()}
          </div>
        )}
      </Page>

      {/* ── Delivery Form Modal ─────────────────────────────────────────── */}
      <Modal open={showDeliveryForm} onClose={() => setShowDeliveryForm(false)} title="🚚 ບັນທຶກການສົ່ງ">
        {activeNotif && (
          <form onSubmit={handleDeliverySubmit} className="space-y-4">

            {/* Store info (read-only) */}
            <div className="bg-dark-700/60 rounded-2xl p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Store size={16} className="text-brand-yellow" />
                <p className="text-white font-semibold text-sm">{activeNotif.store_name}</p>
              </div>
              {activeNotif.store_maps_url && (
                <a
                  href={activeNotif.store_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 text-xs flex items-center gap-1 pl-6 hover:text-blue-300"
                >
                  <MapPin size={11} /> ເປີດ Google Maps
                </a>
              )}
            </div>

            {/* Items — qty editable, price editable, name read-only */}
            <div className="space-y-2">
              <label className="field-label">ລາຍການສິນຄ້າ</label>
              {deliveryItems.map((item, i) => (
                <div key={i} className="bg-dark-600 rounded-2xl p-3 space-y-2 border border-dark-400">
                  <p className="text-gray-300 text-sm font-medium">{item.product_name || 'ສິນຄ້າ'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="field-label text-xs">ຈຳນວນ (ຕຸກ) *</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={item.quantity}
                        onChange={e => updateItemQty(i, e.target.value)}
                        placeholder="0"
                        className="input-field text-xl font-bold text-brand-yellow"
                      />
                    </div>
                    <div>
                      <label className="field-label text-xs">ລາຄາ/ຕຸກ (₭)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={e => updateItemPrice(i, e.target.value)}
                        placeholder="0"
                        className="input-field text-sm text-green-400"
                      />
                    </div>
                  </div>
                  {parseFloat(item.unit_price) > 0 && parseInt(item.quantity) > 0 && (
                    <p className="text-green-400 text-xs text-right font-semibold">
                      ລວມ: {(parseInt(item.quantity) * parseFloat(item.unit_price)).toLocaleString('lo-LA')} ₭
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Payment method */}
            <div>
              <label className="field-label">ວິທີຊຳລະ</label>
              <div className="flex gap-3">
                {[{ val: 'cash', label: '💵 ເງິນສົດ' }, { val: 'transfer', label: '💳 ໂອນ' }].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setPayMethod(opt.val)}
                    className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all ${
                      payMethod === opt.val
                        ? 'bg-brand-yellow text-dark-900'
                        : 'bg-dark-600 text-gray-300 border border-dark-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Paid status */}
            <div>
              <label className="field-label">ສະຖານະຊຳລະ</label>
              <div className="flex gap-3">
                {[
                  { val: true,  label: '✅ ຊຳລະແລ້ວ' },
                  { val: false, label: '⏳ ຍັງບໍ່ຊຳລະ' },
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => setIsPaid(opt.val)}
                    className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all ${
                      isPaid === opt.val
                        ? opt.val
                          ? 'bg-green-700 text-white'
                          : 'bg-orange-800 text-white'
                        : 'bg-dark-600 text-gray-300 border border-dark-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {payMethod === 'cash' && (
              <div>
                <label className="field-label">ຊື່ຜູ້ຮັບເງິນ *</label>
                <input
                  value={receiverName}
                  onChange={e => setReceiverName(e.target.value)}
                  placeholder="ຊື່ຜູ້ຮັບ"
                  className="input-field"
                />
              </div>
            )}

            {payMethod === 'transfer' && (
              <>
                <div>
                  <label className="field-label">ໝາຍເຫດໂອນ</label>
                  <input
                    value={transferNote}
                    onChange={e => setTransferNote(e.target.value)}
                    placeholder="ເລກ Ref / ໝາຍເຫດ"
                    className="input-field"
                  />
                </div>
                <ImageUpload bucket="distribution-images" label="ອັບໂຫລດ Slip ໂອນ" onUpload={setSlipImg} />
              </>
            )}

            <ImageUpload bucket="distribution-images" label="ຮູບໃບບິນ (ທາງເລືອກ)" onUpload={setBillImg} />
            <ImageUpload bucket="distribution-images" label="ຮູບການສົ່ງ (ທາງເລືອກ)" onUpload={setDeliveryImg} />

            <div>
              <label className="field-label">ໝາຍເຫດ</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="ໝາຍເຫດ..."
                rows={2}
                className="input-field resize-none"
              />
            </div>

            {/* Print invoice preview button */}
            <button
              type="button"
              onClick={() => {
                const valid = deliveryItems.filter(i => i.product_id && i.quantity && parseInt(i.quantity) > 0)
                if (!valid.length) { toast.error('ໃສ່ຈຳນວນສິນຄ້າກ່ອນ'); return }
                handlePrintInvoice({
                  storeName:    activeNotif.store_name,
                  storeMapsUrl: activeNotif.store_maps_url,
                  items:        valid.map(i => ({ product_name: i.product_name, quantity: parseInt(i.quantity), unit_price: parseFloat(i.unit_price) || 0 })),
                  paymentMethod: payMethod,
                  isPaid,
                  receiverName,
                  notes: formNotes,
                })
              }}
              className="w-full py-2.5 rounded-xl bg-dark-600 text-gray-200 border border-dark-400 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-dark-500 transition-colors"
            >
              <Printer size={16} /> ພິມ Invoice
            </button>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button type="button" onClick={() => setShowDeliveryForm(false)} className="btn-secondary">
                ຍົກເລີກ
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Detail Modal (history) ──────────────────────────────────────── */}
      <Modal
        open={!!detail}
        onClose={() => { setDetail(null); setDetailImgs({}) }}
        title="📋 ລາຍລະອຽດ"
      >
        {detail && (
          <div className="space-y-4">
            <div className="bg-dark-600 rounded-2xl p-4 space-y-0 divide-y divide-dark-500">
              <Row label="ສິນຄ້າ"   val={`${detail.products?.type} ${detail.products?.size}`} />
              <Row label="ຈຳນວນ"   val={<span className="text-brand-yellow font-bold text-xl">{detail.quantity?.toLocaleString()} ຕຸກ</span>} />
              {detail.unit_price > 0 && (
                <Row label="ລາຄາ/ຕຸກ" val={<span className="text-green-400">{Number(detail.unit_price).toLocaleString('lo-LA')} ₭</span>} />
              )}
              {detail.unit_price > 0 && (
                <Row label="ລວມ" val={<span className="text-green-300 font-bold">{(detail.quantity * detail.unit_price).toLocaleString('lo-LA')} ₭</span>} />
              )}
              <Row label="ຮ້ານຄ້າ"  val={detail.store_name} />
              <Row label="ຊຳລະ"    val={detail.payment_method === 'cash' ? '💵 ເງິນສົດ' : '💳 ໂອນ'} />
              <Row label="ສະຖານະ"  val={detail.is_paid ? '✅ ຊຳລະແລ້ວ' : '⏳ ຍັງບໍ່ຊຳລະ'} />
              {detail.receiver_name && <Row label="ຜູ້ຮັບ"    val={detail.receiver_name} />}
              {detail.transfer_note && <Row label="ໝາຍເຫດໂອນ" val={detail.transfer_note} />}
              <Row label="ວັນທີ"   val={fmtDate(detail.created_at)} />
              {detail.notes && (
                <div className="pt-2">
                  <span className="text-gray-400 text-xs">📝 {detail.notes}</span>
                </div>
              )}
            </div>

            {loadingImg ? (
              <div className="flex justify-center py-6"><Spinner size={28} /></div>
            ) : (
              <div className="space-y-3">
                {[
                  { key: 'bill_image_url',     label: '🧾 ໃບບິນ' },
                  { key: 'slip_image_url',     label: '💳 Slip ໂອນ' },
                  { key: 'delivery_image_url', label: '📦 ຮູບການສົ່ງ' },
                ].map(({ key, label }) =>
                  detailImgs[key] ? (
                    <div key={key}>
                      <p className="field-label mb-2">{label}</p>
                      <img src={detailImgs[key]} alt={label} className="w-full rounded-2xl object-cover max-h-60" />
                    </div>
                  ) : null
                )}
              </div>
            )}

            <button
              onClick={() => handlePrintInvoice({
                storeName:    detail.store_name,
                storeMapsUrl: detail.store_maps_url,
                items:        [{ product_name: `${detail.products?.type} ${detail.products?.size}`, quantity: detail.quantity, unit_price: detail.unit_price || 0 }],
                paymentMethod: detail.payment_method,
                isPaid:       detail.is_paid,
                receiverName: detail.receiver_name,
                notes:        detail.notes,
              })}
              className="w-full py-2.5 rounded-xl bg-dark-600 text-gray-200 border border-dark-400 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-dark-500 transition-colors"
            >
              <Printer size={16} /> ພິມ Invoice
            </button>

            <button
              onClick={() => { setDetail(null); setDetailImgs({}) }}
              className="btn-secondary w-full"
            >
              ປິດ
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default function DistributorDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
