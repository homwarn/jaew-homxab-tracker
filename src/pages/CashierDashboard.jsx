import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, StatCard, SectionTitle, Modal, ConfirmDialog, Empty, Spinner
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import {
  Package, ShoppingCart, FlaskConical, BarChart3,
  Plus, Pencil, Trash2, ChevronRight, Tag, Layers
} from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────────────────
function fmtDate(d) {
  return new Date(d).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtNum(n) { return Number(n || 0).toLocaleString('lo-LA') }

const UNITS = ['kg', 'g', 'ລິດ', 'ml', 'ຫ່ວຍ', 'ຖົງ', 'ກ່ອງ', 'ຂວດ', 'ຖ້ວຍ']

// ─── inner component ───────────────────────────────────────────────────────
function Inner() {
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState('materials')  // materials | purchases | batches | report

  // Data
  const [categories, setCategories] = useState([])
  const [materials,  setMaterials]  = useState([])
  const [purchases,  setPurchases]  = useState([])
  const [batches,    setBatches]    = useState([])
  const [loading,    setLoading]    = useState(true)

  // ── Material form ────────────────────────────────────────────────────────
  const [showMatForm, setShowMatForm]   = useState(false)
  const [editMat,     setEditMat]       = useState(null)
  const [savingMat,   setSavingMat]     = useState(false)
  const [deleteMat,   setDeleteMat]     = useState(null)
  const [matForm, setMatForm] = useState({ name: '', category_id: '', unit: 'kg', unit_cost: '' })

  // ── Category form ─────────────────────────────────────────────────────────
  const [showCatForm, setShowCatForm]   = useState(false)
  const [savingCat,   setSavingCat]     = useState(false)
  const [catName,     setCatName]       = useState('')

  // ── Purchase form ─────────────────────────────────────────────────────────
  const [showPurForm, setShowPurForm]   = useState(false)
  const [savingPur,   setSavingPur]     = useState(false)
  const [purForm, setPurForm] = useState({ material_id: '', quantity: '', unit_price: '', supplier: '', notes: '' })

  // ── Batch form ────────────────────────────────────────────────────────────
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [savingBatch,   setSavingBatch]   = useState(false)
  const [deleteBatch,   setDeleteBatch]   = useState(null)
  const [batchForm, setBatchForm] = useState({ batch_name: '', batch_date: new Date().toISOString().slice(0,10), notes: '' })
  const [batchItems, setBatchItems] = useState([])  // [{material_id, quantity_used}]

  // ─── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: cats },
        { data: mats },
        { data: purs },
        { data: bats },
      ] = await Promise.all([
        supabase.from('material_categories').select('*').order('name'),
        supabase.from('raw_materials').select('*, material_categories(name)').order('name'),
        supabase.from('material_purchases').select('*, raw_materials(name,unit)').order('created_at', { ascending: false }),
        supabase.from('material_usage').select('*').order('batch_date', { ascending: false }),
      ])
      setCategories(cats || [])
      setMaterials(mats  || [])
      setPurchases(purs  || [])
      setBatches(bats    || [])
    } catch (e) {
      toast.error('ໂຫລດຜິດພາດ: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('cashier-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_materials' },       () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_categories' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_purchases' },  () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_usage' },      () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  // ─── Category CRUD ──────────────────────────────────────────────────────
  async function saveCategory() {
    if (!catName.trim()) { toast.error('ໃສ່ຊື່ໝວດ'); return }
    setSavingCat(true)
    try {
      const { error } = await supabase.from('material_categories').insert({ name: catName.trim() })
      if (error) throw error
      toast.success('ເພີ່ມໝວດສຳເລັດ ✅')
      setCatName(''); setShowCatForm(false); load()
    } catch (e) { toast.error(e.message.includes('unique') ? 'ມີໝວດນີ້ແລ້ວ' : e.message) }
    finally { setSavingCat(false) }
  }

  // ─── Material CRUD ──────────────────────────────────────────────────────
  function openCreateMat() {
    setEditMat(null)
    setMatForm({ name: '', category_id: '', unit: 'kg', unit_cost: '' })
    setShowMatForm(true)
  }
  function openEditMat(m) {
    setEditMat(m)
    setMatForm({ name: m.name, category_id: m.category_id || '', unit: m.unit, unit_cost: String(m.unit_cost || '') })
    setShowMatForm(true)
  }
  async function saveMaterial() {
    if (!matForm.name.trim()) { toast.error('ໃສ່ຊື່ວັດຖຸດິບ'); return }
    setSavingMat(true)
    try {
      const row = {
        name:        matForm.name.trim(),
        category_id: matForm.category_id || null,
        unit:        matForm.unit,
        unit_cost:   parseFloat(matForm.unit_cost) || 0,
      }
      if (editMat) {
        const { error } = await supabase.from('raw_materials').update(row).eq('id', editMat.id)
        if (error) throw error
        toast.success('ແກ້ໄຂສຳເລັດ ✅')
      } else {
        const { error } = await supabase.from('raw_materials').insert({ ...row, created_by: user.id })
        if (error) throw error
        toast.success('ເພີ່ມວັດຖຸດິບສຳເລັດ ✅')
      }
      setShowMatForm(false); load()
    } catch (e) { toast.error('ຜິດພາດ: ' + e.message) }
    finally { setSavingMat(false) }
  }
  async function deleteMaterial(id) {
    try {
      const { error } = await supabase.from('raw_materials').delete().eq('id', id)
      if (error) throw error
      toast.success('ລຶບສຳເລັດ')
      setDeleteMat(null); load()
    } catch (e) { toast.error(e.message) }
  }

  // ─── Purchase ────────────────────────────────────────────────────────────
  async function savePurchase() {
    if (!purForm.material_id || !purForm.quantity || !purForm.unit_price) {
      toast.error('ໃສ່ຂໍ້ມູນໃຫ້ຄົບ'); return
    }
    setSavingPur(true)
    try {
      const qty   = parseFloat(purForm.quantity)
      const price = parseFloat(purForm.unit_price)
      // Insert purchase
      const { error: pe } = await supabase.from('material_purchases').insert({
        material_id: purForm.material_id,
        quantity:    qty,
        unit_price:  price,
        supplier:    purForm.supplier || null,
        notes:       purForm.notes   || null,
        created_by:  user.id,
      })
      if (pe) throw pe
      // Update stock
      const mat = materials.find(m => m.id === purForm.material_id)
      if (mat) {
        const { error: se } = await supabase.from('raw_materials')
          .update({ quantity_in_stock: (mat.quantity_in_stock || 0) + qty })
          .eq('id', mat.id)
        if (se) throw se
      }
      toast.success('ບັນທຶກການຊື້ສຳເລັດ ✅')
      setPurForm({ material_id: '', quantity: '', unit_price: '', supplier: '', notes: '' })
      setShowPurForm(false); load()
    } catch (e) { toast.error('ຜິດພາດ: ' + e.message) }
    finally { setSavingPur(false) }
  }

  // ─── Batch (usage) ────────────────────────────────────────────────────────
  function openBatchForm() {
    setBatchForm({ batch_name: '', batch_date: new Date().toISOString().slice(0,10), notes: '' })
    setBatchItems(materials.map(m => ({ material_id: m.id, name: m.name, unit: m.unit, unit_cost: m.unit_cost, quantity_used: '' })))
    setShowBatchForm(true)
  }
  function updateBatchItem(id, val) {
    setBatchItems(prev => prev.map(i => i.material_id === id ? { ...i, quantity_used: val } : i))
  }
  async function saveBatch() {
    if (!batchForm.batch_name.trim()) { toast.error('ໃສ່ຊື່ຫມໍ້/ຄັ້ງ'); return }
    const used = batchItems.filter(i => parseFloat(i.quantity_used) > 0)
    if (!used.length) { toast.error('ໃສ່ຈຳນວນວັດຖຸດິບຢ່າງໜ້ອຍ 1 ລາຍການ'); return }
    setSavingBatch(true)
    try {
      const items = used.map(i => ({
        material_id:   i.material_id,
        material_name: i.name,
        unit:          i.unit,
        quantity_used: parseFloat(i.quantity_used),
        unit_cost:     i.unit_cost || 0,
        subtotal:      parseFloat(i.quantity_used) * (i.unit_cost || 0),
      }))
      const total_cost = items.reduce((s, i) => s + i.subtotal, 0)

      const { error: be } = await supabase.from('material_usage').insert({
        batch_name: batchForm.batch_name.trim(),
        batch_date: batchForm.batch_date,
        items,
        total_cost,
        notes:      batchForm.notes || null,
        created_by: user.id,
      })
      if (be) throw be

      // Deduct stock for each used material
      await Promise.all(used.map(async i => {
        const mat = materials.find(m => m.id === i.material_id)
        if (!mat) return
        const newQty = Math.max(0, (mat.quantity_in_stock || 0) - parseFloat(i.quantity_used))
        await supabase.from('raw_materials').update({ quantity_in_stock: newQty }).eq('id', i.material_id)
      }))

      toast.success('ບັນທຶກການຜະລິດສຳເລັດ ✅')
      setShowBatchForm(false); load()
    } catch (e) { toast.error('ຜິດພາດ: ' + e.message) }
    finally { setSavingBatch(false) }
  }
  async function deleteBatchRecord(id) {
    try {
      const { error } = await supabase.from('material_usage').delete().eq('id', id)
      if (error) throw error
      toast.success('ລຶບສຳເລັດ')
      setDeleteBatch(null); load()
    } catch (e) { toast.error(e.message) }
  }

  // ─── Computed ──────────────────────────────────────────────────────────
  const totalStock   = materials.reduce((s, m) => s + (m.quantity_in_stock || 0), 0)
  const totalMatCost = materials.reduce((s, m) => s + (m.quantity_in_stock || 0) * (m.unit_cost || 0), 0)
  const totalPurCost = purchases.reduce((s, p) => s + (p.total_cost || 0), 0)
  const totalBatCost = batches.reduce((s, b) => s + (b.total_cost || 0), 0)
  const lowStock     = materials.filter(m => (m.quantity_in_stock || 0) < 1)

  // Group materials by category
  function getGroupedMaterials() {
    const map = {}
    materials.forEach(m => {
      const key = m.material_categories?.name || 'ບໍ່ມີໝວດ'
      if (!map[key]) map[key] = []
      map[key].push(m)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }

  // ─── Tab: Materials ────────────────────────────────────────────────────
  function renderMaterials() {
    const grouped = getGroupedMaterials()
    return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="ລາຍການທັງໝົດ" value={materials.length} sub="ລາຍການ" icon="📦" color="yellow" />
          <StatCard label="ມູນຄ່າ Stock"   value={Math.round(totalMatCost / 1000) + 'K'} sub="₭" icon="💰" color="green" />
        </div>
        {lowStock.length > 0 && (
          <div className="card border-red-500/40 bg-red-900/10">
            <p className="text-red-400 font-semibold text-sm">⚠️ ວັດຖຸດິບໃກ້ໝົດ ({lowStock.length} ລາຍການ)</p>
            <p className="text-red-300 text-xs mt-1">{lowStock.map(m => m.name).join(', ')}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={openCreateMat} className="flex-1 btn-primary text-sm py-2.5">
            <Plus size={16} />ເພີ່ມວັດຖຸດິບ
          </button>
          <button onClick={() => setShowCatForm(true)}
            className="px-4 py-2.5 rounded-xl bg-dark-600 text-gray-300 border border-dark-400 text-sm flex items-center gap-1.5">
            <Tag size={15} />ໝວດ
          </button>
        </div>

        {/* Grouped list */}
        {grouped.length === 0 ? <Empty icon="📦" message="ຍັງບໍ່ມີວັດຖຸດິບ" /> : (
          <div className="space-y-4">
            {grouped.map(([catName, mats]) => (
              <div key={catName}>
                <p className="text-brand-yellow text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Layers size={13} />{catName} ({mats.length})
                </p>
                <div className="space-y-2">
                  {mats.map(m => (
                    <div key={m.id} className={`card ${(m.quantity_in_stock || 0) < 1 ? 'border-red-500/30' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm">{m.name}</p>
                          <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                            <span>ຫົວໜ່ວຍ: {m.unit}</span>
                            {m.unit_cost > 0 && <span>ລາຄາ: {fmtNum(m.unit_cost)} ₭/{m.unit}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className={`font-bold text-lg ${(m.quantity_in_stock || 0) < 1 ? 'text-red-400' : 'text-brand-yellow'}`}>
                              {fmtNum(m.quantity_in_stock)}
                            </p>
                            <p className="text-gray-500 text-xs">{m.unit}</p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button onClick={() => openEditMat(m)} className="p-1.5 text-gray-400 hover:text-brand-yellow"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteMat(m)} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>
                      {m.quantity_in_stock > 0 && m.unit_cost > 0 && (
                        <p className="text-green-400 text-xs mt-1">
                          ມູນຄ່າ: {fmtNum(m.quantity_in_stock * m.unit_cost)} ₭
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Purchases ────────────────────────────────────────────────────
  function renderPurchases() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="ຊື້ທັງໝົດ" value={purchases.length} sub="ຄັ້ງ" icon="🛒" color="yellow" />
          <StatCard label="ລາຍຈ່າຍ" value={Math.round(totalPurCost / 1000) + 'K'} sub="₭" icon="💸" color="red" />
        </div>

        <button onClick={() => setShowPurForm(true)} className="w-full btn-primary">
          <Plus size={18} />ບັນທຶກການຊື້
        </button>

        {purchases.length === 0 ? <Empty icon="🛒" message="ຍັງບໍ່ມີການຊື້" /> : (
          <div className="space-y-2">
            {purchases.map(p => (
              <div key={p.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium text-sm">{p.raw_materials?.name}</p>
                    <p className="text-gray-400 text-xs">{fmtDate(p.created_at)}</p>
                    {p.supplier && <p className="text-gray-500 text-xs">🏪 {p.supplier}</p>}
                    {p.notes    && <p className="text-gray-500 text-xs">📝 {p.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-brand-yellow font-bold">{fmtNum(p.quantity)} {p.raw_materials?.unit}</p>
                    <p className="text-gray-400 text-xs">{fmtNum(p.unit_price)} ₭/ຫົວໜ່ວຍ</p>
                    <p className="text-green-400 text-xs font-semibold">{fmtNum(p.total_cost)} ₭</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Batches ──────────────────────────────────────────────────────
  function renderBatches() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="ການຜະລິດ" value={batches.length} sub="ຄັ້ງ" icon="🍳" color="yellow" />
          <StatCard label="ຕົ້ນທຶນລວມ" value={Math.round(totalBatCost / 1000) + 'K'} sub="₭" icon="💰" color="orange" />
        </div>

        <button onClick={openBatchForm} className="w-full btn-primary">
          <Plus size={18} />ບັນທຶກການຜະລິດ (ຫມໍ້ໃໝ່)
        </button>

        {batches.length === 0 ? <Empty icon="🍳" message="ຍັງບໍ່ມີການຜະລິດ" /> : (
          <div className="space-y-2">
            {batches.map(b => {
              const items = Array.isArray(b.items) ? b.items : []
              return (
                <div key={b.id} className="card">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">{b.batch_name}</p>
                      <p className="text-gray-400 text-xs">{fmtDate(b.batch_date)}</p>
                      {b.notes && <p className="text-gray-500 text-xs">📝 {b.notes}</p>}
                      {/* Items */}
                      {items.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {items.map((i, idx) => (
                            <p key={idx} className="text-gray-400 text-xs">
                              • {i.material_name}: {fmtNum(i.quantity_used)} {i.unit}
                              {i.subtotal > 0 && ` (${fmtNum(i.subtotal)} ₭)`}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <p className="text-brand-yellow font-bold text-lg">{fmtNum(b.total_cost)} ₭</p>
                      <p className="text-gray-500 text-xs">{items.length} ລາຍການ</p>
                      <button onClick={() => setDeleteBatch(b)} className="p-1.5 text-gray-400 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ─── Tab: Report ──────────────────────────────────────────────────────
  function renderReport() {
    // Cost per batch avg
    const avgBatchCost = batches.length ? totalBatCost / batches.length : 0
    // Most-used materials
    const usageMap = {}
    batches.forEach(b => {
      ;(Array.isArray(b.items) ? b.items : []).forEach(i => {
        usageMap[i.material_name] = (usageMap[i.material_name] || 0) + i.quantity_used
      })
    })
    const topMaterials = Object.entries(usageMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

    return (
      <div className="space-y-5">
        <SectionTitle><BarChart3 size={18} className="text-brand-yellow" />ສະຫຼຸບ Stock</SectionTitle>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="ວັດຖຸດິບທັງໝົດ" value={materials.length}     sub="ລາຍການ" icon="📦" color="yellow" />
          <StatCard label="ມູນຄ່າ Stock"    value={Math.round(totalMatCost/1000)+'K'} sub="₭" icon="💰" color="green" />
          <StatCard label="ລາຍຈ່າຍຊື້"     value={Math.round(totalPurCost/1000)+'K'} sub="₭" icon="💸" color="red" />
          <StatCard label="ຕົ້ນທຶນຜະລິດ"    value={Math.round(totalBatCost/1000)+'K'} sub="₭" icon="🍳" color="orange" />
        </div>

        {batches.length > 0 && (
          <div className="card">
            <p className="text-gray-300 font-medium text-sm mb-2">📊 ຕົ້ນທຶນການຜະລິດ</p>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">ຄ່າສະເລ່ຍ/ຄັ້ງ</span>
              <span className="text-brand-yellow font-bold">{fmtNum(Math.round(avgBatchCost))} ₭</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">ຈຳນວນການຜະລິດ</span>
              <span className="text-white">{batches.length} ຄັ້ງ</span>
            </div>
          </div>
        )}

        {topMaterials.length > 0 && (
          <div>
            <SectionTitle>🏆 ວັດຖຸດິບທີ່ໃຊ້ຫຼາຍ</SectionTitle>
            <div className="space-y-2">
              {topMaterials.map(([name, qty], i) => (
                <div key={name} className="card">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                        i === 0 ? 'bg-yellow-400 text-dark-900' :
                        i === 1 ? 'bg-gray-300 text-dark-900' :
                        i === 2 ? 'bg-orange-600 text-white' :
                                  'bg-dark-600 text-gray-400'
                      }`}>{i+1}</span>
                      <p className="text-white text-sm">{name}</p>
                    </div>
                    <p className="text-brand-yellow font-bold">{fmtNum(qty)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stock table */}
        <div>
          <SectionTitle>📋 Stock ປັດຈຸບັນ</SectionTitle>
          <div className="space-y-2">
            {materials.map(m => {
              const pct = Math.min(100, ((m.quantity_in_stock || 0) / 20) * 100)
              return (
                <div key={m.id} className="card py-2">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-white text-sm">{m.name}</p>
                    <p className={`font-bold text-sm ${(m.quantity_in_stock||0) < 1 ? 'text-red-400' : 'text-brand-yellow'}`}>
                      {fmtNum(m.quantity_in_stock)} {m.unit}
                    </p>
                  </div>
                  <div className="w-full bg-dark-600 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${(m.quantity_in_stock||0) < 1 ? 'bg-red-400' : 'bg-brand-yellow'}`}
                      style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'materials', label: 'ວັດຖຸດິບ', icon: Package },
    { id: 'purchases', label: 'ຊື້ເຂົ້າ',  icon: ShoppingCart },
    { id: 'batches',   label: 'ຜະລິດ',    icon: FlaskConical },
    { id: 'report',    label: 'ລາຍງານ',   icon: BarChart3 },
  ]

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="Cashier" subtitle="ຕິດຕາມວັດຖຸດິບ" />

      {/* Tab bar */}
      <div className="sticky top-[61px] z-30 bg-dark-800 border-b border-dark-500">
        <div className="flex">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === t.id ? 'border-brand-yellow text-brand-yellow' : 'border-transparent text-gray-500'
                }`}>
                <Icon size={17} />{t.label}
              </button>
            )
          })}
        </div>
      </div>

      <Page>
        {loading ? <div className="flex justify-center py-20"><Spinner size={36} /></div> : (
          <div className="animate-fade-in">
            {tab === 'materials' && renderMaterials()}
            {tab === 'purchases' && renderPurchases()}
            {tab === 'batches'   && renderBatches()}
            {tab === 'report'    && renderReport()}
          </div>
        )}
      </Page>

      {/* ── Add Category Modal ────────────────────────────────────────────── */}
      <Modal open={showCatForm} onClose={() => setShowCatForm(false)} title="➕ ເພີ່ມໝວດວັດຖຸດິບ">
        <div className="space-y-4">
          <div>
            <label className="field-label">ຊື່ໝວດ *</label>
            <input value={catName} onChange={e => setCatName(e.target.value)}
              placeholder="ເຊັ່ນ: ເຄື່ອງປຸງ, ບັນຈຸພັນ, ນ້ຳ..."
              className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setShowCatForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={saveCategory} disabled={savingCat} className="btn-primary">
              {savingCat ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
          {/* Existing categories */}
          {categories.length > 0 && (
            <div>
              <p className="field-label mb-2">ໝວດທີ່ມີຢູ່:</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(c => (
                  <span key={c.id} className="text-xs px-2 py-1 rounded-full bg-dark-600 text-gray-300">{c.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Material Form Modal ───────────────────────────────────────────── */}
      <Modal open={showMatForm} onClose={() => setShowMatForm(false)}
        title={editMat ? '✏️ ແກ້ໄຂວັດຖຸດິບ' : '➕ ເພີ່ມວັດຖຸດິບ'}>
        <div className="space-y-4">
          <div>
            <label className="field-label">ຊື່ວັດຖຸດິບ *</label>
            <input value={matForm.name} onChange={e => setMatForm(f => ({ ...f, name: e.target.value }))}
              placeholder="ເຊັ່ນ: ໝາກເດືອຍ, ນ້ຳ, ຖົງ..." className="input-field" />
          </div>
          <div>
            <label className="field-label">ໝວດ</label>
            <select value={matForm.category_id} onChange={e => setMatForm(f => ({ ...f, category_id: e.target.value }))} className="select-field">
              <option value="">-- ບໍ່ລະບຸໝວດ --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">ຫົວໜ່ວຍ</label>
              <select value={matForm.unit} onChange={e => setMatForm(f => ({ ...f, unit: e.target.value }))} className="select-field">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">ລາຄາ/ຫົວໜ່ວຍ (₭)</label>
              <input type="number" inputMode="decimal" min="0" value={matForm.unit_cost}
                onChange={e => setMatForm(f => ({ ...f, unit_cost: e.target.value }))}
                placeholder="0" className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={() => setShowMatForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={saveMaterial} disabled={savingMat} className="btn-primary">
              {savingMat ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Purchase Modal ────────────────────────────────────────────────── */}
      <Modal open={showPurForm} onClose={() => setShowPurForm(false)} title="🛒 ບັນທຶກການຊື້ວັດຖຸດິບ">
        <div className="space-y-4">
          <div>
            <label className="field-label">ວັດຖຸດິບ *</label>
            <select value={purForm.material_id} onChange={e => {
              const mat = materials.find(m => m.id === e.target.value)
              setPurForm(f => ({ ...f, material_id: e.target.value, unit_price: mat ? String(mat.unit_cost) : '' }))
            }} className="select-field">
              <option value="">-- ເລືອກວັດຖຸດິບ --</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">ຈຳນວນ *</label>
              <input type="number" inputMode="decimal" min="0" value={purForm.quantity}
                onChange={e => setPurForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="0" className="input-field text-xl font-bold text-brand-yellow" />
            </div>
            <div>
              <label className="field-label">ລາຄາ/ຫົວໜ່ວຍ (₭) *</label>
              <input type="number" inputMode="decimal" min="0" value={purForm.unit_price}
                onChange={e => setPurForm(f => ({ ...f, unit_price: e.target.value }))}
                placeholder="0" className="input-field text-green-400" />
            </div>
          </div>
          {purForm.quantity && purForm.unit_price && (
            <p className="text-green-400 text-sm font-semibold text-right">
              ລວມ: {fmtNum(parseFloat(purForm.quantity) * parseFloat(purForm.unit_price))} ₭
            </p>
          )}
          <div>
            <label className="field-label">ຜູ້ຂາຍ / ແຫຼ່ງ</label>
            <input value={purForm.supplier} onChange={e => setPurForm(f => ({ ...f, supplier: e.target.value }))}
              placeholder="ຊື່ຮ້ານ / ຜູ້ຂາຍ (ທາງເລືອກ)" className="input-field" />
          </div>
          <div>
            <label className="field-label">ໝາຍເຫດ</label>
            <input value={purForm.notes} onChange={e => setPurForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="ໝາຍເຫດ..." className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={() => setShowPurForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={savePurchase} disabled={savingPur} className="btn-primary">
              {savingPur ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Batch (Production) Modal ──────────────────────────────────────── */}
      <Modal open={showBatchForm} onClose={() => setShowBatchForm(false)} title="🍳 ບັນທຶກການຜະລິດ (ໜໍ້ໃໝ່)">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">ຊື່ຄັ້ງ/ຫມໍ້ *</label>
              <input value={batchForm.batch_name}
                onChange={e => setBatchForm(f => ({ ...f, batch_name: e.target.value }))}
                placeholder="ເຊັ່ນ: ຫມໍ້ 1, ຄັ້ງທີ 5..." className="input-field" />
            </div>
            <div>
              <label className="field-label">ວັນທີ</label>
              <input type="date" value={batchForm.batch_date}
                onChange={e => setBatchForm(f => ({ ...f, batch_date: e.target.value }))}
                className="input-field" />
            </div>
          </div>

          {/* Material quantities */}
          <div>
            <label className="field-label mb-2">ວັດຖຸດິບທີ່ໃຊ້ (ໃສ່ 0 ຫຼື ຫວ່າງ ເພື່ອຍົກເວັ້ນ)</label>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {batchItems.map(item => (
                <div key={item.material_id} className="flex items-center gap-3 bg-dark-700 rounded-xl px-3 py-2">
                  <span className="text-gray-300 text-sm flex-1">{item.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input type="number" inputMode="decimal" min="0" value={item.quantity_used}
                      onChange={e => updateBatchItem(item.material_id, e.target.value)}
                      placeholder="0"
                      className="w-20 bg-dark-600 border border-dark-400 rounded-lg px-2 py-1.5 text-brand-yellow font-bold text-sm text-right" />
                    <span className="text-gray-500 text-xs">{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Estimated cost */}
          {batchItems.some(i => parseFloat(i.quantity_used) > 0) && (
            <div className="bg-dark-700 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">ຕົ້ນທຶນໂດຍປະມານ:</p>
              <p className="text-brand-yellow font-bold text-xl">
                {fmtNum(batchItems.reduce((s, i) => s + (parseFloat(i.quantity_used)||0) * (i.unit_cost||0), 0))} ₭
              </p>
            </div>
          )}

          <div>
            <label className="field-label">ໝາຍເຫດ</label>
            <textarea value={batchForm.notes} onChange={e => setBatchForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="ໝາຍເຫດ..." rows={2} className="input-field resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={() => setShowBatchForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button onClick={saveBatch} disabled={savingBatch} className="btn-primary">
              {savingBatch ? <><div className="spinner border-dark-900" />ກຳລັງບັນທຶກ...</> : '✅ ບັນທຶກ'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Material Confirm ───────────────────────────────────────── */}
      <ConfirmDialog open={!!deleteMat} onClose={() => setDeleteMat(null)}
        onConfirm={() => deleteMaterial(deleteMat?.id)}
        title="ລຶບວັດຖຸດິບ"
        message={`ລຶບ "${deleteMat?.name}" ອອກ?`}
        confirmLabel="ລຶບ" danger />

      {/* ── Delete Batch Confirm ──────────────────────────────────────────── */}
      <ConfirmDialog open={!!deleteBatch} onClose={() => setDeleteBatch(null)}
        onConfirm={() => deleteBatchRecord(deleteBatch?.id)}
        title="ລຶບການຜະລິດ"
        message={`ລຶບ "${deleteBatch?.batch_name}" ອອກ? Stock ຈະ ບໍ່ຖືກກູ້ຄືນ.`}
        confirmLabel="ລຶບ" danger />
    </div>
  )
}

export default function CashierDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
