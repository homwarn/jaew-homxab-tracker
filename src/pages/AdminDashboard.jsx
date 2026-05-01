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
  Bell, Send, TrendingUp, MapPin, Package, Printer, Boxes
} from 'lucide-react'
import { generateInvoiceNo, printInvoice } from '../lib/invoice'

// ─── Tab definitions ──────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',  label: 'ສະຫຼຸບ',   icon: LayoutDashboard },
  { id: 'users',      label: 'Users',    icon: Users },
  { id: 'production', label: 'ຜະລິດ',    icon: Factory },
  { id: 'distrib',    label: 'ກະຈາຍ',    icon: Truck },
  { id: 'sales',      label: 'ຂາຍ',      icon: ShoppingBag },
  { id: 'stores',     label: 'ຮ້ານ',      icon: Store },
  { id: 'materials',  label: 'ວັດຖຸດິບ', icon: Boxes },
  { id: 'export',     label: 'Export',   icon: Download },
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

  // Cashier / materials
  const [rawMaterials, setRawMaterials] = useState([])
  const [matCategories, setMatCategories] = useState([])
  const [matUsage, setMatUsage]           = useState([])

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

  // Distribution records filter
  const [distribFilter, setDistribFilter] = useState({ store: '', payMethod: '', isPaid: '', dateFrom: '', dateTo: '' })

  // Single-record delete confirm
  const [deleteSingleDistrib, setDeleteSingleDistrib] = useState(null)

  // Archive panel: null | 'delivered' | 'fees'
  const [archivePanel, setArchivePanel] = useState(null)

  // Notification edit + cancel
  const [editNotif, setEditNotif]                 = useState(null)
  const [showEditNotifForm, setShowEditNotifForm] = useState(false)
  const [savingEditNotif, setSavingEditNotif]     = useState(false)
  const [cancelNotifConfirm, setCancelNotifConfirm] = useState(null)
  const [notifEditForm, setNotifEditForm]         = useState({ message: '', items: [] })
  const [cancelAllNotifConfirm, setCancelAllNotifConfirm] = useState(false)
  const [resetEverythingConfirm, setResetEverythingConfirm] = useState(false)
  const [clearOrdersConfirm, setClearOrdersConfirm] = useState(false)

  // Store management form
  const [showStoreForm, setShowStoreForm] = useState(false)
  const [editStore, setEditStore]         = useState(null)
  const [savingStore, setSavingStore]     = useState(false)
  const [deleteStoreConfirm, setDeleteStoreConfirm] = useState(null)
  const [storeForm, setStoreForm] = useState({ name: '', phone: '', maps_url: '', qr_code_url: '', prices: {} })
  const [storeSearch, setStoreSearch]     = useState('')

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
        { data: matCats },
        { data: mats },
        { data: matUse },
      ] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('production').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('distribution').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('sales').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('orders').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase.from('stores').select('*').order('name'),
        supabase.from('store_prices').select('*'),
        supabase.from('material_categories').select('*').order('name'),
        supabase.from('raw_materials').select('*, material_categories(name)').order('name'),
        supabase.from('material_usage').select('*').order('created_at', { ascending: false }).limit(30),
      ])

      setProducts(prods || [])
      setUsers(u || [])
      setProduction(prod || [])
      setDistrib(dist || [])
      setSales(s || [])
      setOrders(ord || [])
      setNotifications(notifs || [])
      setStores(storeList || [])
      setMatCategories(matCats || [])
      setRawMaterials(mats || [])
      setMatUsage(matUse || [])

      // Build store price map: { store_id: { product_id: unit_price } }
      const spMap = {}
      ;(spList || []).forEach(sp => {
        if (!spMap[sp.store_id]) spMap[sp.store_id] = {}
        spMap[sp.store_id][sp.product_id] = sp.unit_price
      })
      setStorePriceMap(spMap)

      // Stock = ສະເພາະ ຂາຍສົ່ງ − ກະຈາຍ (ຮ້ານດາດ/ໝໍ້ ບໍ່ນັບໃນ stock)
      const pm = {}, dm = {}
      ;(prod || []).filter(r => r.destination !== 'retail')
                   .forEach(r => { pm[r.product_id] = (pm[r.product_id] || 0) + r.quantity })
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
      .channel('admin-realtime-v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' },      () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },             () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },            () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },     () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' },            () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_prices' },      () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_materials' },     () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_usage' },    () => load())
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

  // ─── Clear all seller orders ───────────────────────────────────────────
  async function clearAllOrders() {
    try {
      const { error } = await supabase.from('orders').delete().not('id', 'is', null)
      if (error) throw error
      toast.success('ລຶບລາຍການສັ່ງທັງໝົດສຳເລັດ ✅')
      setClearOrdersConfirm(false)
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
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

  // ─── Mark ALL delivery fees paid (admin) ─────────────────────────────
  async function markAllDeliveryFeesPaidAdmin() {
    const unpaidIds = distrib
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

  // ─── Toggle delivery fee paid ──────────────────────────────────────────
  async function toggleDeliveryFeePaid(id, currentValue) {
    try {
      const { error } = await supabase
        .from('distribution')
        .update({ delivery_fee_paid: !currentValue })
        .eq('id', id)
      if (error) throw error
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Order status ──────────────────────────────────────────────────────
  async function updateOrderStatus(id, status) {
    try {
      const { error } = await supabase.from('orders').update({ status }).eq('id', id)
      if (error) throw error

      // When confirming a seller order → auto-create distributor notification
      if (status === 'confirmed') {
        const order  = orders.find(o => o.id === id)
        const seller = users.find(u => u.id === order?.created_by)
        if (order && seller) {
          const matchedStore = stores.find(s => s.name === seller.store_name)
          const prices = matchedStore ? (storePriceMap[matchedStore.id] || {}) : {}
          await supabase.from('notifications').insert({
            type:           'pickup',
            message:        `📋 ຄຳສັ່ງຈາກ Seller: ${seller.name}${seller.store_name ? ` (${seller.store_name})` : ''}`,
            assigned_to:    null,
            store_id:       matchedStore?.id || null,
            store_name:     seller.store_name || seller.name || '—',
            store_maps_url: matchedStore?.maps_url || null,
            items: [{
              product_id:   order.product_id,
              product_name: `${order.products?.type} ${order.products?.size}`,
              quantity:     order.quantity,
              unit_price:   prices[order.product_id] || 0,
            }],
            created_by: user.id,
            status:     'pending',
          })
        }
      }

      toast.success('ອັບເດດສຳເລັດ ✅')
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Delete single distrib record ─────────────────────────────────────
  async function deleteDistribRecord(id) {
    try {
      const { error } = await supabase.from('distribution').delete().eq('id', id)
      if (error) throw error
      toast.success('ລຶບລາຍການສຳເລັດ ✅')
      setDeleteSingleDistrib(null)
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Reset notification status back to pending ─────────────────────────
  async function resetNotifStatus(id) {
    try {
      const { error } = await supabase.from('notifications').update({ status: 'pending', acknowledged_at: null }).eq('id', id)
      if (error) throw error
      toast.success('Reset ຄຳສັ່ງສຳເລັດ ✅')
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Cancel (delete) a notification ───────────────────────────────────
  async function cancelNotif(id) {
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) throw error
      toast.success('ຍົກເລີກຄຳສັ່ງສຳເລັດ')
      setCancelNotifConfirm(null)
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Cancel ALL active notifications ──────────────────────────────────
  async function cancelAllNotifs() {
    const activeIds = notifications
      .filter(n => n.status !== 'delivered')
      .map(n => n.id)
    if (!activeIds.length) { toast.error('ບໍ່ມີຄຳສັ່ງທີ່ຈະຍົກເລີກ'); setCancelAllNotifConfirm(false); return }
    try {
      const { error } = await supabase.from('notifications').delete().in('id', activeIds)
      if (error) throw error
      toast.success(`ຍົກເລີກ ${activeIds.length} ຄຳສັ່ງສຳເລັດ ✅`)
      setCancelAllNotifConfirm(false)
      load()
    } catch (err) { toast.error('ຜິດພາດ: ' + err.message) }
  }

  // ─── Reset EVERYTHING ──────────────────────────────────────────────────
  async function resetEverything() {
    try {
      await Promise.all([
        supabase.from('production').delete().not('id', 'is', null),
        supabase.from('distribution').delete().not('id', 'is', null),
        supabase.from('sales').delete().not('id', 'is', null),
        supabase.from('orders').delete().not('id', 'is', null),
        supabase.from('notifications').delete().not('id', 'is', null),
      ])
      toast.success('Reset ທຸກຢ່າງສຳເລັດ ✅')
      setResetEverythingConfirm(false)
      load()
    } catch (err) { toast.error('Reset ຜິດພາດ: ' + err.message) }
  }

  // ─── Open edit notification form ───────────────────────────────────────
  function openEditNotif(notif) {
    setEditNotif(notif)
    setNotifEditForm({
      message: notif.message || '',
      items: Array.isArray(notif.items) ? notif.items.map(i => ({
        ...i,
        quantity:     String(i.quantity || ''),
        unit_price:   String(i.unit_price || ''),
        is_promotion: !!i.is_promotion,
      })) : [],
    })
    setShowEditNotifForm(true)
  }

  // ─── Save edited notification ──────────────────────────────────────────
  async function saveEditNotif() {
    if (!editNotif) return
    const validItems = notifEditForm.items.filter(i => parseInt(i.quantity) > 0)
    setSavingEditNotif(true)
    try {
      const { error } = await supabase.from('notifications').update({
        message: notifEditForm.message.trim() || editNotif.message,
        items: validItems.map(i => ({
          product_id:   i.product_id,
          product_name: i.product_name,
          quantity:     parseInt(i.quantity),
          unit_price:   parseFloat(i.unit_price) || 0,
          is_promotion: !!i.is_promotion,
        })),
      }).eq('id', editNotif.id)
      if (error) throw error
      toast.success('ແກ້ໄຂຄຳສັ່ງສຳເລັດ ✅')
      setShowEditNotifForm(false)
      setEditNotif(null)
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally { setSavingEditNotif(false) }
  }

  function updateEditNotifItem(i, field, val) {
    setNotifEditForm(f => ({
      ...f,
      items: f.items.map((it, idx) => idx === i ? { ...it, [field]: val } : it),
    }))
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
    setStoreForm({ name: '', phone: '', maps_url: '', qr_code_url: '', prices: defaultPrices })
    setShowStoreForm(true)
  }
  function openEditStore(store) {
    setEditStore(store)
    const prices = {}
    products.forEach(p => {
      prices[p.id] = String(storePriceMap[store.id]?.[p.id] ?? '')
    })
    setStoreForm({ name: store.name, phone: store.phone || '', maps_url: store.maps_url || '', qr_code_url: store.qr_code_url || '', prices })
    setShowStoreForm(true)
  }
  async function saveStore() {
    if (!storeForm.name.trim()) { toast.error('ໃສ່ຊື່ຮ້ານ'); return }
    setSavingStore(true)
    try {
      let storeId
      if (editStore) {
        const { error } = await supabase.from('stores').update({
          name:         storeForm.name.trim(),
          phone:        storeForm.phone.trim() || null,
          maps_url:     storeForm.maps_url.trim() || null,
          qr_code_url:  storeForm.qr_code_url.trim() || null,
        }).eq('id', editStore.id)
        if (error) throw error
        storeId = editStore.id
      } else {
        const { data, error } = await supabase.from('stores').insert({
          name:         storeForm.name.trim(),
          phone:        storeForm.phone.trim() || null,
          maps_url:     storeForm.maps_url.trim() || null,
          qr_code_url:  storeForm.qr_code_url.trim() || null,
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
      is_promotion: false,
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
          is_promotion: !!i.is_promotion,
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

  // ─── Print invoice from a notification ────────────────────────────────
  function handlePrintNotifInvoice(notif) {
    const items = Array.isArray(notif.items) ? notif.items : []
    if (!items.length) { toast.error('ບໍ່ມີລາຍການສິນຄ້າໃນ Notification ນີ້'); return }
    const distUser  = users.find(u => u.id === notif.assigned_to)
    const storeData = stores.find(s => s.id === notif.store_id)
    // Use store-specific QR if set, otherwise fall back to static /qr-payment.jpg
    const bankQrSrc = storeData?.qr_code_url || `${window.location.origin}/qr-payment.jpg`
    printInvoice({
      invoiceNo:       generateInvoiceNo(),
      storeName:       notif.store_name || '—',
      storeMapsUrl:    notif.store_maps_url,
      distributorName: distUser?.name || 'ຜູ້ກະຈາຍ',
      items,
      paymentMethod:   'cash',
      isPaid:          notif.status === 'delivered',
      notes:           notif.message,
      bankQrSrc,
    })
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  function fmtDateTime(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // ─── Computed ─────────────────────────────────────────────────────────
  // ຜະລິດ ສາງ = ສະເພາະ ຂາຍສົ່ງ (ຮ້ານດາດ ບໍ່ນັບ)
  const totalProduced    = production.filter(r => r.destination !== 'retail').reduce((s, r) => s + r.quantity, 0)
  const totalRetail      = production.filter(r => r.destination === 'retail').reduce((s, r) => s + r.quantity, 0)
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="ຜະລິດ (ຂາຍສົ່ງ)"  value={totalProduced.toLocaleString()}    sub="ຕຸກ"  icon="🏭" color="yellow" />
            <StatCard label="ຜະລິດ (ຮ້ານດາດ)"  value={totalRetail.toLocaleString()}      sub="ໝໍ້"  icon="🏪" color="orange" />
            <StatCard label="ກະຈາຍທັງໝົດ"       value={totalDistributed.toLocaleString()} sub="ຕຸກ"  icon="🚚" color="blue" />
            <StatCard label="ຍອດຂາຍ (ລາຍງານ)"  value={totalSold.toLocaleString()}        sub="ຕຸກ"  icon="🛒" color="green" />
            <StatCard label="Stock ຄ້າງສາງ"     value={totalRemaining.toLocaleString()}   sub="ຕຸກ"  icon="📦" color={totalRemaining < 0 ? 'red' : 'white'} />
          </div>
        </div>

        {pendingOrders > 0 && (
          <div className="card border-yellow-500/40 bg-yellow-900/10 cursor-pointer" onClick={() => setTab('orders')}>
            <p className="text-yellow-400 font-semibold text-sm">🔔 ມີການສັ່ງຈາກ Seller ລໍຖ້າ {pendingOrders} ລາຍການ</p>
            <p className="text-yellow-400/70 underline text-xs mt-1">ກົດເພື່ອກວດ →</p>
          </div>
        )}
        {notifications.filter(n => n.status === 'pending').length > 0 && (
          <div className="card border-blue-500/40 bg-blue-900/10 cursor-pointer" onClick={() => setTab('distrib')}>
            <p className="text-blue-400 font-semibold text-sm">📦 ຄຳສັ່ງ Distributor ລໍຖ້າ {notifications.filter(n => n.status === 'pending').length} ລາຍການ</p>
            <p className="text-blue-400/70 underline text-xs mt-1">ກົດເພື່ອກວດ →</p>
          </div>
        )}

        <div>
          <SectionTitle>💰 ການຊຳລະ</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="ເງິນສົດ" value={cashQty.toLocaleString()}     sub={`${cashDist.length} ລາຍການ`}     icon="💵" color="green" />
            <StatCard label="ໂອນ"     value={transferQty.toLocaleString()} sub={`${transferDist.length} ລາຍການ`} icon="💳" color="blue" />
          </div>
        </div>

        <div>
          <SectionTitle>📦 Stock ສາງ (ຂາຍສົ່ງ — ຮ້ານດາດ ບໍ່ນັບ)</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
    const retailProd    = production.filter(r => r.destination === 'retail')
    const wholesaleProd = production.filter(r => r.destination !== 'retail')

    function groupProdByDate(items) {
      const groups = {}
      items.forEach(r => {
        const key = fmtDate(r.created_at)
        if (!groups[key]) groups[key] = []
        groups[key].push(r)
      })
      return Object.entries(groups)
    }

    function ProdCard({ r }) {
      return (
        <div className="card">
          <div className="flex justify-between items-start gap-2">
            <button onClick={() => openDetail('production', r)} className="flex-1 text-left min-w-0">
              <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
              <p className="text-gray-400 text-xs">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
              <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
              {r.image_url && <p className="text-brand-yellow text-xs mt-0.5 flex items-center gap-1"><Image size={10} />ມີຮູບ</p>}
            </button>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <p className="text-brand-yellow font-bold text-lg">
                {r.quantity}
                <span className="text-xs font-normal text-gray-400 ml-1">
                  {r.destination === 'retail' ? 'ໝໍ້' : 'ຕຸກ'}
                </span>
              </p>
              <PaidBtn type="production" id={r.id} isPaid={r.is_paid} />
              <ChevronRight size={15} className="text-gray-500" />
            </div>
          </div>
        </div>
      )
    }

    function ProdSection({ items, label, color }) {
      if (items.length === 0) return <Empty icon="🏭" message={`ຍັງບໍ່ມີ ${label}`} />
      const grouped = groupProdByDate(items)
      return (
        <div className="space-y-4">
          {grouped.map(([dateLabel, recs]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px flex-1 bg-dark-500" />
                <span className="text-gray-500 text-xs font-medium px-2">📅 {dateLabel}</span>
                <div className="h-px flex-1 bg-dark-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {recs.map(r => <ProdCard key={r.id} r={r} />)}
              </div>
            </div>
          ))}
        </div>
      )
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><Factory size={18} className="text-brand-yellow" />ການຜະລິດ ({production.length})</SectionTitle>
          <ResetBtn type="production" label="ການຜະລິດ" />
        </div>

        {production.length === 0 ? <Empty icon="🏭" /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column 1: ຂາຍສົ່ງ */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-blue-400/20">
                <span className="text-blue-400 font-bold text-sm">🚚 ຂາຍສົ່ງ</span>
                <span className="text-xs text-gray-500">({wholesaleProd.length} ລາຍການ · ຕຸກ)</span>
              </div>
              <ProdSection items={wholesaleProd} label="ຂາຍສົ່ງ" color="blue" />
            </div>

            {/* Column 2: ຮ້ານດາດ */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-green-400/20">
                <span className="text-green-400 font-bold text-sm">🏪 ຮ້ານດາດ</span>
                <span className="text-xs text-gray-500">({retailProd.length} ລາຍການ · ໝໍ້)</span>
              </div>
              <ProdSection items={retailProd} label="ຮ້ານດາດ" color="green" />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Distribution + Orders (merged) ──────────────────────────────
  // ─── Archive: ສົ່ງສຳເລັດ (delivered notifications) ──────────────────────
  function renderAdminDeliveredArchive() {
    const deliveredNotifs = notifications.filter(n => n.status === 'delivered')
    if (deliveredNotifs.length === 0) return <p className="text-gray-500 text-sm text-center py-8">ຍັງບໍ່ມີລາຍການ</p>
    // Group by date
    const grouped = {}
    deliveredNotifs.forEach(n => {
      const d = n.acknowledged_at || n.created_at
      const dateLabel = new Date(d).toLocaleDateString('lo-LA', { day: 'numeric', month: 'short', year: 'numeric' })
      if (!grouped[dateLabel]) grouped[dateLabel] = []
      grouped[dateLabel].push(n)
    })
    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([dateLabel, items]) => (
          <div key={dateLabel}>
            <p className="text-gray-500 text-xs font-semibold mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
              {dateLabel}
            </p>
            <div className="space-y-2">
              {items.map(n => {
                const distName = n.assigned_to
                  ? (users.find(u => u.id === n.assigned_to)?.name || n.assigned_to.slice(0,6))
                  : 'Broadcast'
                const totalQty = Array.isArray(n.items) ? n.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0
                return (
                  <div key={n.id} className="bg-dark-700 rounded-xl px-3 py-2.5 border border-dark-500">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-semibold truncate">{n.store_name || '—'}</p>
                        <p className="text-gray-500 text-xs">🚚 {distName}</p>
                        {Array.isArray(n.items) && n.items.length > 0 && (
                          <p className="text-gray-400 text-xs mt-0.5">
                            {n.items.map(i => `${i.product_name} ×${i.quantity}`).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-green-400 text-xs font-bold">{totalQty} ຕຸກ</span>
                        <p className="text-gray-600 text-[10px] mt-0.5">
                          {n.acknowledged_at ? new Date(n.acknowledged_at).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
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

  // ─── Archive: ຈ່າຍຄ່າສົ່ງ (paid delivery fees) ────────────────────────
  function renderAdminPaidFeesArchive() {
    const paidRecords = distrib.filter(r => r.delivery_fee_paid && (r.delivery_fee || 0) > 0)
    if (paidRecords.length === 0) return <p className="text-gray-500 text-sm text-center py-8">ຍັງບໍ່ມີລາຍການ</p>
    // Group by store
    const byStore = {}
    paidRecords.forEach(r => {
      const key = r.store_name || 'ບໍ່ລະບຸ'
      if (!byStore[key]) byStore[key] = { records: [], total: 0 }
      byStore[key].records.push(r)
      byStore[key].total += r.delivery_fee || 0
    })
    return (
      <div className="space-y-4">
        {Object.entries(byStore).map(([storeName, { records, total }]) => (
          <div key={storeName}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-white text-xs font-semibold flex items-center gap-1.5">
                <Store size={12} className="text-brand-yellow" /> {storeName}
              </p>
              <span className="text-green-400 text-xs font-bold">{total.toLocaleString('lo-LA')} ₭</span>
            </div>
            <div className="space-y-1.5">
              {records.map(r => {
                const distribUser = users.find(u => u.id === r.created_by)
                return (
                  <div key={r.id} className="bg-dark-700 rounded-xl px-3 py-2 border border-green-900/30 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString('lo-LA', { day: 'numeric', month: 'short' })}</p>
                      {distribUser && <p className="text-gray-500 text-xs">🚚 {distribUser.name}</p>}
                    </div>
                    <span className="text-green-400 text-xs font-semibold shrink-0">{(r.delivery_fee || 0).toLocaleString('lo-LA')} ₭ ✅</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderDistrib() {

    // ── Helper: group array by date string ──
    function groupByDate(items) {
      const groups = {}
      items.forEach(item => {
        const key = fmtDate(item.created_at)
        if (!groups[key]) groups[key] = []
        groups[key].push(item)
      })
      return Object.entries(groups)
    }

    // ── Notification card ──
    function NotifCard({ n }) {
      const isSeller = n.message?.includes('Seller')
      const sc = {
        pending:      { label: '⏳ ລໍຖ້າ',    cls: 'text-yellow-400 bg-yellow-900/20 border-yellow-400/30', border: 'border-yellow-400/20 bg-yellow-900/5', dot: 'bg-yellow-400 animate-pulse' },
        acknowledged: { label: '✅ ຮັບແລ້ວ',  cls: 'text-blue-400 bg-blue-900/20 border-blue-400/30',     border: 'border-blue-400/20 bg-blue-900/5',     dot: 'bg-blue-400' },
        delivered:    { label: '📦 ສົ່ງແລ້ວ',  cls: 'text-green-400 bg-green-900/20 border-green-400/30',  border: '',                                     dot: 'bg-green-400' },
      }[n.status] || { label: '⏳', cls: '', border: '', dot: 'bg-gray-400' }

      return (
        <div className={`card ${sc.border} ${n.status === 'delivered' ? 'opacity-60' : ''}`}>
          {/* Card header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                <p className="text-white font-bold text-base leading-tight">{n.store_name || '—'}</p>
                {isSeller && (
                  <span className="text-purple-400 text-xs bg-purple-900/30 border border-purple-400/30 px-1.5 py-0.5 rounded-full">📋 Seller</span>
                )}
              </div>
              {n.items?.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {n.items.map((item, idx) => (
                    <p key={idx} className="text-gray-400 text-xs flex items-center gap-1.5 flex-wrap">
                      <Package size={10} className="shrink-0" />
                      <span>{item.product_name} ×{item.quantity}</span>
                      {item.is_promotion && (
                        <span className="text-orange-400 bg-orange-900/30 border border-orange-400/30 text-xs px-1.5 py-0.5 rounded-full">🎁 Promo</span>
                      )}
                      {item.unit_price > 0 && (
                        <span className="text-green-400">{Number(item.unit_price).toLocaleString()} ₭</span>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-gray-500 text-xs mt-1.5">
                {n.assigned_to
                  ? `➜ ${users.find(u => u.id === n.assigned_to)?.name || 'Distributor'}`
                  : '➜ ທຸກ Distributor'
                } · {fmtDateTime(n.created_at)}
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${sc.cls}`}>{sc.label}</span>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-1.5 pt-2.5 border-t border-dark-500 flex-wrap">
            <button onClick={() => openEditNotif(n)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-dark-600 text-gray-300 border border-dark-400 hover:text-brand-yellow hover:border-brand-yellow/40 transition-colors">
              <Pencil size={11} />ແກ້ໄຂ
            </button>
            {n.status !== 'pending' && (
              <button onClick={() => resetNotifStatus(n.id)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-dark-600 text-gray-400 border border-dark-400 hover:text-yellow-400 hover:border-yellow-400/40 transition-colors">
                <RotateCcw size={11} />Reset
              </button>
            )}
            <button onClick={() => handlePrintNotifInvoice(n)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-dark-600 text-gray-400 border border-dark-400 hover:text-white hover:bg-dark-500 transition-colors">
              <Printer size={11} />Invoice
            </button>
            <button onClick={() => setCancelNotifConfirm(n)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-dark-600 text-red-400 border border-red-400/30 hover:bg-red-900/20 transition-colors ml-auto">
              <XCircle size={11} />ຍົກເລີກ
            </button>
          </div>
        </div>
      )
    }

    // ── Distrib record card ──
    const storeOptions = [...new Set(distrib.map(r => r.store_name).filter(Boolean))].sort()
    const hasFilter = distribFilter.store || distribFilter.payMethod || distribFilter.isPaid || distribFilter.dateFrom || distribFilter.dateTo
    const filtered = distrib.filter(r => {
      if (distribFilter.store     && r.store_name      !== distribFilter.store)     return false
      if (distribFilter.payMethod && r.payment_method  !== distribFilter.payMethod) return false
      if (distribFilter.isPaid === 'paid'   && !r.is_paid) return false
      if (distribFilter.isPaid === 'unpaid' &&  r.is_paid) return false
      if (distribFilter.dateFrom && new Date(r.created_at) < new Date(distribFilter.dateFrom)) return false
      if (distribFilter.dateTo   && new Date(r.created_at) > new Date(distribFilter.dateTo + 'T23:59:59')) return false
      return true
    })
    const unpaid = filtered.filter(r => !r.is_paid)
    const paid   = filtered.filter(r =>  r.is_paid)

    function DistribCard({ r }) {
      return (
        <div className="card hover:border-dark-400 transition-colors">
          <div className="flex justify-between items-start gap-2">
            <button onClick={() => openDetail('distrib', r)} className="flex-1 text-left min-w-0">
              <p className="text-white font-bold text-base leading-tight">{r.store_name || '—'}</p>
              <p className="text-brand-yellow font-semibold text-sm mt-0.5">
                {r.products?.type} {r.products?.size} × {r.quantity} ຕຸກ
              </p>
              <p className="text-gray-400 text-xs mt-1">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
              <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
              {(r.bill_image_url || r.slip_image_url || r.delivery_image_url) && (
                <p className="text-brand-yellow text-xs mt-0.5 flex items-center gap-1"><Image size={10} />ມີຮູບ</p>
              )}
            </button>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded-full ${r.payment_method === 'cash' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}`}>
                {r.payment_method === 'cash' ? '💵 ສົດ' : '💳 ໂອນ'}
              </span>
              <PaidBtn type="distrib" id={r.id} isPaid={r.is_paid} />
              <button
                onClick={e => { e.stopPropagation(); setDeleteSingleDistrib(r) }}
                className="text-xs px-2 py-0.5 rounded-lg bg-dark-700 text-red-400 border border-red-400/20 hover:bg-red-900/20 transition-colors"
              >
                🗑 ລຶບ
              </button>
            </div>
          </div>
        </div>
      )
    }

    // ── Seller order card ──
    function OrderCard({ o }) {
      const seller = users.find(u => u.id === o.created_by)
      return (
        <div className="card">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-tight">{seller?.store_name || seller?.name || 'Unknown'}</p>
              <p className="text-brand-yellow font-semibold text-sm mt-0.5">{o.products?.type} {o.products?.size} × {o.quantity} ຕຸກ</p>
              <p className="text-gray-400 text-xs mt-1">👤 {seller?.name || 'Unknown'}</p>
              <p className="text-gray-500 text-xs">{fmtDateTime(o.created_at)}</p>
              {o.notes && <p className="text-gray-500 text-xs mt-0.5">📝 {o.notes}</p>}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS[o.status]?.color}`}>
                {ORDER_STATUS[o.status]?.label}
              </span>
            </div>
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-dark-500">
            {o.status === 'pending' && (
              <button onClick={() => updateOrderStatus(o.id, 'confirmed')}
                className="flex-1 text-xs py-2 rounded-lg bg-blue-900/30 text-blue-400 border border-blue-400/30 hover:bg-blue-900/50 transition-colors">
                ✅ ຢືນຢັນ + ສ້າງຄຳສັ່ງ Distributor
              </button>
            )}
            {o.status === 'confirmed' && (
              <button onClick={() => updateOrderStatus(o.id, 'delivered')}
                className="flex-1 text-xs py-2 rounded-lg bg-green-900/30 text-green-400 border border-green-400/30 hover:bg-green-900/50 transition-colors">
                📦 ສົ່ງແລ້ວ
              </button>
            )}
            {o.status !== 'pending' && (
              <button onClick={() => updateOrderStatus(o.id, 'pending')}
                className="text-xs py-2 px-3 rounded-lg bg-dark-700 text-gray-400 hover:bg-dark-600 transition-colors">
                ↩ Reset
              </button>
            )}
          </div>
        </div>
      )
    }

    // ── Grouped notifications ──
    const activeNotifs    = notifications.filter(n => n.status !== 'delivered')
    const deliveredNotifs = notifications.filter(n => n.status === 'delivered')
    const groupedActive   = groupByDate(activeNotifs)
    const groupedDelivered = groupByDate(deliveredNotifs.slice(0, 15))

    // ── Grouped orders ──
    const byStatus = {
      pending:   orders.filter(o => o.status === 'pending'),
      confirmed: orders.filter(o => o.status === 'confirmed'),
      delivered: orders.filter(o => o.status === 'delivered'),
    }

    return (
      <div className="space-y-8">

        {/* ════ SECTION A: Distributor Orders (Notifications) ════ */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <SectionTitle>
              <Bell size={18} className="text-brand-yellow" />
              ຄຳສັ່ງ Distributor
              {activeNotifs.length > 0 && (
                <span className="bg-brand-yellow text-dark-900 text-xs font-bold px-2 py-0.5 rounded-full ml-1">{activeNotifs.length}</span>
              )}
            </SectionTitle>
            <div className="flex items-center gap-2">
              {activeNotifs.length > 0 && (
                <button
                  onClick={() => setCancelAllNotifConfirm(true)}
                  className="flex items-center gap-1 text-xs text-red-400 border border-red-400/30 px-3 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                >
                  <XCircle size={12} /> ຍົກເລີກທັງໝົດ
                </button>
              )}
              <button onClick={() => setShowNotifForm(true)} className="btn-primary px-3 py-2 text-sm flex items-center gap-1.5">
                <Plus size={15} />ສ້າງຄຳສັ່ງ
              </button>
            </div>
          </div>

          {activeNotifs.length === 0 ? (
            <Empty icon="📭" message="ຍັງບໍ່ມີຄຳສັ່ງ — ກົດ ສ້າງຄຳສັ່ງ ດ້ານເທິງ" />
          ) : (
            <div className="space-y-4">
              {/* Active grouped by date */}
              {groupedActive.map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-dark-500" />
                    <span className="text-gray-500 text-xs font-medium px-2">📅 {dateLabel}</span>
                    <div className="h-px flex-1 bg-dark-500" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map(n => <NotifCard key={n.id} n={n} />)}
                  </div>
                </div>
              ))}
              {/* Delivered notifs moved to ຊຳລະແລ້ວ archive — see header button */}
            </div>
          )}
        </div>

        {/* ════ SECTION B: Seller Orders ════ */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>
              <ClipboardList size={18} className="text-brand-yellow" />
              ການສັ່ງ Seller ({orders.length})
              {byStatus.pending.length > 0 && (
                <span className="bg-yellow-500 text-dark-900 text-xs font-bold px-2 py-0.5 rounded-full ml-1">{byStatus.pending.length}</span>
              )}
            </SectionTitle>
            {orders.length > 0 && (
              <button
                onClick={() => setClearOrdersConfirm(true)}
                className="text-xs text-red-400 border border-red-800 rounded-xl px-3 py-1.5 hover:bg-red-900/30 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Trash2 size={13} /> ລຶບທັງໝົດ
              </button>
            )}
          </div>
          <p className="text-gray-500 text-xs mb-3 bg-dark-800 border border-dark-500 rounded-xl px-3 py-2">
            💡 ກົດ <span className="text-blue-400 font-medium">ຢືນຢັນ</span> — ລາຍການຈະຖືກສ້າງເປັນຄຳສັ່ງ Distributor ໂດຍອັດຕະໂນມັດ
          </p>
          {orders.length === 0 ? (
            <Empty icon="📋" message="ຍັງບໍ່ມີການສັ່ງ" />
          ) : (
            <div className="space-y-4">
              {byStatus.pending.length > 0 && (
                <div>
                  <p className="text-yellow-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />ລໍຖ້າ ({byStatus.pending.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{byStatus.pending.map(o => <OrderCard key={o.id} o={o} />)}</div>
                </div>
              )}
              {byStatus.confirmed.length > 0 && (
                <div>
                  <p className="text-blue-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />ຢືນຢັນ ({byStatus.confirmed.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{byStatus.confirmed.map(o => <OrderCard key={o.id} o={o} />)}</div>
                </div>
              )}
              {byStatus.delivered.length > 0 && (
                <div>
                  <p className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />ສົ່ງສຳເລັດ ({byStatus.delivered.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{byStatus.delivered.map(o => <OrderCard key={o.id} o={o} />)}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ════ SECTION C: Distribution Records History ════ */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>
              <Truck size={18} className="text-brand-yellow" />
              ປະຫວັດການກະຈາຍ ({filtered.length}{hasFilter ? ` / ${distrib.length}` : ''})
            </SectionTitle>
            <ResetBtn type="distrib" label="ການກະຈາຍທັງໝົດ" />
          </div>

          {/* Filter bar */}
          <div className="bg-dark-800 border border-dark-500 rounded-2xl p-3 mb-4 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="field-label text-xs">ຮ້ານ</label>
                <select value={distribFilter.store}
                  onChange={e => setDistribFilter(f => ({ ...f, store: e.target.value }))}
                  className="select-field text-sm py-2">
                  <option value="">ທຸກຮ້ານ</option>
                  {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label text-xs">ການຊຳລະ</label>
                <select value={distribFilter.payMethod}
                  onChange={e => setDistribFilter(f => ({ ...f, payMethod: e.target.value }))}
                  className="select-field text-sm py-2">
                  <option value="">ທັງໝົດ</option>
                  <option value="cash">💵 ສົດ</option>
                  <option value="transfer">💳 ໂອນ</option>
                </select>
              </div>
              <div>
                <label className="field-label text-xs">ສະຖານະ</label>
                <select value={distribFilter.isPaid}
                  onChange={e => setDistribFilter(f => ({ ...f, isPaid: e.target.value }))}
                  className="select-field text-sm py-2">
                  <option value="">ທັງໝົດ</option>
                  <option value="unpaid">⏳ ຍັງບໍ່ທັນ</option>
                  <option value="paid">✅ ຊຳລະແລ້ວ</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label text-xs">ຈາກວັນທີ</label>
                <input type="date" value={distribFilter.dateFrom}
                  onChange={e => setDistribFilter(f => ({ ...f, dateFrom: e.target.value }))}
                  className="input-field text-sm py-2" />
              </div>
              <div>
                <label className="field-label text-xs">ຫາວັນທີ</label>
                <input type="date" value={distribFilter.dateTo}
                  onChange={e => setDistribFilter(f => ({ ...f, dateTo: e.target.value }))}
                  className="input-field text-sm py-2" />
              </div>
            </div>
            {hasFilter && (
              <button
                onClick={() => setDistribFilter({ store: '', payMethod: '', isPaid: '', dateFrom: '', dateTo: '' })}
                className="w-full text-xs py-2 rounded-xl bg-dark-700 text-gray-400 border border-dark-500 hover:text-white hover:bg-dark-600 transition-colors">
                ↺ Reset ທຸກ Filter
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <Empty icon="🚚" message={hasFilter ? 'ບໍ່ພົບລາຍການທີ່ກົງກັບ filter' : 'ຍັງບໍ່ມີການກະຈາຍ'} />
          ) : (
            <div className="space-y-5">
              {unpaid.length > 0 && (
                <div>
                  <p className="text-orange-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse inline-block" />
                    ຍັງບໍ່ທັນຊຳລະ ({unpaid.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {unpaid.map(r => <DistribCard key={r.id} r={r} />)}
                  </div>
                </div>
              )}
              {paid.length > 0 && (
                <div>
                  <p className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                    ຊຳລະແລ້ວ ({paid.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {paid.map(r => <DistribCard key={r.id} r={r} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ════ SECTION D: ຄ່າຂົນສົ່ງ ════ */}
        {(() => {
          // Group all distribution records by store, sum delivery_fee
          const feeByStore = {}
          distrib.forEach(r => {
            if (!r.delivery_fee || r.delivery_fee === 0) return
            const key = r.store_name || 'ບໍ່ລະບຸ'
            if (!feeByStore[key]) feeByStore[key] = { records: [], totalFee: 0 }
            feeByStore[key].records.push(r)
            feeByStore[key].totalFee += r.delivery_fee || 0
          })
          const storeEntries = Object.entries(feeByStore)
            .sort((a, b) => b[1].totalFee - a[1].totalFee)
          const grandTotal = storeEntries.reduce((s, [, v]) => s + v.totalFee, 0)
          if (storeEntries.length === 0) return null
          return (
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle>
                  <Truck size={18} className="text-brand-yellow" />
                  ຄ່າຂົນສົ່ງ ({storeEntries.length} ຮ້ານ)
                </SectionTitle>
                <span className="text-brand-yellow font-bold text-sm">
                  ລວມ: {grandTotal.toLocaleString('lo-LA')} ₭
                </span>
              </div>
              {distrib.some(r => (r.delivery_fee || 0) > 0 && !r.delivery_fee_paid) && (
                <button
                  onClick={markAllDeliveryFeesPaidAdmin}
                  className="w-full py-2 rounded-xl bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/30 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-brand-yellow/20 transition-colors mb-3"
                >
                  💰 ຈ່າຍຄ່າຂົນສົ່ງທັງໝົດ
                </button>
              )}
              <div className="space-y-3">
                {storeEntries.map(([storeName, { records, totalFee }]) => {
                  const paidFee   = records.filter(r => r.delivery_fee_paid).reduce((s, r) => s + (r.delivery_fee || 0), 0)
                  const unpaidFee = totalFee - paidFee
                  // Deduplicate by notification_id (each delivery batch)
                  const byNotif = {}
                  records.forEach(r => {
                    const k = r.notification_id || r.id
                    if (!byNotif[k]) byNotif[k] = { id: r.id, notifId: k, fee: 0, paid: r.delivery_fee_paid, date: r.created_at, storeName: r.store_name, distribName: r.created_by }
                    byNotif[k].fee = Math.max(byNotif[k].fee, r.delivery_fee || 0)
                    if (r.delivery_fee_paid) byNotif[k].paid = true
                  })
                  const batches = Object.values(byNotif).sort((a, b) => new Date(b.date) - new Date(a.date))
                  return (
                    <div key={storeName} className="card border-dark-400">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-white font-semibold flex items-center gap-2">
                          <Store size={14} className="text-brand-yellow" />
                          {storeName}
                        </p>
                        <div className="flex items-center gap-2">
                          {unpaidFee > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/30 text-orange-400 border border-orange-700/30">
                              ⏳ ຄ້າງ {unpaidFee.toLocaleString('lo-LA')} ₭
                            </span>
                          )}
                          {paidFee > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-700/30">
                              ✅ {paidFee.toLocaleString('lo-LA')} ₭
                            </span>
                          )}
                          <span className="text-brand-yellow font-bold text-sm">{totalFee.toLocaleString('lo-LA')} ₭</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {batches.map(b => {
                          const distribUser = users.find(u => u.id === b.distribName)
                          return (
                            <div key={b.notifId} className={`flex items-center justify-between rounded-xl px-3 py-2 ${b.paid ? 'bg-green-900/10' : 'bg-dark-600'}`}>
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-300 text-xs">{fmtDateTime(b.date)}</p>
                                {distribUser && <p className="text-gray-500 text-xs">🚚 {distribUser.name}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-sm font-semibold ${b.paid ? 'text-green-400' : 'text-white'}`}>{b.fee.toLocaleString('lo-LA')} ₭</span>
                                <button
                                  type="button"
                                  onClick={() => toggleDeliveryFeePaid(b.id, b.paid)}
                                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all active:scale-95 ${
                                    b.paid
                                      ? 'bg-green-700/60 text-green-300 border border-green-600/40 hover:bg-green-700/80'
                                      : 'bg-dark-500 text-gray-400 border border-dark-300 hover:bg-dark-400'
                                  }`}
                                >
                                  {b.paid ? '✅ ຈ່າຍແລ້ວ' : '⬜ ຄ້າງ'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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

  // renderOrders removed — merged into renderDistrib() as Section B

  // ─── Tab: Materials (Admin overview of cashier stock) ─────────────────
  function renderMaterials() {
    const totalMats   = rawMaterials.length
    const totalValue  = rawMaterials.reduce((s, m) => s + (m.quantity_in_stock || 0) * (m.unit_cost || 0), 0)
    const lowStockMats = rawMaterials.filter(m => m.quantity_in_stock < 5)
    const recentBatches = matUsage.slice(0, 10)

    // Group materials by category
    const grouped = {}
    rawMaterials.forEach(m => {
      const cat = m.material_categories?.name || 'ທົ່ວໄປ'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(m)
    })

    return (
      <div className="space-y-6">
        {/* Summary */}
        <div>
          <SectionTitle><Boxes size={18} className="text-brand-yellow" />ສາງວັດຖຸດິບ (ຂໍ້ມູນ Cashier)</SectionTitle>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard label="ວັດຖຸດິບທັງໝົດ" value={totalMats} sub="ລາຍການ" icon="🧪" color="yellow" />
            <StatCard label="ມູນຄ່ານາງ" value={totalValue > 0 ? Math.round(totalValue / 1000) + 'K' : '—'} sub="₭ (ປະຕິ)" icon="💰" color="green" />
          </div>
          {lowStockMats.length > 0 && (
            <div className="bg-orange-900/20 border border-orange-400/30 rounded-xl px-3 py-2.5 mb-4">
              <p className="text-orange-400 font-semibold text-xs mb-1.5">⚠️ ວັດຖຸດິບໃກ້ໝົດ ({lowStockMats.length} ລາຍການ)</p>
              <div className="space-y-0.5">
                {lowStockMats.map(m => (
                  <p key={m.id} className="text-orange-300 text-xs">• {m.name} — ຍັງເຫລືອ {m.quantity_in_stock} {m.unit}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Per-category materials */}
        {Object.keys(grouped).length === 0 ? (
          <Empty icon="🧪" message="ຍັງບໍ່ມີວັດຖຸດິບ — ເພີ່ມໂດຍ Cashier" />
        ) : (
          Object.entries(grouped).map(([cat, mats]) => (
            <div key={cat}>
              <p className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wide">{cat}</p>
              <div className="space-y-2">
                {mats.map(m => {
                  const value = (m.quantity_in_stock || 0) * (m.unit_cost || 0)
                  const isLow = m.quantity_in_stock < 5
                  return (
                    <div key={m.id} className={`card ${isLow ? 'border-orange-400/30' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm ${isLow ? 'text-orange-300' : 'text-white'}`}>{m.name}</p>
                          <p className="text-gray-500 text-xs">
                            ລາຄາ/ຫົວໜ່ວຍ: {Number(m.unit_cost || 0).toLocaleString('lo-LA')} ₭/{m.unit}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-bold text-lg ${isLow ? 'text-orange-400' : 'text-brand-yellow'}`}>
                            {m.quantity_in_stock} <span className="text-xs font-normal text-gray-400">{m.unit}</span>
                          </p>
                          {value > 0 && <p className="text-green-400 text-xs">{value.toLocaleString('lo-LA')} ₭</p>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

        {/* Recent production batches */}
        {recentBatches.length > 0 && (
          <div>
            <SectionTitle>🍲 ຫມໍ້ຜະລິດລ່າສຸດ</SectionTitle>
            <div className="space-y-2">
              {recentBatches.map(b => (
                <div key={b.id} className="card">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">{b.batch_name}</p>
                      <p className="text-gray-500 text-xs">{fmtDate(b.batch_date)} · {fmtDateTime(b.created_at)}</p>
                      {b.notes && <p className="text-gray-500 text-xs mt-0.5">📝 {b.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {b.total_cost > 0 && (
                        <p className="text-red-400 font-bold text-sm">{Number(b.total_cost).toLocaleString('lo-LA')} ₭</p>
                      )}
                      {Array.isArray(b.items) && b.items.length > 0 && (
                        <p className="text-gray-500 text-xs">{b.items.length} ວັດຖຸ</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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

    return (
      <div className="space-y-6">

        {/* ── Store Management ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle><Store size={18} className="text-brand-yellow" />ຈັດການຮ້ານຄ້າ ({stores.length})</SectionTitle>
            <button onClick={openCreateStore} className="btn-primary px-3 py-2 text-sm">
              <Plus size={15} />ເພີ່ມຮ້ານ
            </button>
          </div>

          {/* Search box */}
          {stores.length > 3 && (
            <div className="relative mb-3">
              <input
                type="search"
                value={storeSearch}
                onChange={e => setStoreSearch(e.target.value)}
                placeholder="🔍 ຄົ້ນຫາຮ້ານ..."
                className="input-field pl-4 text-sm"
              />
            </div>
          )}

          {stores.length === 0 ? (
            <Empty icon="🏪" message="ຍັງບໍ່ມີຮ້ານ — ກົດ ເພີ່ມຮ້ານ ດ້ານເທິງ" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {stores.filter(s => !storeSearch || s.name.toLowerCase().includes(storeSearch.toLowerCase())).map(store => {
                const prices = storePriceMap[store.id] || {}
                return (
                  <div key={store.id} className="card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{store.name}</p>
                        {store.phone && (
                          <a href={`tel:${store.phone}`} className="text-green-400 text-xs flex items-center gap-1 mt-0.5 hover:text-green-300">
                            📞 {store.phone}
                          </a>
                        )}
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
                        {/* QR badge */}
                        {store.qr_code_url ? (
                          <span className="text-xs text-brand-yellow mt-1 flex items-center gap-1">
                            <Package size={10} />ມີ QR ຊຳລະ
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                            <Package size={10} />QR ສ່ວນກາງ
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {/* Mini QR preview */}
                        <img
                          src={store.qr_code_url || '/qr-payment.jpg'}
                          alt="QR"
                          className="w-12 h-12 rounded-lg border border-dark-400 object-contain bg-white"
                          onError={e => { e.target.style.display = 'none' }}
                        />
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditStore(store)} className="p-1.5 text-gray-400 hover:text-brand-yellow">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteStoreConfirm(store)} className="p-1.5 text-gray-400 hover:text-red-400">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Stats header ── */}
        <div>
          <SectionTitle><TrendingUp size={18} className="text-brand-yellow" />ສະຖິຕິການກະຈາຍ</SectionTitle>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="ທຸກຮ້ານລວມ" value={totalQty.toLocaleString()} sub="ຕຸກ" icon="📦" color="yellow" />
          <StatCard label="ຍອດເງິນລວມ" value={hasAmount ? Math.round(totalAmount / 1000) + 'K' : '-'} sub="₭" icon="💰" color="green" />
        </div>

        {/* Per-store stats */}
        {sorted.length === 0 ? <Empty icon="🏪" message="ບໍ່ມີຂໍ້ມູນໃນຊ່ວງທີ່ເລືອກ" /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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

        {/* ── Danger Zone: Reset Everything ── */}
        <div className="card border-red-900/40 bg-red-900/5">
          <p className="text-red-400 font-semibold text-sm flex items-center gap-2 mb-1">⚠️ Danger Zone</p>
          <p className="text-gray-500 text-xs mb-4">Reset ທຸກລາຍການ: ຜະລິດ, ກະຈາຍ, ຂາຍ, ການສັ່ງ, ຄຳສັ່ງ Distributor ທັງໝົດ. ຂໍ້ມູນຈະຖືກລຶບຖາວອນ ແລະ ກູ້ຄືນບໍ່ໄດ້.</p>
          <button
            onClick={() => setResetEverythingConfirm(true)}
            className="w-full py-2.5 rounded-xl bg-red-900/40 text-red-400 border border-red-800 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-red-900/60 transition-colors"
          >
            <RotateCcw size={16} /> Reset ທຸກຢ່າງ (ລຶບຂໍ້ມູນທັງໝົດ)
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
    stores:     renderStores,
    materials:  renderMaterials,
    export:     renderExport,
  }

  // ─── Tab badge helper ─────────────────────────────────────────────────
  function tabBadge(id) {
    if (id === 'distrib') {
      const pending = notifications.filter(n => n.status === 'pending').length + pendingOrders
      if (pending > 0) return pending
    }
    if (id === 'materials') {
      const low = rawMaterials.filter(m => m.quantity_in_stock < 5).length
      if (low > 0) return low
    }
    return null
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900">
      <Header
        title="Admin Dashboard"
        subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ"
        middleActions={(() => {
          const deliveredCount = notifications.filter(n => n.status === 'delivered').length
          const paidFeesCount  = distrib.filter(r => r.delivery_fee_paid && (r.delivery_fee || 0) > 0).length
          const btnBase = 'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors relative'
          return (
            <div className="flex items-center gap-1">
              {/* ສົ່ງສຳເລັດ archive */}
              <button
                onClick={() => setArchivePanel(p => p === 'delivered' ? null : 'delivered')}
                className={`${btnBase} ${archivePanel === 'delivered' ? 'bg-green-700/40 text-green-300 border-green-600/50' : 'bg-dark-700 text-gray-400 border-dark-500 hover:text-green-300 hover:border-green-600/40'}`}
              >
                <CheckCircle size={13} />
                <span className="hidden sm:inline">ຊຳລະແລ້ວ</span>
                {deliveredCount > 0 && (
                  <span className="bg-green-500 text-white text-[9px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-bold">
                    {deliveredCount > 99 ? '99+' : deliveredCount}
                  </span>
                )}
              </button>
              {/* ຄ່າສົ່ງ archive */}
              <button
                onClick={() => setArchivePanel(p => p === 'fees' ? null : 'fees')}
                className={`${btnBase} ${archivePanel === 'fees' ? 'bg-yellow-700/40 text-yellow-300 border-yellow-600/50' : 'bg-dark-700 text-gray-400 border-dark-500 hover:text-yellow-300 hover:border-yellow-600/40'}`}
              >
                <Truck size={13} />
                <span className="hidden sm:inline">ຈ່າຍຄ່າສົ່ງ</span>
                {paidFeesCount > 0 && (
                  <span className="bg-brand-yellow text-dark-900 text-[9px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-bold">
                    {paidFeesCount > 99 ? '99+' : paidFeesCount}
                  </span>
                )}
              </button>
            </div>
          )
        })()}
      />

      {/* ── Desktop Sidebar — lg+ only ─────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:top-[61px] lg:left-0 lg:bottom-0 lg:w-52 lg:z-20 lg:bg-dark-800 lg:border-r lg:border-dark-500">
        <nav className="flex-1 py-2 overflow-y-auto">
          {TABS.map(t => {
            const Icon   = t.icon
            const active = tab === t.id
            const badge  = tabBadge(t.id)
            const badgeColor = t.id === 'materials' ? 'bg-orange-500' : 'bg-red-500'
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left relative ${
                  active
                    ? 'bg-brand-yellow/10 text-brand-yellow border-r-2 border-brand-yellow'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-dark-700'
                }`}>
                <Icon size={17} />
                <span className="flex-1">{t.label}</span>
                {badge && (
                  <span className={`${badgeColor} text-white text-[9px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1`}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Mobile / Tablet Tab Bar — hidden on lg+ ───────────────────── */}
      <div className="sticky top-[61px] z-30 bg-dark-800 border-b border-dark-500 overflow-x-auto lg:hidden">
        <div className="flex min-w-max">
          {TABS.map(t => {
            const Icon   = t.icon
            const active = tab === t.id
            const badge  = tabBadge(t.id)
            const badgeColor = t.id === 'materials' ? 'bg-orange-500' : 'bg-red-500'
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 min-w-[64px] ${
                  active ? 'border-brand-yellow text-brand-yellow' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                <Icon size={18} />
                <span>{t.label}</span>
                {badge && (
                  <span className={`absolute top-1 right-2 ${badgeColor} text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold`}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main content — offset by sidebar on lg+ ───────────────────── */}
      <div className="lg:ml-52">
        <Page>
          {loading ? (
            <div className="flex justify-center py-20"><Spinner size={36} /></div>
          ) : (
            <div className="animate-fade-in">{tabContent[tab]?.()}</div>
          )}
        </Page>
      </div>

      {/* ── Archive Drawer ──────────────────────────────────────────────── */}
      {archivePanel && (
        <div className="fixed inset-0 z-50" onClick={() => setArchivePanel(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="absolute inset-x-0 bottom-0 md:inset-y-0 md:right-0 md:left-auto md:w-[400px] bg-dark-800 rounded-t-3xl md:rounded-none flex flex-col border-t border-dark-500 md:border-t-0 md:border-l"
            style={{ maxHeight: '85dvh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle — mobile */}
            <div className="md:hidden w-10 h-1 bg-dark-400 rounded-full mx-auto mt-3 shrink-0" />
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-500 shrink-0">
              <div className="flex items-center gap-2">
                {archivePanel === 'delivered' && <><CheckCircle size={16} className="text-green-400" /><span className="text-white font-bold text-sm">ສົ່ງສຳເລັດ ({notifications.filter(n => n.status === 'delivered').length})</span></>}
                {archivePanel === 'fees'      && <><Truck size={16} className="text-brand-yellow" /><span className="text-white font-bold text-sm">ຈ່າຍຄ່າສົ່ງ ({distrib.filter(r => r.delivery_fee_paid && (r.delivery_fee || 0) > 0).length})</span></>}
              </div>
              <button onClick={() => setArchivePanel(null)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-dark-600">✕</button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {archivePanel === 'delivered' && renderAdminDeliveredArchive()}
              {archivePanel === 'fees'      && renderAdminPaidFeesArchive()}
            </div>
          </div>
        </div>
      )}

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
              📞 ເບີໂທຮ້ານ (ທາງເລືອກ)
            </label>
            <input
              type="tel"
              value={storeForm.phone}
              onChange={e => setStoreForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="020 XXXX XXXX"
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

          {/* QR code URL for payment */}
          <div>
            <label className="field-label flex items-center gap-1.5">
              <Package size={13} className="text-brand-yellow" /> QR Code ຊຳລະເງິນ (URL ຮູບ)
            </label>
            <input
              type="text"
              value={storeForm.qr_code_url}
              onChange={e => setStoreForm(f => ({ ...f, qr_code_url: e.target.value }))}
              placeholder="/qr-payment.jpg  ຫລື  https://..."
              className="input-field text-sm"
            />
            <p className="text-gray-500 text-xs mt-1">ປ່ອຍວ່າງ = ໃຊ້ QR ສ່ວນກາງ (/qr-payment.jpg)</p>
            {storeForm.qr_code_url && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={storeForm.qr_code_url}
                  alt="QR Preview"
                  className="w-16 h-16 rounded-lg border border-dark-400 object-contain bg-white"
                  onError={e => { e.target.style.display = 'none' }}
                />
                <span className="text-gray-500 text-xs">Preview QR</span>
              </div>
            )}
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

          {/* Items (qty / price / promo per product) */}
          {notifForm.items.length > 0 && (
            <div className="space-y-2">
              <label className="field-label flex items-center gap-1.5">
                <Package size={13} className="text-brand-yellow" /> ລາຍການສິນຄ້າ
              </label>
              {/* Header row */}
              <div className="grid grid-cols-[1fr_64px_80px_auto] gap-2 px-3 py-1 text-xs text-gray-500 font-medium">
                <span>ສິນຄ້າ</span>
                <span className="text-right">ຈຳນວນ</span>
                <span className="text-right">ລາຄາ ₭</span>
                <span className="text-center">Promo</span>
              </div>
              {notifForm.items.map((item, i) => (
                <div key={i} className={`grid grid-cols-[1fr_64px_80px_auto] items-center gap-2 rounded-xl px-3 py-2 border ${item.is_promotion ? 'bg-orange-900/10 border-orange-400/30' : 'bg-dark-700 border-dark-500'}`}>
                  <span className="text-gray-300 text-sm truncate">{item.product_name}</span>
                  <input
                    type="number" inputMode="numeric" min="0"
                    value={item.quantity}
                    onChange={e => updateNotifItem(i, 'quantity', e.target.value)}
                    placeholder="0"
                    className="w-full bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-brand-yellow font-bold text-sm text-right"
                  />
                  <input
                    type="number" inputMode="decimal" min="0" step="100"
                    value={item.unit_price}
                    onChange={e => updateNotifItem(i, 'unit_price', e.target.value)}
                    placeholder="0"
                    className="w-full bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-green-400 text-sm text-right"
                  />
                  <label className="flex flex-col items-center gap-0.5 cursor-pointer" title="Promotion">
                    <input
                      type="checkbox"
                      checked={!!item.is_promotion}
                      onChange={e => updateNotifItem(i, 'is_promotion', e.target.checked)}
                      className="w-4 h-4 accent-orange-400 cursor-pointer"
                    />
                    <span className="text-[9px] text-orange-400">🎁</span>
                  </label>
                </div>
              ))}
              <p className="text-gray-600 text-xs">* ຕິກ 🎁 ສຳລັບລາຍການ Promotion</p>
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

      {/* ── Delete Single Distrib Record ────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteSingleDistrib}
        onClose={() => setDeleteSingleDistrib(null)}
        onConfirm={() => deleteDistribRecord(deleteSingleDistrib?.id)}
        title="🗑 ລຶບລາຍການກະຈາຍ"
        message={`ລຶບລາຍການ "${deleteSingleDistrib?.store_name || '—'}" ຈຳນວນ ${deleteSingleDistrib?.quantity || 0} ຕຸກ?\n\nຂໍ້ມູນຈະຖືກລຶບຖາວອນ.`}
        confirmLabel="ລຶບ"
        danger
      />

      {/* ── Cancel Notification Confirm ──────────────────────────────────── */}
      <ConfirmDialog
        open={!!cancelNotifConfirm}
        onClose={() => setCancelNotifConfirm(null)}
        onConfirm={() => cancelNotif(cancelNotifConfirm?.id)}
        title="ຍົກເລີກຄຳສັ່ງ"
        message={`ຍົກເລີກຄຳສັ່ງ "${cancelNotifConfirm?.store_name || '—'}" ແທ້ບໍ?\nຄຳສັ່ງຈະຖືກລຶບຖາວອນ.`}
        confirmLabel="ຍົກເລີກຄຳສັ່ງ"
        danger
      />

      {/* ── Cancel ALL Notifications Confirm ─────────────────────────────── */}
      <ConfirmDialog
        open={cancelAllNotifConfirm}
        onClose={() => setCancelAllNotifConfirm(false)}
        onConfirm={cancelAllNotifs}
        title="⚠️ ຍົກເລີກຄຳສັ່ງທັງໝົດ"
        message={`ທ່ານຕ້ອງການຍົກເລີກ ${notifications.filter(n => n.status !== 'delivered').length} ຄຳສັ່ງທີ່ຍັງຄ້າງຢູ່ທັງໝົດ ແທ້ບໍ?\n\nຄຳສັ່ງທີ່ ສົ່ງສຳເລັດ (delivered) ຈະບໍ່ຖືກລຶບ.`}
        confirmLabel="ຍົກເລີກທັງໝົດ"
        danger
      />

      {/* ── Clear All Seller Orders Confirm ──────────────────────────────── */}
      <ConfirmDialog
        open={clearOrdersConfirm}
        onClose={() => setClearOrdersConfirm(false)}
        onConfirm={clearAllOrders}
        title="⚠️ ລຶບລາຍການສັ່ງທັງໝົດ"
        message={`ທ່ານຕ້ອງການລຶບລາຍການສັ່ງຈາກ Seller ທັງໝົດ (${orders.length} ລາຍການ) ແທ້ບໍ?\n\nຂໍ້ມູນທັງໝົດຈະຖືກລຶບຖາວອນ ແລະ ກູ້ຄືນບໍ່ໄດ້.`}
        confirmLabel="ລຶບທັງໝົດ"
        danger
      />

      {/* ── Reset Everything Confirm ──────────────────────────────────────── */}
      <ConfirmDialog
        open={resetEverythingConfirm}
        onClose={() => setResetEverythingConfirm(false)}
        onConfirm={resetEverything}
        title="☢️ Reset ທຸກຢ່າງ"
        message="ທ່ານຕ້ອງການລຶບຂໍ້ມູນທຸກຢ່າງທັງໝົດ ແທ້ບໍ?\n\n🗑 ລາຍການຜະລິດ\n🗑 ລາຍການກະຈາຍ\n🗑 ລາຍການຂາຍ\n🗑 ການສັ່ງ Seller\n🗑 ຄຳສັ່ງ Distributor\n\nຂໍ້ມູນທັງໝົດຈະຖືກລຶບຖາວອນ ແລະ ກູ້ຄືນບໍ່ໄດ້!"
        confirmLabel="Reset ທຸກຢ່າງ"
        danger
      />

      {/* ── Edit Notification Modal ───────────────────────────────────────── */}
      <Modal open={showEditNotifForm} onClose={() => { setShowEditNotifForm(false); setEditNotif(null) }} title="✏️ ແກ້ໄຂຄຳສັ່ງ Distributor">
        <div className="space-y-4">
          {/* Store info (read-only) */}
          {editNotif && (
            <div className="bg-dark-700 rounded-xl px-3 py-2">
              <p className="text-gray-400 text-xs">ຮ້ານ</p>
              <p className="text-white font-bold text-lg">{editNotif.store_name || '—'}</p>
              <p className="text-gray-500 text-xs">{editNotif.message?.includes('Seller') ? '📋 ຈາກ Seller' : '📦 ຄຳສັ່ງ Admin'}</p>
            </div>
          )}

          {/* Items edit */}
          {notifEditForm.items.length > 0 && (
            <div className="space-y-2">
              <label className="field-label flex items-center gap-1.5">
                <Package size={13} className="text-brand-yellow" />ລາຍການສິນຄ້າ
              </label>
              <div className="grid grid-cols-[1fr_64px_80px_auto] gap-2 px-3 py-1 text-xs text-gray-500 font-medium">
                <span>ສິນຄ້າ</span><span className="text-right">ຈຳນວນ</span><span className="text-right">ລາຄາ ₭</span><span className="text-center">Promo</span>
              </div>
              {notifEditForm.items.map((item, i) => (
                <div key={i} className={`grid grid-cols-[1fr_64px_80px_auto] items-center gap-2 rounded-xl px-3 py-2 border ${item.is_promotion ? 'bg-orange-900/10 border-orange-400/30' : 'bg-dark-700 border-dark-500'}`}>
                  <span className="text-gray-300 text-sm truncate">{item.product_name}</span>
                  <input type="number" inputMode="numeric" min="0"
                    value={item.quantity}
                    onChange={e => updateEditNotifItem(i, 'quantity', e.target.value)}
                    className="w-full bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-brand-yellow font-bold text-sm text-right"
                  />
                  <input type="number" inputMode="decimal" min="0" step="100"
                    value={item.unit_price}
                    onChange={e => updateEditNotifItem(i, 'unit_price', e.target.value)}
                    className="w-full bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-green-400 text-sm text-right"
                  />
                  <label className="flex flex-col items-center gap-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!item.is_promotion}
                      onChange={e => updateEditNotifItem(i, 'is_promotion', e.target.checked)}
                      className="w-4 h-4 accent-orange-400 cursor-pointer"
                    />
                    <span className="text-[9px] text-orange-400">🎁</span>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Message */}
          <div>
            <label className="field-label">ໝາຍເຫດ</label>
            <textarea
              value={notifEditForm.message}
              onChange={e => setNotifEditForm(f => ({ ...f, message: e.target.value }))}
              rows={2}
              className="input-field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={() => { setShowEditNotifForm(false); setEditNotif(null) }} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={saveEditNotif} disabled={savingEditNotif} className="btn-primary">
              {savingEditNotif ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
        </div>
      </Modal>

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
              {/* Store name header — distrib only */}
              {detail.type === 'distrib' && (
                <div className="text-center py-2 border-b border-dark-500">
                  <p className="text-gray-400 text-xs mb-0.5">ຮ້ານ</p>
                  <p className="text-white font-bold text-2xl leading-tight">{r.store_name || '—'}</p>
                </div>
              )}
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
                      <span className="text-white text-sm font-medium">
                    {r.quantity ?? '-'} {detail.type === 'production' && r.destination === 'retail' ? 'ໝໍ້' : 'ຕຸກ'}
                  </span>
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
