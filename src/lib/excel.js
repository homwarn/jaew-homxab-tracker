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

  // ---- Production Sheet ----
  const { data: prod } = await supabase
    .from('production')
    .select('*, products(*), profiles(name)')
    .order('created_at', { ascending: false })

  if (prod?.length) {
    const rows = prod.map(r => ({
      'ວັນທີ': fmtDate(r.created_at),
      'ສິນຄ້າ': fmtProduct(r),
      'ຈຳນວນ (ຕຸກ)': r.quantity,
      'ປາຍທາງ': r.destination === 'retail' ? 'ຂື້ນຮ້ານດາດ' : 'ຂາຍສົ່ງ',
      'ຜູ້ຜະລິດ': r.profiles?.name || '',
      'ໝາຍເຫດ': r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ການຜະລິດ')
  }

  // ---- Distribution Sheet ----
  const { data: dist } = await supabase
    .from('distribution')
    .select('*, products(*), profiles(name)')
    .order('created_at', { ascending: false })

  if (dist?.length) {
    const rows = dist.map(r => ({
      'ວັນທີ': fmtDate(r.created_at),
      'ສິນຄ້າ': fmtProduct(r),
      'ຈຳນວນ (ຕຸກ)': r.quantity,
      'ຮ້ານຄ້າ': r.store_name,
      'ການຊຳລະ': r.payment_method === 'cash' ? 'ເງິນສົດ' : 'ໂອນ',
      'ຜູ້ຮັບເງິນ': r.receiver_name || '',
      'ໝາຍເຫດໂອນ': r.transfer_note || '',
      'ຜູ້ສົ່ງ': r.profiles?.name || '',
      'ໝາຍເຫດ': r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ການກະຈາຍ')
  }

  // ---- Sales Sheet ----
  const { data: sales } = await supabase
    .from('sales')
    .select('*, products(*), profiles(name)')
    .order('created_at', { ascending: false })

  if (sales?.length) {
    const rows = sales.map(r => ({
      'ວັນທີ': fmtDate(r.created_at),
      'ສິນຄ້າ': fmtProduct(r),
      'ຈຳນວນຂາຍ': r.quantity,
      'ຍອດຄ້າງ': r.remaining,
      'ຮ້ານ': r.store_name,
      'ຜູ້ຂາຍ': r.profiles?.name || '',
      'ໝາຍເຫດ': r.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    autoFitColumns(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ການຂາຍ')
  }

  // ---- Payment Summary Sheet ----
  if (dist?.length) {
    const cash = dist.filter(d => d.payment_method === 'cash')
    const transfer = dist.filter(d => d.payment_method === 'transfer')
    const rows = [
      { 'ປະເພດ': 'ລວມທັງໝົດ', 'ຈຳນວນ ທຸລະກຳ': dist.length, 'ຈຳນວນ ສິນຄ້າ': dist.reduce((s, d) => s + d.quantity, 0) },
      { 'ປະເພດ': 'ເງິນສົດ', 'ຈຳນວນ ທຸລະກຳ': cash.length, 'ຈຳນວນ ສິນຄ້າ': cash.reduce((s, d) => s + d.quantity, 0) },
      { 'ປະເພດ': 'ໂອນ', 'ຈຳນວນ ທຸລະກຳ': transfer.length, 'ຈຳນວນ ສິນຄ້າ': transfer.reduce((s, d) => s + d.quantity, 0) },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ສະຫຼຸບການຊຳລະ')
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
