import * as XLSX from 'xlsx'

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('lo-LA', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
}

function fmtProduct(row) {
  if (!row.products) return ''
  return `${row.products.type} ${row.products.size}`
}

export async function exportAllReports(supabase) {
  const wb = XLSX.utils.book_new()

  // ---- Fetch profiles separately (FK to auth.users — cannot join directly) ----
  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameOf = (id) => profiles?.find(p => p.id === id)?.name || ''

  // ---- Production Sheet ----
  const { data: prod } = await supabase
    .from('production')
    .select('*, products(*)')
    .order('created_at', { ascending: false })

  if (prod?.length) {
    const rows = prod.map(r => ({
      'ວັນທີ':    fmtDate(r.created_at),
      'ສິນຄ້າ':  fmtProduct(r),
      'ຈຳນວນ':   r.quantity,
      'ໜ່ວຍ':    r.destination === 'retail' ? 'ໝໍ້' : 'ຕຸກ',
      'ປາຍທາງ':  r.destination === 'retail' ? 'ຮ້ານດາດ' : 'ຂາຍສົ່ງ',
      'ຜູ້ຜະລິດ': nameOf(r.created_by),
      'ໝາຍເຫດ':  r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ການຜະລິດ')
  }

  // ---- Distribution Sheet ----
  const { data: dist } = await supabase
    .from('distribution')
    .select('*, products(*)')
    .order('created_at', { ascending: false })

  if (dist?.length) {
    const rows = dist.map(r => ({
      'ວັນທີ':       fmtDate(r.created_at),
      'ສິນຄ້າ':     fmtProduct(r),
      'ຈຳນວນ (ຕຸກ)': r.quantity,
      'ຮ້ານຄ້າ':    r.store_name || '',
      'ການຊຳລະ':    r.payment_method === 'cash' ? 'ເງິນສົດ' : 'ໂອນ',
      'ຊຳລະແລ້ວ':   r.is_paid ? 'ແລ້ວ' : 'ຍັງບໍ່ທັນ',
      'ຜູ້ຮັບ':      r.receiver_name || '',
      'ໝາຍເຫດໂອນ':  r.transfer_note || '',
      'ຜູ້ສົ່ງ':     nameOf(r.created_by),
      'ໝາຍເຫດ':     r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ການກະຈາຍ')
  }

  // ---- Sales Sheet ----
  const { data: sales } = await supabase
    .from('sales')
    .select('*, products(*)')
    .order('created_at', { ascending: false })

  if (sales?.length) {
    const rows = sales.map(r => ({
      'ວັນທີ':      fmtDate(r.created_at),
      'ສິນຄ້າ':    fmtProduct(r),
      'ຈຳນວນຂາຍ':  r.quantity,
      'ຍອດຄ້າງ':   r.remaining ?? '',
      'ຮ້ານ':       r.store_name || '',
      'ຜູ້ຂາຍ':    nameOf(r.created_by),
      'ໝາຍເຫດ':    r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ການຂາຍ')
  }

  // ---- Orders Sheet ----
  const { data: orders } = await supabase
    .from('orders')
    .select('*, products(*)')
    .order('created_at', { ascending: false })

  if (orders?.length) {
    const rows = orders.map(r => ({
      'ວັນທີ':     fmtDate(r.created_at),
      'ສິນຄ້າ':   fmtProduct(r),
      'ຈຳນວນ (ຕຸກ)': r.quantity,
      'ສະຖານະ':   r.status === 'pending' ? 'ລໍຖ້າ' : r.status === 'confirmed' ? 'ຢືນຢັນ' : 'ສົ່ງແລ້ວ',
      'Seller':    nameOf(r.created_by),
      'ໝາຍເຫດ':   r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ການສັ່ງ Seller')
  }

  // ---- Payment Summary Sheet ----
  if (dist?.length) {
    const cash     = dist.filter(d => d.payment_method === 'cash')
    const transfer = dist.filter(d => d.payment_method === 'transfer')
    const paid     = dist.filter(d => d.is_paid)
    const unpaid   = dist.filter(d => !d.is_paid)
    const rows = [
      { 'ປະເພດ': 'ລວມທັງໝົດ',  'ທຸລະກຳ': dist.length,     'ຕຸກ': dist.reduce((s, d) => s + (d.quantity||0), 0) },
      { 'ປະເພດ': 'ເງິນສົດ',     'ທຸລະກຳ': cash.length,     'ຕຸກ': cash.reduce((s, d) => s + (d.quantity||0), 0) },
      { 'ປະເພດ': 'ໂອນ',         'ທຸລະກຳ': transfer.length, 'ຕຸກ': transfer.reduce((s, d) => s + (d.quantity||0), 0) },
      { 'ປະເພດ': 'ຊຳລະແລ້ວ',   'ທຸລະກຳ': paid.length,     'ຕຸກ': paid.reduce((s, d) => s + (d.quantity||0), 0) },
      { 'ປະເພດ': 'ຍັງບໍ່ທັນຊຳລະ', 'ທຸລະກຳ': unpaid.length, 'ຕຸກ': unpaid.reduce((s, d) => s + (d.quantity||0), 0) },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ສະຫຼຸບການຊຳລະ')
  }

  // Guard: ensure at least one sheet exists
  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.json_to_sheet([{ 'ໝາຍເຫດ': 'ຍັງບໍ່ມີຂໍ້ມູນ' }])
    XLSX.utils.book_append_sheet(wb, ws, 'ຂໍ້ມູນ')
  }

  const date = new Date().toLocaleDateString('lo-LA').replace(/\//g, '-')
  XLSX.writeFile(wb, `ລາຍງານ-ແຈ່ວຫອມແຊບ-${date}.xlsx`)
}

function autoFitColumns(ws, data) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const colWidths = keys.map(key => ({
    wch: Math.max(key.length * 2, ...data.map(r => String(r[key] || '').length)) + 2
  }))
  ws['!cols'] = colWidths
}
