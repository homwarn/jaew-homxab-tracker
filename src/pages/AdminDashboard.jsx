import { useState, useEffect, useCallback } from 'react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../App'
import { exportAllReports } from '../lib/excel'
import {
  Header, Page, StatCard, SectionTitle, Modal, ConfirmDialog, Empty, Spinner, ROLE_LABELS
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import {
  LayoutDashboard, Users, Factory, Truck, ShoppingBag, Download,
  Plus, Pencil, Trash2, Eye, EyeOff, Store, ChevronRight, Image,
  ClipboardList, CheckCircle, XCircle, RotateCcw, Edit3,
  Bell, Send, TrendingUp, MapPin, Package
} from 'lucide-react'

// ─── Tab definitions ──────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'users',      label: 'Users',      icon: Users },
  { id: 'production', label: 'ຜະລິດ',      icon: Factory },
  { id: 'distrib',    label: 'ກະຈາຍ',      icon: Truck },
  { id: 'sales',      label: 'ຂາຍ',        icon: ShoppingBag },
  { id: 'orders',     label: 'ສັ່ງ',        icon: ClipboardList },
  { id: 'stores',     label: 'ຮ້ານ',        icon: Store },
  { id: 'export',     label: 'Export',     icon: Download },
]

const ORDER_STATUS = {
  pending:   { label: 'ລໍຖ້າ',    color: 'bg-yellow-900/30 text-yellow-400' },
  confirmed: { label: 'ຢືນຢັນ',   color: 'bg-blue-900/30 text-blue-400' },
  delivered: { label: 'ສົ່ງແລ້ວ', color: 'bg-green-900/30 text-green-400' },
}

