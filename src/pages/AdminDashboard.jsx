import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { exportAllReports } from '../lib/excel'
import {
  Header, Page, StatCard, SectionTitle, Modal, ConfirmDialog, Empty, Spinner, ROLE_LABELS
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import {
  LayoutDashboard, Users, Factory, Truck, ShoppingBag, Download,
  Plus, Pencil, Trash2, Eye, EyeOff, RefreshCw, Store, ChevronDown
} from 'lucide-react'

// ─── Tab definitions ──────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard', label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'users',     label: 'Users',       icon: Users },
  { id: 'production',label: 'ຜະລິດ',       icon: Factory },
  { id: 'distrib',   label: 'ກະຈາຍ',       icon: Truck },
  { id: 'sales',     label: 'ຂາຍ',         icon: ShoppingBag },
  { id: 'export',    label: 'Export',      icon: Download },
]

// ─── Main Admin component ─────────────────────────────────────────────────
function Inner() {
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab]               = useState('dashboard')
  const [loading, setLoading]       = useState(true)
  const [exporting, setExporting]   = useState(false)

  // Data
  const [products, setProducts]     = useState([])
  const [users, setUsers]           = useState([])
  const [production, setProduction] = useState([])
  const [distrib, setDistrib]       = useState([])
  const [sales, setSales]           = useState([])
  const [stockMap, setStockMap]     = useState({})

  // User form state
  const [showUserForm, setShowUserForm] = useState(false)
  const [editUser, setEditUser]         = useState(null)
  const [savingUser, setSavingUser]     = useState(false)
  const [showPass, setShowPass]         = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [userForm, setUserForm] = useState({
    email: '', password: '', name: '', role: 'seller', store_name: '', phone: ''
  })

  // Netlify Functions base path (no SUPABASE_URL needed — functions are on the same domain)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: prods },
        { data: u },
        { data: prod },
        { data: dist },
        { data: s }
      ] = await Promise.all([
        supabase.from('products').select('*').order('type'),
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('production').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('distribution').select('*, products(*)').order('created_at', { ascending: false }),
        supabase.from('sales').select('*, products(*)').order('created_at', { ascending: false }),
      ])
      setProducts(prods || [])
      setUsers(u || [])
      setProduction(prod || [])
      setDistrib(dist || [])
      setSales(s || [])

      // Build stock map
      const pm = {}, dm = {}, sm = {}
      ;(prod  || []).forEach(r => { pm[r.product_id] = (pm[r.product_id] || 0) + r.quantity })
      ;(dist  || []).forEach(r => { dm[r.product_id] = (dm[r.product_id] || 0) + r.quantity })
      ;(s     || []).forEach(r => { sm[r.product_id] = (sm[r.product_id] || 0) + r.quantity })
      const map = {}
      ;(prods || []).forEach(p => {
        map[p.id] = {
          label: `${p.type} ${p.size}`,
          produced: pm[p.id] || 0,
          distributed: dm[p.id] || 0,
          sold: sm[p.id] || 0,
          remaining: (pm[p.id] || 0) - (dm[p.id] || 0) - (sm[p.id] || 0),
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

  // ─── Realtime subscriptions ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },   () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },        () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

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
        // Update profile only
        const { error } = await supabase.from('profiles').update({
          name: userForm.name, role: userForm.role,
          store_name: userForm.store_name || null, phone: userForm.phone || null,
        }).eq('id', editUser.id)
        if (error) throw error
        toast.success('ແກ້ໄຂຂໍ້ມູນສຳເລັດ')
      } else {
        // Create new user via Edge Function
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/.netlify/functions/create-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email:      userForm.email,
            password:   userForm.password,
            name:       userForm.name,
            role:       userForm.role,
            store_name: userForm.store_name || null,
            phone:      userForm.phone || null,
          }),
        })
        const result = await res.json()
        if (!result.success) throw new Error(result.error || 'ສ້າງ User ຜິດພາດ')
        toast.success('ສ້າງ User ສຳເລັດ ✅')
      }
      setShowUserForm(false)
      load()
    } catch (err) {
      toast.error('ຜິດພາດ: ' + err.message)
    } finally {
      setSavingUser(false)
    }
  }

  async function deleteUser(userId) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/.netlify/functions/delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error)
      toast.success('ລຶບ User ສຳເລັດ')
      load()
    } catch (err) {
      toast.error('ລຶບຜິດພາດ: ' + err.message)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportAllReports(supabase)
      toast.success('Export Excel ສຳເລັດ ✅')
    } catch (err) {
      toast.error('Export ຜິດພາດ: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day:'2-digit', month:'2-digit', year:'numeric' })
  }
  function fmtDateTime(d) {
    return new Date(d).toLocaleDateString('lo-LA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
  }

  // ─── Computed totals ──────────────────────────────────────────────────
  const totalProduced   = production.reduce((s, r) => s + r.quantity, 0)
  const totalDistributed = distrib.reduce((s, r) => s + r.quantity, 0)
  const totalSold       = sales.reduce((s, r) => s + r.quantity, 0)
  const totalRemaining  = Object.values(stockMap).reduce((s, v) => s + v.remaining, 0)

  const cashDist     = distrib.filter(r => r.payment_method === 'cash')
  const transferDist = distrib.filter(r => r.payment_method === 'transfer')
  const cashQty      = cashDist.reduce((s, r) => s + r.quantity, 0)
  const transferQty  = transferDist.reduce((s, r) => s + r.quantity, 0)

  // ─── Render Tab Content ───────────────────────────────────────────────

  function renderDashboard() {
    return (
      <div className="space-y-6">
        {/* Summary stats */}
        <div>
          <SectionTitle>📊 ສະຫຼຸບລວມ</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="ຜະລິດທັງໝົດ"   value={totalProduced.toLocaleString()}    sub="ຕຸກ" icon="🏭" color="yellow" />
            <StatCard label="ກະຈາຍທັງໝົດ"   value={totalDistributed.toLocaleString()} sub="ຕຸກ" icon="🚚" color="blue" />
            <StatCard label="ຂາຍທັງໝົດ"      value={totalSold.toLocaleString()}        sub="ຕຸກ" icon="🛒" color="green" />
            <StatCard label="Stock ຄ້າງສາງ"  value={totalRemaining.toLocaleString()}   sub="ຕຸກ" icon="📦" color={totalRemaining < 0 ? 'red' : 'white'} />
          </div>
        </div>

        {/* Payment */}
        <div>
          <SectionTitle>💰 ການຊຳລະ</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="ເງິນສົດ"    value={cashQty.toLocaleString()}     sub={`${cashDist.length} ລາຍການ`}     icon="💵" color="green" />
            <StatCard label="ໂອນ"        value={transferQty.toLocaleString()} sub={`${transferDist.length} ລາຍການ`} icon="💳" color="blue" />
          </div>
        </div>

        {/* Per-product stock */}
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
                  <span>🛒 {s.sold}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User count */}
        <div>
          <SectionTitle>👥 ຜູ້ໃຊ້ງານ</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {['producer','distributor','seller','admin'].map(role => {
              const count = users.filter(u => u.role === role).length
              const icons = { producer:'🏭', distributor:'🚚', seller:'🛒', admin:'⚙️' }
              return <StatCard key={role} label={ROLE_LABELS[role]} value={count} sub="ຄົນ" icon={icons[role]} color="white" />
            })}
          </div>
        </div>
      </div>
    )
  }

  function renderUsers() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><Users size={18} className="text-brand-yellow" />ຜູ້ໃຊ້ງານ ({users.length})</SectionTitle>
          <button onClick={openCreateUser} className="btn-primary px-4 py-2 text-sm">
            <Plus size={16} />ເພີ່ມ
          </button>
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
                      u.role==='admin'?'bg-brand-yellow/20 text-brand-yellow':
                      u.role==='producer'?'bg-orange-900/30 text-orange-400':
                      u.role==='distributor'?'bg-blue-900/30 text-blue-400':
                      'bg-green-900/30 text-green-400'}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                    <button onClick={() => openEditUser(u)} className="p-2 text-gray-400 hover:text-brand-yellow">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleteConfirm(u)} className="p-2 text-gray-400 hover:text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderProduction() {
    return (
      <div>
        <SectionTitle><Factory size={18} className="text-brand-yellow" />ການຜະລິດ ({production.length})</SectionTitle>
        {production.length === 0 ? <Empty icon="🏭" /> : (
          <div className="space-y-2">
            {production.map(r => (
              <div key={r.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                    <p className="text-gray-400 text-xs">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
                    <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-brand-yellow font-bold text-lg">{r.quantity}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.destination==='retail'?'bg-green-900/30 text-green-400':'bg-blue-900/30 text-blue-400'}`}>
                      {r.destination==='retail'?'ຮ້ານດາດ':'ສົ່ງ'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderDistrib() {
    return (
      <div>
        <SectionTitle><Truck size={18} className="text-brand-yellow" />ການກະຈາຍ ({distrib.length})</SectionTitle>
        {distrib.length === 0 ? <Empty icon="🚚" /> : (
          <div className="space-y-2">
            {distrib.map(r => (
              <div key={r.id} className="card">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                    <p className="text-gray-400 text-xs flex items-center gap-1"><Store size={11} />{r.store_name}</p>
                    <p className="text-gray-400 text-xs">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
                    <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-brand-yellow font-bold text-lg">{r.quantity}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.payment_method==='cash'?'bg-green-900/30 text-green-400':'bg-blue-900/30 text-blue-400'}`}>
                      {r.payment_method==='cash'?'💵 ສົດ':'💳 ໂອນ'}
                    </span>
                  </div>
                </div>
                {r.receiver_name && <p className="text-gray-500 text-xs mt-1">👤 ຮັບ: {r.receiver_name}</p>}
                {r.transfer_note  && <p className="text-gray-500 text-xs mt-1">📝 {r.transfer_note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderSales() {
    return (
      <div>
        <SectionTitle><ShoppingBag size={18} className="text-brand-yellow" />ການຂາຍ ({sales.length})</SectionTitle>
        {sales.length === 0 ? <Empty icon="🛒" /> : (
          <div className="space-y-2">
            {sales.map(r => (
              <div key={r.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                    <p className="text-gray-400 text-xs flex items-center gap-1"><Store size={11} />{r.store_name}</p>
                    <p className="text-gray-400 text-xs">👤 {users.find(u => u.id === r.created_by)?.name || 'Unknown'}</p>
                    <p className="text-gray-500 text-xs">{fmtDateTime(r.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-brand-yellow font-bold text-lg">{r.quantity}</p>
                    <p className="text-gray-400 text-xs">ເຫລືອ: {r.remaining}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderExport() {
    return (
      <div className="space-y-4">
        <SectionTitle><Download size={18} className="text-brand-yellow" />Export ລາຍງານ</SectionTitle>

        <div className="card text-center py-8">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-white font-semibold mb-1">ດາວໂຫລດ Excel</p>
          <p className="text-gray-400 text-sm mb-6">ດາວໂຫລດລາຍງານທັງໝົດ: ຜະລິດ, ກະຈາຍ, ຂາຍ, ການຊຳລະ</p>
          <button onClick={handleExport} disabled={exporting} className="btn-primary px-8 mx-auto">
            {exporting
              ? <><div className="spinner border-dark-900" />ກຳລັງ Export...</>
              : <><Download size={20} />Export Excel (.xlsx)</>
            }
          </button>
        </div>

        <div className="card space-y-3">
          <p className="text-gray-300 font-medium text-sm">ສະຫຼຸບຂໍ້ມູນ</p>
          {[
            { label: 'ການຜະລິດ',  value: production.length, icon: '🏭' },
            { label: 'ການກະຈາຍ', value: distrib.length,     icon: '🚚' },
            { label: 'ການຂາຍ',    value: sales.length,       icon: '🛒' },
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
    export:     renderExport,
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="Admin Dashboard" subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />

      {/* Tab Bar */}
      <div className="sticky top-[61px] z-30 bg-dark-800 border-b border-dark-500 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 min-w-[64px] ${
                  active
                    ? 'border-brand-yellow text-brand-yellow'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={18} />
                <span>{t.label}</span>
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
            {tabContent[tab]?.()}
          </div>
        )}
      </Page>

      {/* User Form Modal */}
      <Modal
        open={showUserForm}
        onClose={() => setShowUserForm(false)}
        title={editUser ? '✏️ ແກ້ໄຂ User' : '➕ ສ້າງ User ໃໝ່'}
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="field-label">ຊື່ຜູ້ໃຊ້ *</label>
            <input value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="ຊື່ຜູ້ໃຊ້" className="input-field" />
          </div>

          {/* Email — only on create */}
          {!editUser && (
            <div>
              <label className="field-label">Email *</label>
              <input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="input-field" autoComplete="off" />
            </div>
          )}

          {/* Password — only on create */}
          {!editUser && (
            <div>
              <label className="field-label">ລະຫັດຜ່ານ *</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="ຢ່າງນ້ອຍ 6 ຕົວ" className="input-field pr-12" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Role */}
          <div>
            <label className="field-label">ສິດທິ (Role) *</label>
            <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} className="select-field">
              {Object.entries(ROLE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Store name */}
          <div>
            <label className="field-label">ຊື່ຮ້ານ (ສຳລັບ Seller)</label>
            <input value={userForm.store_name} onChange={e => setUserForm(f => ({ ...f, store_name: e.target.value }))} placeholder="ຊື່ຮ້ານ (ທາງເລືອກ)" className="input-field" />
          </div>

          {/* Phone */}
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

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteUser(deleteConfirm?.id)}
        title="ລຶບ User"
        message={`ທ່ານຕ້ອງການລຶບ "${deleteConfirm?.name}" ແທ້ບໍ? ຂໍ້ມູນທັງໝົດຂອງ User ນີ້ຈະຖືກລຶບ.`}
        confirmLabel="ລຶບ"
        danger
      />
    </div>
  )
}

export default function AdminDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
