// ─── Invoice generation + print utility ─────────────────────────────────────

export function generateInvoiceNo() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')
  const rnd = String(Math.floor(Math.random() * 9000) + 1000)
  return `INV-${y}${m}${d}-${rnd}`
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('lo-LA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('lo-LA')
}

/**
 * Print an invoice in a new window.
 *
 * @param {Object} opts
 * @param {string}  opts.invoiceNo
 * @param {string}  opts.storeName
 * @param {string}  [opts.storeMapsUrl]
 * @param {string}  opts.distributorName
 * @param {Array}   opts.items  — [{product_name, quantity, unit_price}]
 * @param {string}  opts.paymentMethod  — 'cash' | 'transfer'
 * @param {boolean} opts.isPaid
 * @param {string}  [opts.receiverName]
 * @param {string}  [opts.notes]
 * @param {Date}    [opts.date]
 */
export function printInvoice(opts) {
  const {
    invoiceNo, storeName, storeMapsUrl, distributorName,
    items = [], paymentMethod, isPaid, receiverName, notes,
    date = new Date(),
  } = opts

  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0)

  const itemRows = items.map(i => {
    const subtotal = (i.quantity || 0) * (i.unit_price || 0)
    return `
      <tr>
        <td>${i.product_name || 'ສິນຄ້າ'}</td>
        <td class="num">${fmtNum(i.quantity)}</td>
        <td class="num">${i.unit_price > 0 ? fmtNum(i.unit_price) : '—'}</td>
        <td class="num">${subtotal > 0 ? fmtNum(subtotal) : '—'}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="lo">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoiceNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Phetsarath OT', 'Noto Sans Lao', sans-serif;
    font-size: 13px;
    color: #111;
    padding: 20px;
    max-width: 380px;
    margin: 0 auto;
  }
  .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .header h1 { font-size: 18px; font-weight: 900; letter-spacing: 0.5px; }
  .header p  { font-size: 11px; color: #555; margin-top: 2px; }
  .inv-meta  { display: flex; justify-content: space-between; margin: 10px 0; font-size: 12px; }
  .store-box { background: #f5f5f5; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; }
  .store-box .name { font-weight: 700; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th    { background: #111; color: #fff; padding: 5px 6px; font-size: 11px; text-align: left; }
  td    { padding: 5px 6px; border-bottom: 1px solid #eee; font-size: 12px; }
  .num  { text-align: right; }
  .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #111; border-bottom: none; }
  .pay-info { margin-top: 10px; font-size: 12px; }
  .pay-info .label { color: #555; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .paid   { background: #d4edda; color: #155724; }
  .unpaid { background: #fff3cd; color: #856404; }
  .footer { margin-top: 18px; border-top: 1px dashed #999; padding-top: 10px; text-align: center; font-size: 11px; color: #777; }
  .sig    { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
  @media print {
    body { padding: 0; }
    button { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>🌶 ແຈ່ວຫອມແຊບ</h1>
  <p>ໃບສົ່ງສິນຄ້າ / Delivery Invoice</p>
</div>

<div class="inv-meta">
  <span><b>ເລກທີ:</b> ${invoiceNo}</span>
  <span>${fmtDate(date)}</span>
</div>

<div class="store-box">
  <div class="name">🏪 ${storeName}</div>
  ${storeMapsUrl ? `<div style="font-size:11px;color:#0066cc;margin-top:3px;">📍 ${storeMapsUrl}</div>` : ''}
</div>

<table>
  <thead>
    <tr>
      <th>ສິນຄ້າ</th>
      <th class="num">ຈຳນວນ</th>
      <th class="num">ລາຄາ/ຕຸກ</th>
      <th class="num">ລວມ (₭)</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
    <tr class="total-row">
      <td colspan="3">ລວມທັງໝົດ</td>
      <td class="num">${total > 0 ? fmtNum(total) + ' ₭' : '—'}</td>
    </tr>
  </tbody>
</table>

<div class="pay-info">
  <div><span class="label">ການຊຳລະ: </span>${paymentMethod === 'cash' ? '💵 ເງິນສົດ' : '💳 ໂອນ'}</div>
  ${receiverName ? `<div><span class="label">ຜູ້ຮັບ: </span>${receiverName}</div>` : ''}
  <div style="margin-top:5px;">
    <span class="status ${isPaid ? 'paid' : 'unpaid'}">${isPaid ? '✅ ຊຳລະແລ້ວ' : '⏳ ຄ້າງຊຳລະ'}</span>
  </div>
  ${notes ? `<div style="margin-top:6px;color:#555;">📝 ${notes}</div>` : ''}
</div>

<div class="sig">
  <div>ຜູ້ສົ່ງ: ${distributorName || '___________'}<br><br>ລາຍເຊັນ: ___________</div>
  <div>ຜູ້ຮັບ: ___________<br><br>ລາຍເຊັນ: ___________</div>
</div>

<div class="footer">
  <div>ຂໍຂອບໃຈທີ່ໃຊ້ບໍລິການ ✨</div>
  <div style="margin-top:4px;">ສອບຖາມ: ແຈ່ວຫອມແຊບ</div>
</div>

<div style="text-align:center;margin-top:16px;">
  <button onclick="window.print()" style="padding:8px 24px;background:#FFD600;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
    🖨️ ພິມ Invoice
  </button>
</div>

</body>
</html>`

  const w = window.open('', '_blank', 'width=420,height=700,scrollbars=yes')
  if (!w) { alert('ກ່ຽດ pop-up — ອະນຸຍາດ pop-up ໃນ browser ກ່ອນ'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
}
