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
  MapPin, Package, Printer, QrCode
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
  const [stores, setStores]         = useState([])

  // ── Delivery form state ──────────────────────────────────────────────────
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [activeNotif, setActiveNotif]           = useState(null)
  const [deliveryItems, setDeliveryItems]       = useState([])
  const [payMethod, setPayMethod]               = useState('cash')
  const [isPaid, setIsPaid]                     = useState(false)
  const [paymentPeriod, setPaymentPeriod]       = useState('current')
  const [receiverName, setReceiverName]         = useState('')
  const [transferNote, setTransferNote]         = useState('')
  const [slipImg, setSlipImg]                   = useState(null)
  const [deliveryImg, setDeliveryImg]           = useState(null)
  const [formNotes, setFormNotes]               = useState('')
  const [saving, setSaving]                     = useState(false)
  const [deliveryFee, setDeliveryFee]           = useState('')
  const [prevBillAmount, setPrevBillAmount]     = useState('')
  const [archivePanel, setArchivePanel]         = useState(null) // null | 'delivered' | 'paid'

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
        { data: storeList },
      ] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('distribution')
          .select('*, products(*)')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase.from('stores').select('id, name, phone, maps_url'),
      ])
      setProducts(prods || [])
      setDist(dist || [])
      setNotifs(notifs || [])
      setStores(storeList || [])
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

  // ─── Auto-fill previous bill amount ──────────────────────────────────
  useEffect(() => {
    if (paymentPeriod === 'previous' && activeNotif?.store_name) {
      const storeDists = distributions
        .filter(r => r.store_name === activeNotif.store_name)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      if (storeDists.length > 0) {
        // Group by notification_id — find the most recent delivery batch
        const latestNotifId = storeDists[0].notification_id
        const latestBatch = latestNotifId
          ? storeDists.filter(r => r.notification_id === latestNotifId)
          : [storeDists[0]]
        const total = latestBatch.reduce((s, r) => s + (r.quantity || 0) * (r.unit_price || 0), 0)
        if (total > 0) setPrevBillAmount(String(Math.round(total)))
      }
    } else if (paymentPeriod === 'current') {
      setPrevBillAmount('')
    }
  }, [paymentPeriod, activeNotif?.store_name, distributions])

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
    setPaymentPeriod('current')
    setReceiverName('')
    setTransferNote('')
    setSlipImg(null); setDeliveryImg(null)
    setFormNotes('')
    setPrevBillAmount('')
    // Load delivery fee remembered per store
    const savedFee = localStorage.getItem('dist_delivery_fee_' + notif.store_name) || ''
    setDeliveryFee(savedFee)
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
      // Persist delivery fee per store for next session
      if (activeNotif.store_name) {
        localStorage.setItem('dist_delivery_fee_' + activeNotif.store_name, deliveryFee)
      }

      const records = valid.map(i => ({
        product_id:         i.product_id,
        quantity:           parseInt(i.quantity),
        unit_price:         parseFloat(i.unit_price) || 0,
        store_name:         activeNotif.store_name,
        payment_method:     payMethod,
        is_paid:            isPaid,
        payment_period:     paymentPeriod,
        receiver_name:      payMethod === 'cash'     ? receiverName.trim() : null,
        transfer_note:      payMethod === 'transfer' ? transferNote        : null,
        slip_image_url:     payMethod === 'transfer' ? slipImg             : null,
        delivery_image_url: deliveryImg,
        notes:              formNotes || null,
        notification_id:    activeNotif.id,
        created_by:         user.id,
        delivery_fee:       parseFloat(deliveryFee) || 0,
        prev_bill_amount:   paymentPeriod === 'previous' ? (parseFloat(prevBillAmount) || null) : null,
      }))

      let { error: distErr } = await supabase.from('distribution').insert(records)
      if (distErr?.message?.includes('delivery_fee') || distErr?.message?.includes('prev_bill_amount')) {
        // Column not yet in DB — run upgrade-v8.sql. Retry without new columns.
        const safeRecords = records.map(({ delivery_fee, prev_bill_amount, ...rest }) => rest)
        const { error: retryErr } = await supabase.from('distribution').insert(safeRecords)
        distErr = retryErr
      }
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
      bankQrSrc: `${window.location.origin}/qr-payment.jpg`,
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
  const paidDists       = distributions.filter(r => r.is_paid)

  // Group distributions by store — exclude paid records (those go to archive)
  function getGroupedHistory() {
    const map = {}
    distributions.filter(r => !r.is_paid).forEach(r => {
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

  // ─── Mark all delivery fees paid ──────────────────────────────────────
  async function markAllFeesPaid() {
    const unpaidIds = distributions
      .filter(r => (r.delivery_fee || 0) > 0 && !r.delivery_fee_paid)
      .map(r => r.id)
    if (!unpaidIds.length) { toast.success('ຄ່າສົ່ງທັງໝົດຈ່າຍແລ້ວ ✅'); return }
    try {
      const { error } = await supabase
        .from('distribution')
        .update({ delivery_fee_paid: true })
        .in('id', unpaidIds)
      if (error) throw error
      toast.success(`ຈ່າຍຄ່າສົ່ງ ${unpaidIds.length} ລາຍການ ✅`)
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Archive: delivered notifications ─────────────────────────────────
  function renderDeliveredArchive() {
    if (deliveredNotifs.length === 0)
      return <div className="flex flex-col items-center py-10 gap-2 text-gray-500"><span className="text-3xl">🚚</span><p className="text-sm">ຍັງບໍ່ມີລາຍການ</p></div>

    const grouped = {}
    deliveredNotifs.forEach(n => {
      const key = fmtDate(n.created_at)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(n)
    })

    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([dateLabel, items]) => (
          <div key={dateLabel}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-dark-600" />
              <span className="text-gray-500 text-xs px-2">📅 {dateLabel}</span>
              <div className="h-px flex-1 bg-dark-600" />
            </div>
            <div className="space-y-1.5">
              {items.map(n => {
                const nitems = Array.isArray(n.items) ? n.items : []
                return (
                  <div key={n.id} className="bg-dark-700 rounded-xl px-3 py-2.5 flex items-start gap-2 border border-dark-500">
                    <CheckCircle size={13} className="text-green-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 text-sm font-semibold truncate">{n.store_name || '—'}</p>
                      {nitems.length > 0 && (
                        <p className="text-gray-400 text-xs mt-0.5 leading-snug">
                          {nitems.map(i => `${i.product_name} ×${i.quantity}`).join(' · ')}
                        </p>
                      )}
                      <p className="text-gray-600 text-[10px] mt-0.5">{fmtDate(n.created_at)}</p>
                    </div>
                    {n.store_maps_url && (
                      <a href={n.store_maps_url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 flex flex-col items-center gap-0.5 bg-blue-900/30 border border-blue-500/40 rounded-lg px-2 py-1.5 hover:bg-blue-900/50 transition-colors">
                        <MapPin size={12} className="text-blue-400" />
                        <span className="text-blue-400 text-[8px] font-semibold">Maps</span>
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ─── Archive: paid distribution records ────────────────────────────────
  function renderPaidArchive() {
    if (paidDists.length === 0)
      return <div className="flex flex-col items-center py-10 gap-2 text-gray-500"><span className="text-3xl">✅</span><p className="text-sm">ຍັງບໍ່ມີລາຍການ</p></div>

    const grouped = {}
    paidDists.forEach(r => {
      const key = fmtDate(r.created_at)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(r)
    })

    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([dateLabel, recs]) => (
          <div key={dateLabel}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-dark-600" />
              <span className="text-gray-500 text-xs px-2">📅 {dateLabel}</span>
              <div className="h-px flex-1 bg-dark-600" />
            </div>
            <div className="space-y-1.5">
              {recs.map(r => {
                const amt = r.unit_price > 0 ? r.quantity * r.unit_price : 0
                return (
                  <div key={r.id} className="bg-dark-700 rounded-xl px-3 py-2 flex items-center gap-2 border border-dark-500">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 text-sm font-semibold truncate">{r.store_name || '—'}</p>
                      <p className="text-gray-400 text-xs">{r.products?.type} {r.products?.size} × {r.quantity} ຕຸກ</p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      {amt > 0 && (
                        <p className="text-green-400 text-xs font-semibold">{amt.toLocaleString('lo-LA')} ₭</p>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.payment_method === 'cash' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}`}>
                        {r.payment_method === 'cash' ? '💵' : '💳'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ─── Archive: ຄ່າສົ່ງ (fee per invoice, split unpaid/paid) ───────────────
  function renderPaidFeesDistArchive() {
    // Build per-store → per-invoice (notification_id) fee map
    const byStore = {}
    distributions.forEach(r => {
      if (!r.delivery_fee || r.delivery_fee === 0) return
      const store = r.store_name || 'ບໍ່ລະບຸ'
      const key   = r.notification_id || r.id
      if (!byStore[store]) byStore[store] = {}
      if (!byStore[store][key]) {
        byStore[store][key] = { id: r.id, notifId: key, fee: 0, paid: r.delivery_fee_paid, date: r.created_at }
      }
      byStore[store][key].fee  = Math.max(byStore[store][key].fee, r.delivery_fee || 0)
      if (r.delivery_fee_paid) byStore[store][key].paid = true
    })

    const storeList = Object.entries(byStore)
    if (storeList.length === 0)
      return <div className="flex flex-col items-center py-10 gap-2 text-gray-500"><span className="text-3xl">🚚</span><p className="text-sm">ຍັງບໍ່ມີລາຍການ</p></div>

    // Global totals
    let grandUnpaid = 0, grandPaid = 0
    storeList.forEach(([, inv]) => Object.values(inv).forEach(b => {
      if (b.paid) grandPaid += b.fee; else grandUnpaid += b.fee
    }))

    return (
      <div className="space-y-1">
        {/* Grand total strip */}
        <div className="flex items-center justify-between px-1 pb-3 border-b border-dark-500 mb-3">
          <span className="text-orange-400 text-xs font-semibold">⏳ ຄ້າງ: {grandUnpaid.toLocaleString('lo-LA')} ₭</span>
          <span className="text-green-400 text-xs font-semibold">✅ ຈ່າຍ: {grandPaid.toLocaleString('lo-LA')} ₭</span>
        </div>

        {/* Pay-all button if any unpaid */}
        {grandUnpaid > 0 && (
          <button
            onClick={markAllFeesPaid}
            className="w-full py-2 rounded-xl bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/30 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-brand-yellow/20 transition-colors mb-3"
          >
            💰 ຈ່າຍຄ່າຂົນສົ່ງທັງໝົດ
          </button>
        )}

        {storeList.map(([storeName, invoices]) => {
          const invoiceList = Object.values(invoices).sort((a, b) => new Date(b.date) - new Date(a.date))
          const unpaidInv   = invoiceList.filter(b => !b.paid)
          const paidInv     = invoiceList.filter(b =>  b.paid)
          const storeUnpaid = unpaidInv.reduce((s, b) => s + b.fee, 0)
          const storePaid   = paidInv.reduce((s, b) => s + b.fee, 0)

          return (
            <div key={storeName} className="bg-dark-700/50 rounded-2xl p-3 border border-dark-500 space-y-3">
              {/* Store title */}
              <div className="flex items-center justify-between">
                <p className="text-white text-sm font-bold flex items-center gap-1.5">
                  <Store size={13} className="text-brand-yellow" /> {storeName}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  {storeUnpaid > 0 && <span className="text-orange-400 font-semibold">⏳ {storeUnpaid.toLocaleString('lo-LA')} ₭</span>}
                  {storePaid   > 0 && <span className="text-green-400 font-semibold">✅ {storePaid.toLocaleString('lo-LA')} ₭</span>}
                </div>
              </div>

              {/* Section 1: Unpaid invoices */}
              {unpaidInv.length > 0 && (
                <div>
                  <p className="text-orange-400 text-[10px] font-bold uppercase tracking-wide mb-1.5">ຄ້າງຈ່າຍ ({unpaidInv.length})</p>
                  <div className="space-y-1.5">
                    {unpaidInv.map(b => (
                      <div key={b.notifId} className="flex items-center justify-between bg-dark-600 rounded-xl px-3 py-2 border border-orange-900/20">
                        <p className="text-gray-400 text-xs">{fmtDate(b.date)}</p>
                        <span className="text-white text-xs font-semibold">{b.fee.toLocaleString('lo-LA')} ₭</span>
                      </div>
                    ))}
                    <div className="flex justify-end pt-0.5">
                      <span className="text-orange-400 text-xs font-bold">ລວມ: {storeUnpaid.toLocaleString('lo-LA')} ₭</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 2: Paid invoices */}
              {paidInv.length > 0 && (
                <div>
                  <p className="text-green-400 text-[10px] font-bold uppercase tracking-wide mb-1.5">ຈ່າຍແລ້ວ ({paidInv.length})</p>
                  <div className="space-y-1.5">
                    {paidInv.map(b => (
                      <div key={b.notifId} className="flex items-center justify-between bg-dark-600 rounded-xl px-3 py-2 border border-green-900/20">
                        <p className="text-gray-400 text-xs">{fmtDate(b.date)}</p>
                        <span className="text-green-400 text-xs font-semibold">{b.fee.toLocaleString('lo-LA')} ₭ ✅</span>
                      </div>
                    ))}
                    <div className="flex justify-end pt-0.5">
                      <span className="text-green-400 text-xs font-bold">ລວມ: {storePaid.toLocaleString('lo-LA')} ₭</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
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
            {notif.message && (
              <p className="text-gray-400 text-xs mt-0.5 break-words">{notif.message}</p>
            )}
            <p className="text-gray-500 text-xs mt-1">
              ➜ Admin · {fmtDate(notif.created_at)}
            </p>
            {notif.assigned_to === null && (
              <p className="text-blue-400 text-xs mt-0.5">📢 ສົ່ງໃຫ້ທຸກ Distributor</p>
            )}
          </div>
          {/* Location link — top-right corner (shown on acknowledged cards) */}
          {isAcked && notif.store_maps_url && (
            <a
              href={notif.store_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex flex-col items-center gap-0.5 bg-blue-900/30 border border-blue-500/40 rounded-xl px-2.5 py-1.5 hover:bg-blue-900/50 transition-colors"
            >
              <MapPin size={16} className="text-blue-400" />
              <span className="text-blue-400 text-[9px] font-semibold">Maps</span>
            </a>
          )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {ackedNotifs.map(n => <NotifCard key={n.id} notif={n} />)}
            </div>
          </div>
        )}

        {/* Delivered — moved to "ສົ່ງແລ້ວ" archive button in header */}
      </div>
    )
  }

  // ─── Tab: ຄ້າງຊຳລະ ────────────────────────────────────────────────────
  function renderHistory() {
    const grouped = getGroupedHistory()  // only is_paid=false records, grouped by store
    if (grouped.length === 0) {
      return <Empty icon="✅" message="ບໍ່ມີລາຍການຄ້າງຊຳລະ" />
    }

    return (
      <div className="space-y-6">
        {grouped.map(([storeName, records]) => {
          const totalAmount = records.reduce((s, r) => s + r.quantity * (r.unit_price || 0), 0)
          const totalQty    = records.reduce((s, r) => s + r.quantity, 0)

          return (
            <div key={storeName}>
              {/* Store header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-white font-semibold flex items-center gap-2">
                  <Store size={15} className="text-brand-yellow" />
                  {storeName}
                </p>
                <div className="text-right">
                  <span className="text-orange-400 text-xs font-semibold">⏳ ຄ້າງ {totalQty.toLocaleString()} ຕຸກ</span>
                  {totalAmount > 0 && (
                    <p className="text-brand-yellow text-sm font-bold">{totalAmount.toLocaleString('lo-LA')} ₭</p>
                  )}
                </div>
              </div>

              {/* Records — each card = one invoice row */}
              <div className="space-y-2">
                {records.map(r => {
                  const invoiceAmt = r.quantity * (r.unit_price || 0)
                  return (
                    <button
                      key={r.id}
                      onClick={() => openDetail(r)}
                      className="card w-full text-left hover:border-orange-400/30 transition-colors border-orange-900/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm">{r.products?.type} {r.products?.size}</p>
                          <p className="text-gray-500 text-xs">{fmtDate(r.created_at)}</p>
                          {(r.bill_image_url || r.slip_image_url) && (
                            <p className="text-brand-yellow text-xs flex items-center gap-1 mt-0.5"><Image size={10} />ມີຮູບ</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                          <div>
                            <p className="text-brand-yellow font-bold">{r.quantity.toLocaleString()} ຕຸກ</p>
                            {invoiceAmt > 0 && (
                              <p className="text-white text-xs font-semibold">{invoiceAmt.toLocaleString('lo-LA')} ₭</p>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${
                              r.payment_method === 'cash' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'
                            }`}>
                              {r.payment_method === 'cash' ? '💵 ສົດ' : '💳 ໂອນ'}
                            </span>
                          </div>
                          <ChevronRight size={14} className="text-gray-500" />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Archive icon button helper ────────────────────────────────────────
  function ArchBtn({ id, icon, label, count, color = 'green' }) {
    const colorMap = {
      green:  { text: 'text-green-400',       bg: 'bg-green-500' },
      blue:   { text: 'text-blue-400',         bg: 'bg-blue-500' },
      yellow: { text: 'text-brand-yellow',     bg: 'bg-brand-yellow' },
    }
    const c = colorMap[color] || colorMap.green
    return (
      <button
        onClick={() => setArchivePanel(id)}
        className={`relative flex flex-col items-center gap-0 rounded-xl px-2.5 py-1.5 hover:bg-dark-700 transition-colors ${c.text}`}
      >
        {icon}
        <span className="text-[9px] font-semibold mt-0.5">{label}</span>
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 ${c.bg} text-white text-[8px] rounded-full min-w-[14px] h-[14px] flex items-center justify-center font-bold px-0.5`}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900">
      <Header
        title="ຜູ້ກະຈາຍ"
        subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ"
        middleActions={
          <div className="flex items-center gap-1">
            <ArchBtn id="delivered" icon={<Truck size={14} />}       label="ສົ່ງແລ້ວ" count={deliveredNotifs.length} color="green" />
            <ArchBtn id="paid"      icon={<CheckCircle size={14} />} label="ຊຳລະ"    count={paidDists.length}       color="blue"  />
            <ArchBtn id="fees"      icon={<Package size={14} />}     label="ຄ່າສົ່ງ"  count={new Set(distributions.filter(r => (r.delivery_fee||0) > 0 && !r.delivery_fee_paid).map(r => r.notification_id || r.id)).size} color="yellow" />
          </div>
        }
      />

      {/* ── Tab Bar ── */}
      <div className="sticky top-[61px] z-30 bg-dark-800 border-b border-dark-500">
        <div className="flex">
          {[
            { id: 'orders',  label: 'ຄຳສັ່ງ',   icon: Bell  },
            { id: 'history', label: 'ຄ້າງຊຳລະ', icon: Clock },
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

            {/* ── Store name — glowing yellow, prominent ── */}
            <div className="bg-dark-700/60 rounded-2xl p-4 text-center border border-brand-yellow/20">
              <p className="text-gray-500 text-xs mb-1 flex items-center justify-center gap-1">
                <Store size={12} /> ຮ້ານຄ້າ
              </p>
              <p className="text-glow-yellow font-bold text-2xl tracking-wide leading-tight">
                {activeNotif.store_name}
              </p>
              {(() => {
                const storeData = stores.find(s => s.id === activeNotif.store_id)
                return storeData?.phone ? (
                  <a href={`tel:${storeData.phone}`} className="text-green-400 text-sm flex items-center justify-center gap-1.5 mt-2 hover:text-green-300">
                    📞 {storeData.phone}
                  </a>
                ) : null
              })()}
            </div>

            {/* ── Items — moved to TOP, qty + price editable ── */}
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

            <ImageUpload bucket="distribution-images" label="ຮູບການສົ່ງ (ທາງເລືອກ)" onUpload={setDeliveryImg} />

            {/* Payment period */}
            <div>
              <label className="field-label">ງວດການຊຳລະ</label>
              <div className="flex gap-2">
                {[
                  { val: 'current',  label: '💰 ຊຳລະບິນນີ້' },
                  { val: 'previous', label: '🔄 ຊຳລະບິນງວດກ່ອນ' },
                ].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setPaymentPeriod(opt.val)}
                    className={`flex-1 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                      paymentPeriod === opt.val
                        ? 'bg-brand-yellow text-dark-900'
                        : 'bg-dark-600 text-gray-300 border border-dark-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Previous bill amount — shown when paymentPeriod = 'previous' */}
            {paymentPeriod === 'previous' && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-3 space-y-2">
                <p className="text-blue-400 text-xs font-semibold flex items-center gap-1.5">
                  🔄 ຍອດບິນງວດກ່ອນ (ດຶງຈາກການສົ່ງຫຼ້າສຸດ)
                </p>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={prevBillAmount}
                  onChange={e => setPrevBillAmount(e.target.value)}
                  placeholder="ຍອດລວມ ₭"
                  className="input-field text-blue-300 font-bold"
                />
                {prevBillAmount && parseFloat(prevBillAmount) > 0 && (
                  <p className="text-blue-300 text-xs text-right font-semibold">
                    💰 {parseFloat(prevBillAmount).toLocaleString('lo-LA')} ₭
                  </p>
                )}
              </div>
            )}

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

            {/* Invoice total summary */}
            {(() => {
              const total = deliveryItems.reduce((s, i) => s + (parseInt(i.quantity)||0) * (parseFloat(i.unit_price)||0), 0)
              return total > 0 ? (
                <div className="bg-dark-700/60 rounded-2xl p-3 flex items-center justify-between">
                  <span className="text-gray-300 font-semibold text-sm">💵 ຍອດລວມ Invoice</span>
                  <span className="text-brand-yellow font-bold text-xl">{total.toLocaleString('lo-LA')} ₭</span>
                </div>
              ) : null
            })()}

            {/* Delivery fee — locked if admin confirmed payment */}
            {(() => {
              const feeLocked = activeNotif && distributions.some(
                r => r.notification_id === activeNotif.id && r.delivery_fee_paid
              )
              return (
                <div>
                  <label className="field-label flex items-center gap-1.5">
                    🚚 ຄ່າສົ່ງ (₭)
                    {feeLocked
                      ? <span className="text-green-400 font-semibold text-xs">🔒 Admin ຢືນຢັນຈ່າຍແລ້ວ — ແກ້ໄຂບໍ່ໄດ້</span>
                      : <span className="text-gray-500 font-normal text-xs">— ຈຳຄ່າຕາມຮ້ານ, ແກ້ໄຂໄດ້</span>
                    }
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={deliveryFee}
                    onChange={e => !feeLocked && setDeliveryFee(e.target.value)}
                    readOnly={feeLocked}
                    placeholder="0"
                    className={`input-field ${feeLocked ? 'opacity-60 cursor-not-allowed bg-dark-700' : ''}`}
                  />
                  {deliveryFee && parseFloat(deliveryFee) > 0 && (
                    <p className="text-gray-400 text-xs mt-1 text-right">
                      ຄ່າສົ່ງ: {parseFloat(deliveryFee).toLocaleString('lo-LA')} ₭
                    </p>
                  )}
                </div>
              )
            })()}

            {/* ── QR payment (moved here — bottom) ── */}
            <div className="bg-dark-700/60 rounded-2xl p-3">
              <p className="text-gray-400 text-xs font-medium mb-2 flex items-center gap-1.5">
                <QrCode size={13} className="text-brand-yellow" /> QR ຊຳລະເງິນ (ໃຫ້ລູກຄ້າ Scan)
              </p>
              <div className="flex justify-center">
                <img
                  src="/qr-payment.jpg"
                  alt="QR ຊຳລະ"
                  className="rounded-xl object-contain border border-dark-400"
                  style={{ maxWidth: 160, maxHeight: 160 }}
                />
              </div>
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

      {/* ── Archive Drawer ──────────────────────────────────────────────── */}
      {archivePanel && (
        <div className="fixed inset-0 z-50" onClick={() => setArchivePanel(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* Slide-up on mobile, right drawer on desktop */}
          <div
            className="absolute inset-x-0 bottom-0 md:inset-y-0 md:right-0 md:left-auto md:w-[400px] bg-dark-800 rounded-t-3xl md:rounded-none flex flex-col border-t border-dark-500 md:border-t-0 md:border-l"
            style={{ maxHeight: '85vh', ...(window.innerWidth >= 768 ? { maxHeight: '100vh' } : {}) }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500 shrink-0">
              <p className="text-white font-bold text-sm flex items-center gap-2">
                {archivePanel === 'delivered' && <><Truck size={16} className="text-green-400" />ສົ່ງສຳເລັດ ({deliveredNotifs.length})</>}
                {archivePanel === 'paid'      && <><CheckCircle size={16} className="text-blue-400" />ຊຳລະແລ້ວ ({paidDists.length})</>}
                {archivePanel === 'fees'      && <><Package size={16} className="text-brand-yellow" />ຄ່າຂົນສົ່ງ</>}
              </p>
              <button
                onClick={() => setArchivePanel(null)}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-dark-600 transition-colors"
              >✕</button>
            </div>
            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {archivePanel === 'delivered' && renderDeliveredArchive()}
              {archivePanel === 'paid'      && renderPaidArchive()}
              {archivePanel === 'fees'      && renderPaidFeesDistArchive()}
            </div>
          </div>
        </div>
      )}

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
