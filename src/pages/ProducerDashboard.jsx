import { useState, useEffect, useCallback } from 'react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../App'
import {
  Header, Page, StatCard, SectionTitle, Modal, Empty, Spinner,
} from '../components/Layout'
import { ToastProvider, useToast } from '../components/Toast'
import ImageUpload from '../components/ImageUpload'
import { Plus, Package, Clock, Boxes, Trash2, ChevronRight, X, Image } from 'lucide-react'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('lo-LA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

// ─── Inner Component ──────────────────────────────────────────────────────────
function Inner() {
  const { user } = useAuth()
  const toast = useToast()
  const [products, setProducts]     = useState([])
  const [production, setProduction] = useState([])
  const [stats, setStats]           = useState({ total: 0, retail: 0, wholesale: 0 })
  const [stockMap, setStockMap]     = useState({})
  const [showForm, setShowForm]     = useState(false)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)

  // Global destination for the form (top-level toggle)
  const [globalDest, setGlobalDest] = useState('retail')

  // Multi-product form
  const makeItem = (prods, dest) => {
    const d = dest || 'retail'
    const firstId = d === 'retail'
      ? prods?.find(p => p.type?.includes('ເຂັ້ມຂຸ້ນ'))?.id || prods?.[0]?.id || ''
      : prods?.[0]?.id || ''
    return { product_id: firstId, quantity: '', destination: d }
  }
  const [items, setItems]       = useState([{ product_id: '', quantity: '', destination: 'retail' }])
  const [formImage, setFormImage]   = useState(null)
  const [formNotes, setFormNotes]   = useState('')

  // Detail modal
  const [detail, setDetail]         = useState(null)
  const [detailImg, setDetailImg]   = useState(null)
  const [loadingImg, setLoadingImg] = useState(false)

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
      // ຮ້ານດາດ = ໝໍ້ (ບໍ່ນັບໃນ stock ສາງ), ຂາຍສົ່ງ = ຕຸກ (ນັບໃນ stock)
      const retail    = (prod || []).filter(r => r.destination === 'retail').reduce((s, r) => s + r.quantity, 0)
      const wholesale = (prod || []).filter(r => r.destination !== 'retail').reduce((s, r) => s + r.quantity, 0)
      setStats({ retail, wholesale })
      const pm = {}; const dm = {}; const sm = {}
      // pm = ສະເພາະ ຂາຍສົ່ງ ເທົ່ານັ້ນ → ນັບໃນ stock
      ;(prod  || []).filter(r => r.destination !== 'retail')
                    .forEach(r => { pm[r.product_id] = (pm[r.product_id] || 0) + r.quantity })
      ;(dist  || []).forEach(r => { dm[r.product_id] = (dm[r.product_id] || 0) + r.quantity })
      ;(sales || []).forEach(r => { sm[r.product_id] = (sm[r.product_id] || 0) + r.quantity })
      const map = {}
      ;(prods || []).forEach(p => {
        map[p.id] = {
          produced: pm[p.id] || 0, distributed: dm[p.id] || 0, sold: sm[p.id] || 0,
          remaining: (pm[p.id]||0) - (dm[p.id]||0),
        }
      })
      setStockMap(map)
      setItems([makeItem(prods, 'retail')])
    } catch { toast.error('ໂຫລດຂໍ້ມູນຜິດພາດ') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('producer-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production' },   () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },        () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  // ─── Open Detail ──────────────────────────────────────────────────────────
  async function openDetail(r) {
    setDetail(r)
    setDetailImg(null)
    if (r.image_url) {
      setLoadingImg(true)
      const url = await getSignedUrl('production-images', r.image_url)
      setDetailImg(url)
      setLoadingImg(false)
    }
  }

  // ─── Multi-item helpers ───────────────────────────────────────────────────
  function addItem() {
    const firstId = globalDest === 'retail'
      ? products.find(p => p.type?.includes('ເຂັ້ມຂຸ້ນ'))?.id || products[0]?.id || ''
      : products[0]?.id || ''
    setItems(prev => [...prev, { product_id: firstId, quantity: '', destination: globalDest }])
  }
  function removeItem(i) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateItem(i, field, val) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }
  function switchGlobalDest(dest) {
    setGlobalDest(dest)
    const firstId = dest === 'retail'
      ? products.find(p => p.type?.includes('ເຂັ້ມຂຸ້ນ'))?.id || products[0]?.id || ''
      : products[0]?.id || ''
    setItems([{ product_id: firstId, quantity: '', destination: dest }])
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    const valid = items.filter(i => i.product_id && i.quantity && parseInt(i.quantity) > 0)
    if (!valid.length) { toast.error('ໃສ່ສິນຄ້າ ແລະ ຈຳນວນໃຫ້ຄົບ'); return }
    setSaving(true)
    try {
      const records = valid.map(i => ({
        product_id: i.product_id, quantity: parseInt(i.quantity),
        destination: globalDest, image_url: formImage,
        notes: formNotes || null, created_by: user.id,
      }))
      const { error } = await supabase.from('production').insert(records)
      if (error) throw error
      toast.success(`ບັນທຶກ ${records.length} ລາຍການ ສຳເລັດ ✅`)
      setShowForm(false)
      setItems([makeItem(products)])
      setFormImage(null); setFormNotes('')
      load()
    } catch (err) { toast.error('ບັນທຶກຜິດພາດ: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Header title="ຜູ້ຜະລິດ" subtitle="ຕິດຕາມແຈ່ວຫອມແຊບ" />
      <Page>
        {loading ? <div className="flex justify-center py-20"><Spinner size={36} /></div> : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard label="ຂາຍສົ່ງ (Stock)"  value={stats.wholesale.toLocaleString()} sub="ຕຸກ"  icon="🚚" color="yellow" />
              <StatCard label="ຂື້ນຮ້ານດາດ"       value={stats.retail.toLocaleString()}    sub="ໝໍ້"  icon="🏪" color="green" />
              <StatCard label="ລາຍການທັງໝົດ"       value={production.length}               sub="ຄັ້ງ" icon="📋" color="white" />
            </div>

            {/* Stock per product — ສະເພາະ ຂາຍສົ່ງ (ຮ້ານດາດ ບໍ່ນັບ) */}
            <SectionTitle><Boxes size={18} className="text-brand-yellow" />Stock ສາງ (ຂາຍສົ່ງ)</SectionTitle>
            <p className="text-gray-500 text-xs mb-2 -mt-2">⚠️ ຮ້ານດາດ (ໝໍ້) ບໍ່ນັບໃນ Stock ສາງ</p>
            <div className="space-y-2 mb-6">
              {products.map(p => {
                const s = stockMap[p.id] || {}
                const rem = s.remaining || 0
                return (
                  <div key={p.id} className="card flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium text-sm">{p.type} {p.size}</p>
                      <p className="text-gray-500 text-xs">ຜະລິດ(ສົ່ງ) {s.produced||0} | ກະຈາຍ {s.distributed||0}</p>
                    </div>
                    <div className={`text-xl font-bold ${rem > 0 ? 'text-brand-yellow' : 'text-red-400'}`}>
                      {rem}<span className="text-xs font-normal text-gray-400 ml-1">ຕຸກ</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add button */}
            <button onClick={() => setShowForm(true)} className="btn-primary w-full mb-6">
              <Plus size={22} /> ບັນທຶກການຜະລິດ
            </button>

            {/* History — clickable for detail */}
            <SectionTitle><Clock size={18} className="text-brand-yellow" />ປະຫວັດການຜະລິດ</SectionTitle>
            {production.length === 0 ? <Empty icon="📦" message="ຍັງບໍ່ມີລາຍການ" /> : (
              <div className="space-y-2">
                {production.slice(0, 50).map(r => (
                  <button key={r.id} onClick={() => openDetail(r)}
                    className="card w-full text-left hover:border-brand-yellow/40 transition-colors active:scale-98">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-medium text-sm">{r.products?.type} {r.products?.size}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{fmtDate(r.created_at)}</p>
                        {r.image_url && <p className="text-brand-yellow text-xs mt-1 flex items-center gap-1"><Image size={11}/>ມີຮູບພາບ</p>}
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="text-brand-yellow font-bold text-lg">
                            {r.quantity.toLocaleString()}
                            <span className="text-xs font-normal text-gray-400 ml-1">
                              {r.destination === 'retail' ? 'ໝໍ້' : 'ຕຸກ'}
                            </span>
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.destination==='retail'?'bg-green-900/40 text-green-400':'bg-blue-900/40 text-blue-400'}`}>
                            {r.destination==='retail'?'🏪 ຮ້ານດາດ':'🚚 ຂາຍສົ່ງ'}
                          </span>
                        </div>
                        <ChevronRight size={16} className="text-gray-500" />
                      </div>
                    </div>
                    {r.notes && <p className="text-gray-500 text-xs mt-2">📝 {r.notes}</p>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Page>

      {/* ─── Production Form Modal (Multi-product) ─── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="🏭 ບັນທຶກການຜະລິດ">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Global Destination toggle (TOP) ── */}
          <div>
            <label className="field-label">ປາຍທາງ</label>
            <div className="flex gap-2">
              {[
                { val: 'retail',    label: '🏪 ຮ້ານດາດ',  sub: 'ໝໍ້' },
                { val: 'wholesale', label: '🚚 ຂາຍສົ່ງ',  sub: 'ຕຸກ' },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => switchGlobalDest(opt.val)}
                  className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all flex flex-col items-center gap-0.5 ${
                    globalDest === opt.val
                      ? 'bg-brand-yellow text-dark-900 shadow-md'
                      : 'bg-dark-600 text-gray-300 border border-dark-400'
                  }`}>
                  {opt.label}
                  <span className={`text-xs font-normal ${globalDest === opt.val ? 'text-dark-700' : 'text-gray-500'}`}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Product items */}
          <div className="space-y-3">
            <label className="field-label">ລາຍການສິນຄ້າ</label>
            {items.map((item, i) => {
              // Filtered options based on globalDest
              const opts = globalDest === 'retail'
                ? [
                    { id: products.find(p => p.type?.includes('ເຂັ້ມຂຸ້ນ'))?.id, label: 'ເຂັ້ມຂຸ້ນ' },
                    { id: products.find(p => p.type?.includes('ນຸ້ມນວນ'))?.id,   label: 'ນຸ້ມນວນ-ດາດພັນ' },
                  ].filter(o => o.id)
                : products.map(p => ({ id: p.id, label: `${p.type} ${p.size}` }))
              return (
                <div key={i} className="bg-dark-600 rounded-2xl p-3 space-y-2 border border-dark-400">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 text-xs">ລາຍການ {i + 1}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300 p-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {/* Product select — filtered by globalDest */}
                  <select
                    value={item.product_id}
                    onChange={e => updateItem(i, 'product_id', e.target.value)}
                    className="select-field"
                    required
                  >
                    {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  {/* Quantity */}
                  <div className="relative">
                    <input
                      type="number" inputMode="numeric" min="1"
                      value={item.quantity}
                      onChange={e => updateItem(i, 'quantity', e.target.value)}
                      placeholder={`ຈຳນວນ (${globalDest === 'retail' ? 'ໝໍ້' : 'ຕຸກ'})`}
                      required
                      className="input-field text-xl font-bold text-brand-yellow pr-14"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
                      {globalDest === 'retail' ? 'ໝໍ້' : 'ຕຸກ'}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Add more */}
            {items.length < (globalDest === 'retail' ? 2 : products.length) && (
              <button type="button" onClick={addItem}
                className="w-full py-2 rounded-2xl border border-dashed border-brand-yellow/40 text-brand-yellow text-sm flex items-center justify-center gap-2 hover:bg-brand-yellow/5">
                <Plus size={16} /> ເພີ່ມສິນຄ້າລາຍການອື່ນ
              </button>
            )}
          </div>

          {/* Shared image */}
          <ImageUpload
            bucket="production-images"
            label="ຮູບການຜະລິດ (ທາງເລືອກ)"
            onUpload={path => setFormImage(path)}
          />

          {/* Notes */}
          <div>
            <label className="field-label">ໝາຍເຫດ (ທາງເລືອກ)</label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="ໝາຍເຫດເພີ່ມເຕີມ..."
              rows={2}
              className="input-field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ຍົກເລີກ</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <><div className="spinner border-dark-900"/>ກຳລັງບັນທຶກ...</> : `✅ ບັນທຶກ ${items.length} ລາຍການ`}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal open={!!detail} onClose={() => { setDetail(null); setDetailImg(null) }} title="📋 ລາຍລະອຽດການຜະລິດ">
        {detail && (
          <div className="space-y-4">
            {/* Product info */}
            <div className="bg-dark-600 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">ສິນຄ້າ</span>
                <span className="text-white font-semibold">{detail.products?.type} {detail.products?.size}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">ຈຳນວນ</span>
                <span className="text-brand-yellow font-bold text-xl">
                  {detail.quantity?.toLocaleString()} {detail.destination === 'retail' ? 'ໝໍ້' : 'ຕຸກ'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">ປາຍທາງ</span>
                <span className={`text-sm px-3 py-1 rounded-full ${detail.destination==='retail'?'bg-green-900/40 text-green-400':'bg-blue-900/40 text-blue-400'}`}>
                  {detail.destination==='retail'?'🏪 ຮ້ານດາດ':'🚚 ຂາຍສົ່ງ'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">ວັນທີ</span>
                <span className="text-white text-sm">{fmtDate(detail.created_at)}</span>
              </div>
              {detail.notes && (
                <div className="pt-1 border-t border-dark-400">
                  <span className="text-gray-400 text-xs">📝 {detail.notes}</span>
                </div>
              )}
            </div>

            {/* Image */}
            {detail.image_url ? (
              <div>
                <p className="field-label mb-2">ຮູບພາບ</p>
                {loadingImg ? (
                  <div className="flex justify-center py-8"><Spinner size={28}/></div>
                ) : detailImg ? (
                  <img src={detailImg} alt="production" className="w-full rounded-2xl object-cover max-h-72" />
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">ໂຫລດຮູບຜິດພາດ</p>
                )}
              </div>
            ) : (
              <p className="text-gray-600 text-sm text-center py-2">ບໍ່ມີຮູບພາບ</p>
            )}

            <button onClick={() => { setDetail(null); setDetailImg(null) }} className="btn-secondary w-full">ປິດ</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default function ProducerDashboard() {
  return <ToastProvider><Inner /></ToastProvider>
}