// ─── Main Admin component ─────────────────────────────────────────────────
function Inner() {
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab]             = useState('dashboard')
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)

  // Core data
  const [products, setProducts]     = useState([])
  const [users, setUsers]           = useState([])
  const [production, setProduction] = useState([])
  const [distrib, setDistrib]       = useState([])
  const [sales, setSales]           = useState([])
  const [orders, setOrders]         = useState([])
  const [stockMap, setStockMap]     = useState({})

  // Stores + pricing
  const [stores, setStores]           = useState([])
  const [storePriceMap, setStorePriceMap] = useState({})  // { [store_id]: { [product_id]: unit_price } }

  // Detail modal
  const [detail, setDetail]               = useState(null)
  const [detailImgs, setDetailImgs]       = useState({})
  const [loadingImg, setLoadingImg]       = useState(false)
  const [editDetail, setEditDetail]       = useState(false)
  const [editQty, setEditQty]             = useState('')
  const [savingDetail, setSavingDetail]   = useState(false)

  // Reset confirm
  const [resetConfirm, setResetConfirm]   = useState(null)

  // Notifications
  const [notifications, setNotifications] = useState([])
  const [showNotifForm, setShowNotifForm]  = useState(false)
  const [sendingNotif, setSendingNotif]    = useState(false)
  const [notifForm, setNotifForm] = useState({
    assignedTo:   '',
    storeId:      '',
    storeName:    '',
    storeMapsUrl: '',
    items:        [],
    message:      '',
  })

  // Store stats filter
  const [storeFilter, setStoreFilter] = useState('month')
  const [filterFrom, setFilterFrom]   = useState('')
  const [filterTo, setFilterTo]       = useState('')

  // Store management form
  const [showStoreForm, setShowStoreForm] = useState(false)
  const [editStore, setEditStore]         = useState(null)
  const [savingStore, setSavingStore]     = useState(false)
  const [deleteStoreConfirm, setDeleteStoreConfirm] = useState(null)
  const [storeForm, setStoreForm] = useState({ name: '', maps_url: '', prices: {} })

  // User form
  const [showUserForm, setShowUserForm]   = useState(false)
  const [editUser, setEditUser]           = useState(null)
  const [savingUser, setSavingUser]       = useState(false)
  const [showPass, setShowPass]           = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [userForm, setUserForm] = useState({
    email: '', password: '', name: '', role: 'seller', store_name: '', phone: ''
  })

  // ─── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: prods },
        { data: u },
        { data: prod },
        { data: dist },
        { data: s },
        { data: ord },
        { data: notifs },
        { data: storeList },
        { data: spList },
      ] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('production').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('distribution').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('sales').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('orders').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('notifications')
          .select('*, profiles!notifications_created_by_fkey(name)')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase.from('stores').select('*').order('name'),
        supabase.from('store_prices').select('*'),
      ])

      setProducts(prods || [])
      setUsers(u || [])
      setProduction(prod || [])
      setDistrib(dist || [])
      setSales(s || [])
      setOrders(ord || [])
      setNotifications(notifs || [])
      setStores(storeList || [])

      // Build store price map: { store_id: { product_id: unit_price } }
      const spMap = {}
      ;(spList || []).forEach(sp => {
        if (!spMap[sp.store_id]) spMap[sp.store_id] = {}
        spMap[sp.store_id][sp.product_id] = sp.unit_price
      })
      setStorePriceMap(spMap)

      // Stock = produced − distributed
      const pm = {}, dm = {}
      ;(prod || []).forEach(r => { pm[r.product_id] = (pm[r.product_id] || 0) + r.quantity })
      ;(dist || []).forEach(r => { dm[r.product_id] = (dm[r.product_id] || 0) + r.quantity })
      const map = {}
      ;(prods || []).forEach(p => {
        map[p.id] = {
          label:       `${p.type} ${p.size}`,
          produced:    pm[p.id] || 0,
          distributed: dm[p.id] || 0,
          sold:        (s || []).filter(r => r.product_id === p.id).reduce((a, r) => a + (r.quantity || 0), 0),
          remaining:   (pm[p.id] || 0) - (dm[p.id] || 0),
        }
      })
      setStockMap(map)
    } catch (e) {
      toast.error('ໂຫລດຜິດພາດ: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel('admin-realtime-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },    () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' },  () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },         () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' },        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_prices' },  () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // ─── Detail modal ─────────────────────────────────────────────────────
  async function openDetail(type, record) {
    setDetail({ type, record })
    setDetailImgs({})
    setEditDetail(false)
    setEditQty(String(record.quantity ?? ''))
    setLoadingImg(true)
    const bucketMap = { production: 'production-images', distrib: 'distribution-images', sales: 'sales-images' }
    const imageFields = {
      production: ['image_url'],
      distrib:    ['bill_image_url', 'slip_image_url', 'delivery_image_url'],
      sales:      ['image_url', 'report_image_url'],
    }[type] || []
    const urls = {}
    await Promise.all(imageFields.map(async f => {
      if (record[f]) { const u = await getSignedUrl(bucketMap[type], record[f]); if (u) urls[f] = u }
    }))
    setDetailImgs(urls)
    setLoadingImg(false)
  }

  async function deleteDetail() {
    if (!detail) return
    const tableMap = { production: 'production', distrib: 'distribution', sales: 'sales' }
    setSavingDetail(true)
    try {
      const { error } = await supabase.from(tableMap[detail.type]).delete().eq('id', detail.record.id)
      if (error) throw error
      toast.success('ລຶບລາຍການສຳເລັດ ✅')
      setDetail(null); setDetailImgs({})
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally { setSavingDetail(false) }
  }

  async function saveDetailQty() {
    if (!detail || !editQty) return
    const tableMap = { production: 'production', distrib: 'distribution', sales: 'sales' }
    setSavingDetail(true)
    try {
      const { error } = await supabase.from(tableMap[detail.type])
        .update({ quantity: parseInt(editQty) })
        .eq('id', detail.record.id)
      if (error) throw error
      toast.success('ແກ້ໄຂຈຳນວນສຳເລັດ ✅')
      setEditDetail(false)
      setDetail(d => ({ ...d, record: { ...d.record, quantity: parseInt(editQty) } }))
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally { setSavingDetail(false) }
  }

  // ─── Reset table ───────────────────────────────────────────────────────
  async function resetTable(type) {
    const tableMap = { production: 'production', distrib: 'distribution', sales: 'sales' }
    try {
      const { error } = await supabase.from(tableMap[type]).delete().not('id', 'is', null)
      if (error) throw error
      toast.success('Reset ສຳເລັດ ✅')
      setResetConfirm(null)
      load()
    } catch (err) {
      toast.error('Reset ຜິດພາດ: ' + err.message)
    }
  }

  // ─── Toggle paid ───────────────────────────────────────────────────────
  async function togglePaid(type, id, currentValue) {
    const tableMap = { production: 'production', distrib: 'distribution' }
    try {
      const { error } = await supabase.from(tableMap[type]).update({ is_paid: !currentValue }).eq('id', id)
      if (error) throw error
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Order status ──────────────────────────────────────────────────────
  async function updateOrderStatus(id, status) {
    try {
      const { error } = await supabase.from('orders').update({ status }).eq('id', id)
      if (error) throw error
      toast.success('ອັບເດດສຳເລັດ ✅')
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── User CRUD ────────────────────────────────────────────────────────
  function openCreateUser() {
    setEditUser(null)
    setUserForm({ email: '', password: '', name: '', role: 'seller', store_name: '', phone: '' })
    setShowUserForm(true)
  }
  function openEditUser(u) {
    setEditUser(u)
    setUserForm({ email: u.email || '', password: '', name: u.name, role: u.role, store_name: u.store_name || '', phone: u.phone || '' })
    setShowUserForm(true)
  }
  async function saveUser() {
    if (!userForm.name || !userForm.role) { toast.error('ໃສ່ຂໍ້ມູນໃຫ້ຄົບ'); return }
    if (!editUser && (!userForm.email || !userForm.password)) { toast.error('ໃສ່ Email ແລະ Password'); return }
    setSavingUser(true)
    try {
      if (editUser) {
        const { error } = await supabase.from('profiles').update({
          name: userForm.name, role: userForm.role,
          store_name: userForm.store_name || null, phone: userForm.phone || null,
        }).eq('id', editUser.id)
        if (error) throw error
        toast.success('ແກ້ໄຂຂໍ້ມູນສຳເລັດ')
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/.netlify/functions/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            email: userForm.email, password: userForm.password, name: userForm.name,
            role: userForm.role, store_name: userForm.store_name || null, phone: userForm.phone || null,
          }),
        })
        const result = await res.json()
        if (!result.success) throw new Error(result.error || 'ສ້າງ User ຜິດພາດ')
        toast.success('ສ້າງ User ສຳເລັດ ✅')
      }
      setShowUserForm(false); load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
    finally { setSavingUser(false) }
  }
  async function deleteUser(userId) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId }),
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error)
      toast.success('ລຶບ User ສຳເລັດ'); load()
    } catch (err) { toast.error('ລຶບຜິດພາດ: ' + err.message) }
  }

  // ─── Store CRUD ───────────────────────────────────────────────────────
  function openCreateStore() {
    setEditStore(null)
    const defaultPrices = {}
    products.forEach(p => { defaultPrices[p.id] = '' })
    setStoreForm({ name: '', maps_url: '', prices: defaultPrices })
    setShowStoreForm(true)
  }
  function openEditStore(store) {
    setEditStore(store)
    const prices = {}
    products.forEach(p => {
      prices[p.id] = String(storePriceMap[store.id]?.[p.id] ?? '')
    })
    setStoreForm({ name: store.name, maps_url: store.maps_url || '', prices })
    setShowStoreForm(true)
  }
  async function saveStore() {
    if (!storeForm.name.trim()) { toast.error('ໃສ່ຊື່ຮ້ານ'); return }
    setSavingStore(true)
    try {
      let storeId
      if (editStore) {
        const { error } = await supabase.from('stores').update({
          name:     storeForm.name.trim(),
          maps_url: storeForm.maps_url.trim() || null,
        }).eq('id', editStore.id)
        if (error) throw error
        storeId = editStore.id
      } else {
        const { data, error } = await supabase.from('stores').insert({
          name:     storeForm.name.trim(),
          maps_url: storeForm.maps_url.trim() || null,
        }).select().single()
        if (error) throw error
        storeId = data.id
      }

      // Upsert prices for each product
      const priceRows = products.map(p => ({
        store_id:   storeId,
        product_id: p.id,
        unit_price: parseFloat(storeForm.prices[p.id]) || 0,
      }))
      if (priceRows.length > 0) {
        const { error: priceErr } = await supabase
          .from('store_prices')
          .upsert(priceRows, { onConflict: 'store_id,product_id' })
        if (priceErr) throw priceErr
      }

      toast.success(editStore ? 'ແກ້ໄຂຮ້ານສຳເລັດ ✅' : 'ເພີ່ມຮ້ານສຳເລັດ ✅')
      setShowStoreForm(false)
      load()
    } catch (err) {
      toast.error(err.message.includes('unique') ? 'ມີຊື່ຮ້ານນີ້ແລ້ວ' : 'ຜິດພາດ: ' + err.message)
    } finally { setSavingStore(false) }
  }
  async function deleteStore(storeId) {
    try {
      const { error } = await supabase.from('stores').delete().eq('id', storeId)
      if (error) throw error
      toast.success('ລຶບຮ້ານສຳເລັດ')
      setDeleteStoreConfirm(null)
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Notification form: select store → auto-fill items ─────────────────
  function handleNotifStoreChange(storeId) {
    const store   = stores.find(s => s.id === storeId)
    const prices  = storePriceMap[storeId] || {}
    const items   = products.map(p => ({
      product_id:   p.id,
      product_name: `${p.type} ${p.size}`,
      quantity:     '',
      unit_price:   prices[p.id] !== undefined ? String(prices[p.id]) : '',
    }))
    setNotifForm(f => ({
      ...f,
      storeId,
      storeName:    store?.name     || '',
      storeMapsUrl: store?.maps_url || '',
      items,
    }))
  }

  function updateNotifItem(i, field, val) {
    setNotifForm(f => ({
      ...f,
      items: f.items.map((it, idx) => idx === i ? { ...it, [field]: val } : it),
    }))
  }

  // ─── Send notification ─────────────────────────────────────────────────
  async function sendNotification() {
    if (!notifForm.storeId)  { toast.error('ເລືອກຮ້ານຄ້າ'); return }
    const validItems = notifForm.items.filter(i => parseInt(i.quantity) > 0)
    if (!validItems.length)  { toast.error('ໃສ່ຈຳນວນສິນຄ້າຢ່າງໜ້ອຍ 1 ລາຍການ'); return }

    setSendingNotif(true)
    try {
      const { error } = await supabase.from('notifications').insert({
        type:          'pickup',
        message:       notifForm.message.trim() || `ກະລຸນາສົ່ງສິນຄ້າໄປ ${notifForm.storeName}`,
        assigned_to:   notifForm.assignedTo || null,
        store_id:      notifForm.storeId,
        store_name:    notifForm.storeName,
        store_maps_url: notifForm.storeMapsUrl || null,
        items:         validItems.map(i => ({
          product_id:   i.product_id,
          product_name: i.product_name,
          quantity:     parseInt(i.quantity),
          unit_price:   parseFloat(i.unit_price) || 0,
        })),
        created_by: user.id,
        status:     'pending',
      })
      if (error) throw error
      toast.success('ສົ່ງຄຳສັ່ງ Distributor ສຳເລັດ ✅')
      setShowNotifForm(false)
      setNotifForm({ assignedTo: '', storeId: '', storeName: '', storeMapsUrl: '', items: [], message: '' })
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally { setSendingNotif(false) }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportAllReports(supabase); toast.success('Export Excel ສຳເລັດ ✅')
    } catch (err) { toast.error('Export ຜິດພາດ: ' + err.message) }
    finally { setExporting(false) }
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  function fmtDateTime(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // ─── Computed ─────────────────────────────────────────────────────────
  const totalProduced    = production.reduce((s, r) => s + r.quantity, 0)
  const totalDistributed = distrib.reduce((s, r) => s + r.quantity, 0)
  const totalSold        = sales.reduce((s, r) => s + (r.quantity || 0), 0)
  const totalRemaining   = Object.values(stockMap).reduce((s, v) => s + v.remaining, 0)
  const pendingOrders    = orders.filter(o => o.status === 'pending').length
  const cashDist         = distrib.filter(r => r.payment_method === 'cash')
  const transferDist     = distrib.filter(r => r.payment_method === 'transfer')
  const cashQty          = cashDist.reduce((s, r) => s + r.quantity, 0)
  const transferQty      = transferDist.reduce((s, r) => s + r.quantity, 0)

  // ─── Store stats ───────────────────────────────────────────────────────
  function getStoreStats() {
    const now = new Date()
    let startDate, endDate = now
    if (storeFilter === 'week') {
      startDate = new Date(now); startDate.setDate(startDate.getDate() - 7)
    } else if (storeFilter === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      startDate = filterFrom ? new Date(filterFrom) : new Date('2020-01-01')
      endDate   = filterTo   ? new Date(filterTo + 'T23:59:59') : now
    }
    const filtered = distrib.filter(r => {
      const d = new Date(r.created_at)
      return d >= startDate && d <= endDate
    })
    const map = {}
    filtered.forEach(r => {
      const key = r.store_name || 'ບໍ່ລະບຸ'
      if (!map[key]) map[key] = { qty: 0, amount: 0, count: 0, lastDate: null }
      map[key].qty    += r.quantity || 0
      map[key].amount += (r.quantity || 0) * (r.unit_price || 0)
      map[key].count  += 1
      if (!map[key].lastDate || r.created_at > map[key].lastDate) map[key].lastDate = r.created_at
    })
    const sorted = Object.entries(map).sort((a, b) => b[1].qty - a[1].qty)
    return {
      sorted,
      totalQty:    sorted.reduce((s, [, v]) => s + v.qty,    0),
      totalAmount: sorted.reduce((s, [, v]) => s + v.amount, 0),
      maxQty:      sorted[0]?.[1].qty || 1,
    }
  }

  // ─── Helper: Reset button ──────────────────────────────────────────────
  const ResetBtn = ({ type, label }) => (
    <button
      onClick={() => setResetConfirm({ type, label })}
      className="flex items-center gap-1 text-xs text-red-400 border border-red-400/30 px-3 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
    >
      <RotateCcw size={12} /> Reset
    </button>
  )

  // ─── Helper: Paid toggle ───────────────────────────────────────────────
  const PaidBtn = ({ type, id, isPaid }) => (
    <button
      onClick={e => { e.stopPropagation(); togglePaid(type, id, isPaid) }}
      className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors border ${
        isPaid
          ? 'bg-green-900/40 text-green-400 border-green-400/30'
          : 'bg-dark-700 text-gray-400 border-gray-600'
      }`}
    >
      {isPaid ? <><CheckCircle size={11} />ຊຳລະແລ້ວ</> : <><XCircle size={11} />ບໍ່ທັນ</>}
    </button>
  )

  // ─── Tab: Dashboard ────────────────────────────────────────────────────
  function renderDashboard() {
    return (
      <div className="space-y-6">
        <div>
          <SectionTitle>📊 ສະຫຼຸບລວມ</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="ຜະລິດທັງໝົດ"     value={totalProduced.toLocaleString()}    sub="ຕຸກ" icon="🏭" color="yellow" />
            <StatCard label="ກະຈາຍທັງໝົດ"     value={totalDistributed.toLocaleString()} sub="ຕຸກ" icon="🚚" color="blue" />
            <StatCard label="ຍອດຂາຍ (ລາຍງານ)" value={totalSold.toLocaleString()}        sub="ຕຸກ" icon="🛒" color="green" />
            <StatCard label="Stock ຄ້າງສາງ"    value={totalRemaining.toLocaleString()}   sub="ຕຸກ" icon="📦" color={totalRemaining < 0 ? 'red' : 'white'} />
          </div>
        </div>

        {pendingOrders > 0 && (
          <div className="card border-yellow-500/40 bg-yellow-900/10 cursor-pointer" onClick={() => setTab('orders')}>
            <p className="text-yellow-400 font-semibold text-sm">🔔 ມີການສັ່ງສິນຄ້າລໍຖ້າ {pendingOrders} ລາຍການ</p>
            <p className="text-yellow-400/70 underline text-xs mt-1">ກົດເພື່ອກວດ →</p>
          </div>
        )}

        <div>
          <SectionTitle>💰 ການຊຳລະ</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="ເງິນສົດ" value={cashQty.toLocaleString()}     sub={`${cashDist.length} ລາຍການ`}     icon="💵" color="green" />
            <StatCard label="ໂອນ"     value={transferQty.toLocaleString()} sub={`${transferDist.length} ລາຍການ`} icon="💳" color="blue" />
          </div>
        </div>

        <div>
          <SectionTitle>📦 Stock ຕໍ່ສິນຄ້າ</SectionTitle>
          <div className="space-y-2">
            {Object.entries(stockMap).map(([id, s]) => (
              <div key={id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-semibold">{s.label}</p>
                  <p className={`text-xl font-bold ${s.remaining < 0 ? 'text-red-400' : 'text-brand-yellow'}`}>
                    {s.remaining} <span className="text-xs font-normal text-gray-400">ຕຸກ</span>
                  </p>
                </div>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>🏭 {s.produced}</span>
                  <span>🚚 {s.distributed}</span>
                  <span>🛒 {s.sold} (ລາຍງານ)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle>👥 ຜູ້ໃຊ້ງານ</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {['producer', 'distributor', 'seller', 'admin'].map(role => {
              const count = users.filter(u => u.role === role).length
              const icons = { producer: '🏭', distributor: '🚚', seller: '🛒', admin: '⚙️' }
              return <StatCard key={role} label={ROLE_LABELS[role]} value={count} sub="ຄົນ" icon={icons[role]} color="white" />
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─── Tab: Users ────────────────────────────────────────────────────────
  function renderUsers() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><Users size={18} className="text-brand-yellow" />ຜູ້ໃຊ້ງານ ({users.length})</SectionTitle>
          <button onClick={openCreateUser} className="btn-primary px-4 py-2 text-sm"><Plus size={16} />ເພີ່ມ</button>
        </div>
        {users.length === 0 ? <Empty icon="👥" message="ຍັງບໍ່ມີຜູ້ໃຊ້" /> : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-semibold">{u.name}</p>
                    {u.store_name && <p className="text-gray-400 text-xs flex items-center gap-1"><Store size={11} />{u.store_name}</p>}
                    <p className="text-gray-500 text-xs">{fmtDate(u.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      u.role === 'admin'       ? 'bg-brand-yellow/20 text-brand-yellow' :
                      u.role === 'producer'    ? 'bg-orange-900/30 text-orange-400' :
                      u.role === 'distributor' ? 'bg-blue-900/30 text-blue-400' :
                                                 'bg-green-900/30 text-green-400'
                    }`}>{ROLE_LABELS[u.role]}</span>
                    <button onClick={() => openEditUser(u)} className="p-2 text-gray-400 hover:text-brand-yellow"><Pencil size={16} /></button>
                    <button onClick={() => setDeleteConfirm(u)} className="p-2 text-gray-400 hover:text-red-400"><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Production ───────────────────────────────────────────────────
  function renderProduction() {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle><Factory size={18} className="text-brand-yellow" />ການຜະລິດ ({production.length})</SectionTitle>
          <ResetBtn type="production" label="ການຜະລິດ" />
        </div>
        {production.length === 0 ? <Empty icon="🏭" /> : (
          <div className="space-y-2">
            {production.map(r => (
              <div key={r.id} className="card">
                <div className="flex justify-between items-start gap-2">
                  <button onClick={() => openDetail('production', r)} className="flex-1 text-left min-w-0">
                    <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                    <p className="text-gray-400 text-xs">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
                    <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
                    {r.image_url && <p className="text-brand-yellow text-xs mt-0.5 flex items-center gap-1"><Image size={10} />ມີຮູບ</p>}
                  </button>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-brand-yellow font-bold text-lg">{r.quantity}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.destination === 'retail' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}`}>
                      {r.destination === 'retail' ? 'ຮ້ານດາດ' : 'ສົ່ງ'}
                    </span>
                    {r.destination === 'retail' && <PaidBtn type="production" id={r.id} isPaid={r.is_paid} />}
                    <ChevronRight size={15} className="text-gray-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Distribution ─────────────────────────────────────────────────
  function renderDistrib() {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle><Truck size={18} className="text-brand-yellow" />ການກະຈາຍ ({distrib.length})</SectionTitle>
          <ResetBtn type="distrib" label="ການກະຈາຍ" />
        </div>
        {distrib.length === 0 ? <Empty icon="🚚" /> : (
          <div className="space-y-2">
            {distrib.map(r => (
              <div key={r.id} className="card">
                <div className="flex justify-between items-start gap-2">
                  <button onClick={() => openDetail('distrib', r)} className="flex-1 text-left min-w-0">
                    <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                    <p className="text-gray-400 text-xs flex items-center gap-1"><Store size={11} />{r.store_name}</p>
                    <p className="text-gray-400 text-xs">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
                    <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
                    {(r.bill_image_url || r.slip_image_url || r.delivery_image_url) && (
                      <p className="text-brand-yellow text-xs mt-0.5 flex items-center gap-1"><Image size={10} />ມີຮູບ</p>
                    )}
                  </button>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <p className="text-brand-yellow font-bold text-lg">{r.quantity}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.payment_method === 'cash' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}`}>
                      {r.payment_method === 'cash' ? '💵 ສົດ' : '💳 ໂອນ'}
                    </span>
                    <PaidBtn type="distrib" id={r.id} isPaid={r.is_paid} />
                    <ChevronRight size={15} className="text-gray-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Sales ────────────────────────────────────────────────────────
  function renderSales() {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle><ShoppingBag size={18} className="text-brand-yellow" />ການຂາຍ (ລາຍງານ) ({sales.length})</SectionTitle>
          <ResetBtn type="sales" label="ການຂາຍ" />
        </div>
        <p className="text-gray-500 text-xs mb-3">⚠️ ຍອດຂາຍນີ້ ເປັນພຽງລາຍງານ — ບໍ່ຕັດ Stock</p>
        {sales.length === 0 ? <Empty icon="🛒" /> : (
          <div className="space-y-2">
            {sales.map(r => (
              <button key={r.id} onClick={() => openDetail('sales', r)}
                className="card w-full text-left hover:border-brand-yellow/40 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                    <p className="text-gray-400 text-xs flex items-center gap-1"><Store size={11} />{r.store_name}</p>
                    <p className="text-gray-400 text-xs">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
                    <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
                    {(r.image_url || r.report_image_url) && <p className="text-brand-yellow text-xs mt-0.5 flex items-center gap-1"><Image size={10} />ມີຮູບ</p>}
                  </div>
                  <div className="text-right flex items-center gap-2 shrink-0">
                    <div>
                      <p className="text-brand-yellow font-bold text-lg">{r.quantity ?? '-'}</p>
                      <p className="text-gray-400 text-xs">ເຫລືອ: {r.remaining}</p>
                    </div>
                    <ChevronRight size={15} className="text-gray-500" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Orders ───────────────────────────────────────────────────────
  function renderOrders() {
    const byStatus = {
      pending:   orders.filter(o => o.status === 'pending'),
      confirmed: orders.filter(o => o.status === 'confirmed'),
      delivered: orders.filter(o => o.status === 'delivered'),
    }

    function OrderCard({ o }) {
      const seller = users.find(u => u.id === o.created_by)
      return (
        <div className="card">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm">{o.products?.type} {o.products?.size}</p>
              <p className="text-gray-400 text-xs flex items-center gap-1"><Store size={11} />{seller?.store_name || seller?.name || 'Unknown'}</p>
              <p className="text-gray-400 text-xs">👤 {seller?.name || 'Unknown'}</p>
              <p className="text-gray-500 text-xs">{fmtDateTime(o.created_at)}</p>
              {o.notes && <p className="text-gray-500 text-xs mt-0.5">📝 {o.notes}</p>}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-brand-yellow font-bold text-lg">{o.quantity} ຕຸກ</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS[o.status]?.color}`}>
                {ORDER_STATUS[o.status]?.label}
              </span>
            </div>
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-dark-500">
            {o.status === 'pending' && (
              <button onClick={() => updateOrderStatus(o.id, 'confirmed')}
                className="flex-1 text-xs py-1.5 rounded-lg bg-blue-900/30 text-blue-400 border border-blue-400/30 hover:bg-blue-900/50 transition-colors">
                ✅ ຢືນຢັນ
              </button>
            )}
            {o.status === 'confirmed' && (
              <button onClick={() => updateOrderStatus(o.id, 'delivered')}
                className="flex-1 text-xs py-1.5 rounded-lg bg-green-900/30 text-green-400 border border-green-400/30 hover:bg-green-900/50 transition-colors">
                📦 ສົ່ງແລ້ວ
              </button>
            )}
            {o.status !== 'pending' && (
              <button onClick={() => updateOrderStatus(o.id, 'pending')}
                className="text-xs py-1.5 px-3 rounded-lg bg-dark-700 text-gray-400 hover:bg-dark-600 transition-colors">
                ↩ ຍົກເລີກ
              </button>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-5">
        <SectionTitle><ClipboardList size={18} className="text-brand-yellow" />ການສັ່ງສິນຄ້າ ({orders.length})</SectionTitle>
        {orders.length === 0 ? <Empty icon="📋" message="ຍັງບໍ່ມີການສັ່ງ" /> : (
          <>
            {byStatus.pending.length > 0 && (
              <div>
                <p className="text-yellow-400 text-xs font-semibold mb-2">🕐 ລໍຖ້າ ({byStatus.pending.length})</p>
                <div className="space-y-2">{byStatus.pending.map(o => <OrderCard key={o.id} o={o} />)}</div>
              </div>
            )}
            {byStatus.confirmed.length > 0 && (
              <div>
                <p className="text-blue-400 text-xs font-semibold mb-2">✅ ຢືນຢັນ ({byStatus.confirmed.length})</p>
                <div className="space-y-2">{byStatus.confirmed.map(o => <OrderCard key={o.id} o={o} />)}</div>
              </div>
            )}
            {byStatus.delivered.length > 0 && (
              <div>
                <p className="text-green-400 text-xs font-semibold mb-2">📦 ສົ່ງແລ້ວ ({byStatus.delivered.length})</p>
                <div className="space-y-2">{byStatus.delivered.map(o => <OrderCard key={o.id} o={o} />)}</div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ─── Tab: Stores ───────────────────────────────────────────────────────
  function renderStores() {
    const { sorted, totalQty, totalAmount, maxQty } = getStoreStats()
    const hasAmount = sorted.some(([, v]) => v.amount > 0)
    const FILTER_BTNS = [
      { id: 'week',   label: 'ອາທິດ' },
      { id: 'month',  label: 'ເດືອນ' },
      { id: 'custom', label: 'ກຳນົດເອງ' },
    ]
    const pendingNotifs = notifications.filter(n => n.status === 'pending').length

    return (
      <div className="space-y-6">

        {/* ── Store Management ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle><Store size={18} className="text-brand-yellow" />ຈັດການຮ້ານຄ້າ</SectionTitle>
            <button onClick={openCreateStore} className="btn-primary px-3 py-2 text-sm">
              <Plus size={15} />ເພີ່ມຮ້ານ
            </button>
          </div>

          {stores.length === 0 ? (
            <Empty icon="🏪" message="ຍັງບໍ່ມີຮ້ານ — ກົດ ເພີ່ມຮ້ານ ດ້ານເທິງ" />
          ) : (
            <div className="space-y-2">
              {stores.map(store => {
                const prices = storePriceMap[store.id] || {}
                return (
                  <div key={store.id} className="card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{store.name}</p>
                        {store.maps_url && (
                          <a href={store.maps_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 text-xs flex items-center gap-1 mt-0.5 hover:text-blue-300">
                            <MapPin size={11} /> ເປີດ Maps
                          </a>
                        )}
                        {/* Price badges */}
                        {products.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {products.map(p => (
                              <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full ${
                                prices[p.id]
                                  ? 'bg-green-900/30 text-green-400 border border-green-400/20'
                                  : 'bg-dark-700 text-gray-500'
                              }`}>
                                {p.type} {p.size}: {prices[p.id] ? Number(prices[p.id]).toLocaleString('lo-LA') + ' ₭' : '—'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditStore(store)} className="p-2 text-gray-400 hover:text-brand-yellow">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setDeleteStoreConfirm(store)} className="p-2 text-gray-400 hover:text-red-400">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Send Notification button ── */}
        <div className="flex items-center justify-between">
          <SectionTitle><TrendingUp size={18} className="text-brand-yellow" />ສະຖິຕິການກະຈາຍ</SectionTitle>
          <button
            onClick={() => setShowNotifForm(true)}
            className="relative flex items-center gap-1.5 text-xs text-blue-400 border border-blue-400/30 px-3 py-1.5 rounded-lg hover:bg-blue-900/20 transition-colors"
          >
            <Bell size={13} />ສ້າງຄຳສັ່ງ
            {pendingNotifs > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {pendingNotifs}
              </span>
            )}
          </button>
        </div>

        {/* Date filter */}
        <div className="flex gap-2">
          {FILTER_BTNS.map(b => (
            <button key={b.id} onClick={() => setStoreFilter(b.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                storeFilter === b.id ? 'bg-brand-yellow text-dark-900' : 'bg-dark-700 text-gray-400 border border-dark-500'
              }`}>
              {b.label}
            </button>
          ))}
        </div>
        {storeFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">ຈາກ</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="field-label">ຫາ</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input-field text-sm" />
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="ທຸກຮ້ານລວມ" value={totalQty.toLocaleString()} sub="ຕຸກ" icon="📦" color="yellow" />
          <StatCard label="ຍອດເງິນລວມ" value={hasAmount ? Math.round(totalAmount / 1000) + 'K' : '-'} sub="₭" icon="💰" color="green" />
        </div>

        {/* Per-store stats */}
        {sorted.length === 0 ? <Empty icon="🏪" message="ບໍ່ມີຂໍ້ມູນໃນຊ່ວງທີ່ເລືອກ" /> : (
          <div className="space-y-3">
            {sorted.map(([name, s], idx) => (
              <div key={name} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                      idx === 0 ? 'bg-yellow-400 text-dark-900' :
                      idx === 1 ? 'bg-gray-300 text-dark-900' :
                      idx === 2 ? 'bg-orange-600 text-white' :
                                  'bg-dark-600 text-gray-400'
                    }`}>{idx + 1}</span>
                    <p className="text-white font-semibold text-sm">{name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-brand-yellow font-bold text-lg">{s.qty.toLocaleString()} <span className="text-xs text-gray-400 font-normal">ຕຸກ</span></p>
                    {s.amount > 0 && <p className="text-green-400 text-xs">{s.amount.toLocaleString()} ₭</p>}
                  </div>
                </div>
                <div className="w-full bg-dark-600 rounded-full h-2 mb-2">
                  <div className="bg-brand-yellow h-2 rounded-full transition-all"
                    style={{ width: `${Math.max(4, (s.qty / maxQty) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>📋 {s.count} ລາຍການ</span>
                  {s.lastDate && <span>ສົ່ງລ່າສຸດ: {fmtDate(s.lastDate)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notification history */}
        {notifications.length > 0 && (
          <div>
            <SectionTitle><Bell size={16} className="text-brand-yellow" />ປະຫວັດຄຳສັ່ງ</SectionTitle>
            <div className="space-y-2">
              {notifications.slice(0, 12).map(n => (
                <div key={n.id} className={`card text-sm ${n.status === 'delivered' ? 'opacity-50' : n.status === 'acknowledged' ? 'opacity-70' : 'border-blue-400/20'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{n.store_name || n.message || '—'}</p>
                      {n.items?.length > 0 && (
                        <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                          <Package size={10} />
                          {n.items.map(i => `${i.product_name} ×${i.quantity}`).join(', ')}
                        </p>
                      )}
                      <p className="text-gray-500 text-xs mt-1">
                        {n.assigned_to
                          ? `➜ ${users.find(u => u.id === n.assigned_to)?.name || 'Distributor'}`
                          : '➜ ທຸກ Distributor'
                        } · {fmtDateTime(n.created_at)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      n.status === 'delivered'   ? 'bg-green-900/30 text-green-400' :
                      n.status === 'acknowledged' ? 'bg-blue-900/30 text-blue-400' :
                                                    'bg-yellow-900/30 text-yellow-400'
                    }`}>
                      {n.status === 'delivered' ? '📦 ສົ່ງແລ້ວ' : n.status === 'acknowledged' ? '✅ ຮັບແລ້ວ' : '⏳ ລໍຖ້າ'}
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

  // ─── Tab: Export ───────────────────────────────────────────────────────
  function renderExport() {
    return (
      <div className="space-y-4">
        <SectionTitle><Download size={18} className="text-brand-yellow" />Export ລາຍງານ</SectionTitle>
        <div className="card text-center py-8">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-white font-semibold mb-1">ດາວໂຫລດ Excel</p>
          <p className="text-gray-400 text-sm mb-6">ດາວໂຫລດລາຍງານທັງໝົດ: ຜະລິດ, ກະຈາຍ, ຂາຍ, ການຊຳລະ</p>
          <button onClick={handleExport} disabled={exporting} className="btn-primary px-8 mx-auto">
            {exporting ? <><div className="spinner border-dark-900" />ກຳລັງ Export...</> : <><Download size={20} />Export Excel (.xlsx)</>}
          </button>
        </div>
        <div className="card space-y-3">
          <p className="text-gray-300 font-medium text-sm">ສະຫຼຸບຂໍ້ມູນ</p>
          {[
            { label: 'ການຜະລິດ', value: production.length, icon: '🏭' },
            { label: 'ການກະຈາຍ', value: distrib.length,   icon: '🚚' },
            { label: 'ການຂາຍ',  value: sales.length,      icon: '🛒' },
            { label: 'ການສັ່ງ',  value: orders.length,     icon: '📋' },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-sm">
              <span className="text-gray-400">{row.icon} {row.label}</span>
              <span className="text-white font-medium">{row.value} ລາຍການ</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const tabContent = {
    dashboard:  renderDashboard,
    users:      renderUsers,
    production: renderProduction,
    distrib:    renderDistrib,
    sales:      renderSales,
    orders:     renderOrders,
    stores:     renderStores,
    export:     renderExport,
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="Admin Dashboard" subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />

      {/* Tab Bar */}
      <div className="sticky top-[61px] z-30 bg-dark-800 border-b border-dark-500 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map(t => {
            const Icon   = t.icon
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 min-w-[64px] ${
                  active ? 'border-brand-yellow text-brand-yellow' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                <Icon size={18} />
                <span>{t.label}</span>
                {t.id === 'orders' && pendingOrders > 0 && (
                  <span className="absolute top-1 right-2 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {pendingOrders > 9 ? '9+' : pendingOrders}
                  </span>
                )}
                {t.id === 'stores' && notifications.filter(n => n.status === 'pending').length > 0 && (
                  <span className="absolute top-1 right-2 bg-blue-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {notifications.filter(n => n.status === 'pending').length}
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
          <div className="animate-fade-in">{tabContent[tab]?.()}</div>
        )}
      </Page>

      {/* ── User Form Modal ─────────────────────────────────────────────── */}
      <Modal open={showUserForm} onClose={() => setShowUserForm(false)} title={editUser ? '✏️ ແກ້ໄຂ User' : '➕ ສ້າງ User ໃໝ່'}>
        <div className="space-y-4">
          <div>
            <label className="field-label">ຊື່ຜູ້ໃຊ້ *</label>
            <input value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="ຊື່ຜູ້ໃຊ້" className="input-field" />
          </div>
          {!editUser && <>
            <div>
              <label className="field-label">Email *</label>
              <input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="input-field" autoComplete="off" />
            </div>
            <div>
              <label className="field-label">ລະຫັດຜ່ານ *</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="ຢ່າງນ້ອຍ 6 ຕົວ" className="input-field pr-12" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </>}
          <div>
            <label className="field-label">ສິດທິ (Role) *</label>
            <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} className="select-field">
              {Object.entries(ROLE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">ຊື່ຮ້ານ (ສຳລັບ Seller)</label>
            <input value={userForm.store_name} onChange={e => setUserForm(f => ({ ...f, store_name: e.target.value }))} placeholder="ຊື່ຮ້ານ (ທາງເລືອກ)" className="input-field" />
          </div>
          <div>
            <label className="field-label">ເບີໂທ</label>
            <input type="tel" value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))} placeholder="020 XXXX XXXX" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={() => setShowUserForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={saveUser} disabled={savingUser} className="btn-primary">
              {savingUser ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Store Form Modal ────────────────────────────────────────────── */}
      <Modal
        open={showStoreForm}
        onClose={() => setShowStoreForm(false)}
        title={editStore ? '✏️ ແກ້ໄຂຮ້ານ' : '➕ ເພີ່ມຮ້ານໃໝ່'}
      >
        <div className="space-y-4">
          <div>
            <label className="field-label">ຊື່ຮ້ານ *</label>
            <input
              value={storeForm.name}
              onChange={e => setStoreForm(f => ({ ...f, name: e.target.value }))}
              placeholder="ຊື່ຮ້ານຄ້າ"
              className="input-field"
            />
          </div>

          <div>
            <label className="field-label flex items-center gap-1.5">
              <MapPin size={13} className="text-blue-400" /> Google Maps URL (ທາງເລືອກ)
            </label>
            <input
              type="url"
              value={storeForm.maps_url}
              onChange={e => setStoreForm(f => ({ ...f, maps_url: e.target.value }))}
              placeholder="https://maps.google.com/..."
              className="input-field text-sm"
            />
            <p className="text-gray-500 text-xs mt-1">ໃສ່ link Google Maps ຂອງຮ້ານ ເພື່ອໃຫ້ Distributor Navigate ໄດ້</p>
          </div>

          {/* Per-product pricing */}
          {products.length > 0 && (
            <div className="space-y-2">
              <label className="field-label flex items-center gap-1.5">
                <Package size={13} className="text-brand-yellow" /> ລາຄາສິນຄ້າຂອງຮ້ານນີ້
              </label>
              <div className="space-y-2">
                {products.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-dark-700 rounded-xl px-3 py-2">
                    <span className="text-gray-300 text-sm flex-1">{p.type} {p.size}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="100"
                        value={storeForm.prices[p.id] ?? ''}
                        onChange={e => setStoreForm(f => ({
                          ...f,
                          prices: { ...f.prices, [p.id]: e.target.value },
                        }))}
                        placeholder="0"
                        className="w-28 bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-white text-sm text-right"
                      />
                      <span className="text-gray-400 text-xs">₭/ຕຸກ</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={() => setShowStoreForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={saveStore} disabled={savingStore} className="btn-primary">
              {savingStore ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Send Notification Modal ─────────────────────────────────────── */}
      <Modal open={showNotifForm} onClose={() => setShowNotifForm(false)} title="📦 ສ້າງຄຳສັ່ງສົ່ງສິນຄ້າ">
        <div className="space-y-4">

          {/* Store selector */}
          <div>
            <label className="field-label">ຮ້ານຄ້າ * (ສົ່ງໄປຮ້ານໃດ)</label>
            <select
              value={notifForm.storeId}
              onChange={e => handleNotifStoreChange(e.target.value)}
              className="select-field"
            >
              <option value="">-- ເລືອກຮ້ານ --</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {notifForm.storeMapsUrl && (
              <a href={notifForm.storeMapsUrl} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 text-xs flex items-center gap-1 mt-1 hover:text-blue-300">
                <MapPin size={11} /> ເບິ່ງ Maps
              </a>
            )}
          </div>

          {/* Items (qty per product) */}
          {notifForm.items.length > 0 && (
            <div className="space-y-2">
              <label className="field-label flex items-center gap-1.5">
                <Package size={13} className="text-brand-yellow" /> ລາຍການສິນຄ້າ (ໃສ່ 0 ເພື່ອຍົກເວັ້ນ)
              </label>
              {notifForm.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 bg-dark-700 rounded-xl px-3 py-2">
                  <span className="text-gray-300 text-sm flex-1">{item.product_name}</span>
                  <div className="flex items-center gap-2">
                    <div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={item.quantity}
                        onChange={e => updateNotifItem(i, 'quantity', e.target.value)}
                        placeholder="0"
                        className="w-20 bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-brand-yellow font-bold text-sm text-right"
                      />
                      <span className="text-gray-500 text-xs ml-1">ຕຸກ</span>
                    </div>
                    <div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="100"
                        value={item.unit_price}
                        onChange={e => updateNotifItem(i, 'unit_price', e.target.value)}
                        placeholder="0"
                        className="w-24 bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-green-400 text-sm text-right"
                      />
                      <span className="text-gray-500 text-xs ml-1">₭</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Distributor selector */}
          <div>
            <label className="field-label">ສົ່ງຫາ Distributor</label>
            <select
              value={notifForm.assignedTo}
              onChange={e => setNotifForm(f => ({ ...f, assignedTo: e.target.value }))}
              className="select-field"
            >
              <option value="">ທຸກ Distributor (Broadcast)</option>
              {users.filter(u => u.role === 'distributor').map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Optional message */}
          <div>
            <label className="field-label">ໝາຍເຫດ (ທາງເລືອກ)</label>
            <textarea
              value={notifForm.message}
              onChange={e => setNotifForm(f => ({ ...f, message: e.target.value }))}
              placeholder="ຂໍ້ຄວາມເພີ່ມເຕີມ..."
              rows={2}
              className="input-field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={() => setShowNotifForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={sendNotification} disabled={sendingNotif}
              className="flex items-center justify-center gap-2 btn-primary">
              {sendingNotif
                ? <><div className="spinner border-dark-900" />ກຳລັງສົ່ງ...</>
                : <><Send size={16} />ສົ່ງຄຳສັ່ງ</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete User Confirm ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteUser(deleteConfirm?.id)}
        title="ລຶບ User"
        message={`ທ່ານຕ້ອງການລຶບ "${deleteConfirm?.name}" ແທ້ບໍ? ຂໍ້ມູນທັງໝົດຂອງ User ນີ້ຈະຖືກລຶບ.`}
        confirmLabel="ລຶບ"
        danger
      />

      {/* ── Delete Store Confirm ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteStoreConfirm}
        onClose={() => setDeleteStoreConfirm(null)}
        onConfirm={() => deleteStore(deleteStoreConfirm?.id)}
        title="ລຶບຮ້ານ"
        message={`ທ່ານຕ້ອງການລຶບຮ້ານ "${deleteStoreConfirm?.name}" ແທ້ບໍ?`}
        confirmLabel="ລຶບ"
        danger
      />

      {/* ── Reset Table Confirm ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!resetConfirm}
        onClose={() => setResetConfirm(null)}
        onConfirm={() => resetTable(resetConfirm?.type)}
        title={`⚠️ Reset ${resetConfirm?.label}`}
        message={`ທ່ານຕ້ອງການ Reset ປະຫວັດ "${resetConfirm?.label}" ທັງໝົດແທ້ບໍ?\n\nຂໍ້ມູນທັງໝົດຈະຖືກລຶບ ແລະ ບໍ່ສາມາດກູ້ຄືນໄດ້.`}
        confirmLabel="Reset ທັງໝົດ"
        danger
      />

      {/* ── Detail Modal ────────────────────────────────────────────────── */}
      <Modal
        open={!!detail}
        onClose={() => { setDetail(null); setDetailImgs({}); setEditDetail(false) }}
        title={
          detail?.type === 'production' ? '🏭 ລາຍລະອຽດການຜະລິດ' :
          detail?.type === 'distrib'    ? '🚚 ລາຍລະອຽດການກະຈາຍ' :
                                         '🛒 ລາຍລະອຽດການຂາຍ'
        }
      >
        {detail && (() => {
          const r   = detail.record
          const Row = ({ label, value }) =>
            value !== undefined && value !== null && value !== '' ? (
              <div className="flex justify-between py-1.5 border-b border-dark-500 last:border-0">
                <span className="text-gray-400 text-sm">{label}</span>
                <span className="text-white text-sm font-medium text-right max-w-[60%]">{value}</span>
              </div>
            ) : null

          return (
            <div className="space-y-4">
              <div className="card space-y-0 py-1">
                <Row label="ສິນຄ້າ" value={`${r.products?.type} ${r.products?.size}`} />

                {/* Quantity (editable) */}
                <div className="flex justify-between py-1.5 border-b border-dark-500">
                  <span className="text-gray-400 text-sm">ຈຳນວນ</span>
                  {editDetail ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" value={editQty}
                        onChange={e => setEditQty(e.target.value)}
                        className="w-24 bg-dark-700 border border-brand-yellow/50 rounded-lg px-2 py-1 text-white text-sm text-right"
                        autoFocus
                      />
                      <button onClick={saveDetailQty} disabled={savingDetail} className="p-1 text-green-400 hover:text-green-300"><CheckCircle size={18} /></button>
                      <button onClick={() => setEditDetail(false)} className="p-1 text-red-400 hover:text-red-300"><XCircle size={18} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{r.quantity ?? '-'} ຕຸກ</span>
                      <button onClick={() => { setEditDetail(true); setEditQty(String(r.quantity ?? 0)) }}
                        className="p-1 text-gray-400 hover:text-brand-yellow">
                        <Edit3 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <Row label="ຜູ້ບັນທຶກ" value={users.find(u => u.id === r.created_by)?.name || 'Unknown'} />
                <Row label="ວັນທີ"      value={fmtDateTime(r.created_at)} />

                {detail.type === 'production' && (
                  <Row label="ປາຍທາງ" value={r.destination === 'retail' ? 'ຮ້ານດາດ' : 'ສົ່ງ'} />
                )}
                {detail.type === 'distrib' && <>
                  <Row label="ຮ້ານ"    value={r.store_name} />
                  <Row label="ຜູ້ຮັບ"   value={r.receiver_name} />
                  <Row label="ເບີໂທ"   value={r.phone} />
                  <Row label="ຊຳລະ"   value={r.payment_method === 'cash' ? '💵 ເງິນສົດ' : '💳 ໂອນ'} />
                  <Row label="ສະຖານະ" value={r.is_paid ? '✅ ຊຳລະແລ້ວ' : '⏳ ບໍ່ທັນຊຳລະ'} />
                  <Row label="ໝາຍເຫດ" value={r.notes} />
                </>}
                {detail.type === 'sales' && <>
                  <Row label="ຮ້ານ"      value={r.store_name} />
                  <Row label="ຍັງເຫລືອ" value={r.remaining !== undefined && r.remaining !== null ? `${r.remaining} ຕຸກ` : undefined} />
                  <Row label="ໝາຍເຫດ"   value={r.notes} />
                </>}
              </div>

              {/* Images */}
              {loadingImg ? (
                <div className="flex justify-center py-4"><Spinner size={28} /></div>
              ) : (
                <div className="space-y-3">
                  {detail.type === 'production' && detailImgs.image_url && (
                    <div><p className="text-gray-400 text-xs mb-1">📸 ຮູບພາບ</p><img src={detailImgs.image_url} alt="" className="w-full rounded-xl object-cover max-h-64" /></div>
                  )}
                  {detail.type === 'distrib' && <>
                    {detailImgs.bill_image_url     && <div><p className="text-gray-400 text-xs mb-1">🧾 ໃບບິນ</p><img src={detailImgs.bill_image_url} alt="" className="w-full rounded-xl object-cover max-h-64" /></div>}
                    {detailImgs.slip_image_url     && <div><p className="text-gray-400 text-xs mb-1">💳 ສະລິບໂອນ</p><img src={detailImgs.slip_image_url} alt="" className="w-full rounded-xl object-cover max-h-64" /></div>}
                    {detailImgs.delivery_image_url && <div><p className="text-gray-400 text-xs mb-1">📦 ຮູບສົ່ງ</p><img src={detailImgs.delivery_image_url} alt="" className="w-full rounded-xl object-cover max-h-64" /></div>}
                  </>}
                  {detail.type === 'sales' && <>
                    {detailImgs.image_url        && <div><p className="text-gray-400 text-xs mb-1">🏪 ຮູບຮ້ານ / Stock</p><img src={detailImgs.image_url} alt="" className="w-full rounded-xl object-cover max-h-64" /></div>}
                    {detailImgs.report_image_url && <div><p className="text-gray-400 text-xs mb-1">📊 ຮູບລາຍງານ</p><img src={detailImgs.report_image_url} alt="" className="w-full rounded-xl object-cover max-h-64" /></div>}
                  </>}
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setDetail(null); setDetailImgs({}); setEditDetail(false) }}
                  className="btn-secondary">
                  ປິດ
                </button>
                <button onClick={deleteDetail} disabled={savingDetail}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-900/30 text-red-400 border border-red-400/30 hover:bg-red-900/50 text-sm font-medium transition-colors disabled:opacity-50">
                  <Trash2 size={16} />ລຶບລາຍການ
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

export default function AdminDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
