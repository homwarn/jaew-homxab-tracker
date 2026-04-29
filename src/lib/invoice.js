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

function qrUrl(data, size = 120) {
  if (!data) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=4&ecc=M`
}

/**
 * Print an invoice in a new window.
 *
 * @param {Object} opts
 * @param {string}  opts.invoiceNo
 * @param {string}  opts.storeName
 * @param {string}  [opts.storeMapsUrl]
 * @param {string}  opts.distributorName
 * @param {Array}   opts.items  — [{product_name, quantity, unit_price, is_promotion}]
 * @param {string}  opts.paymentMethod  — 'cash' | 'transfer'
 * @param {boolean} opts.isPaid
 * @param {string}  [opts.receiverName]
 * @param {string}  [opts.notes]
 * @param {Date}    [opts.date]
 * @param {string}  [opts.bankQrData]   — bank account / PromptPay / QR payment data
 */
export function printInvoice(opts) {
  const {
    invoiceNo, storeName, storeMapsUrl, distributorName,
    items = [], paymentMethod, isPaid, receiverName, notes,
    date = new Date(),
    bankQrData = '',
  } = opts

  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0)

  const itemRows = items.map(i => {
    const subtotal = (i.quantity || 0) * (i.unit_price || 0)
    const promoTag = i.is_promotion ? '<span style="color:#e67e22;font-size:10px;background:#fff3cd;padding:1px 5px;border-radius:10px;margin-left:4px;">🎁Promo</span>' : ''
    return `
      <tr>
        <td>${i.product_name || 'ສິນຄ້າ'}${promoTag}</td>
        <td class="num">${fmtNum(i.quantity)}</td>
        <td class="num">${i.unit_price > 0 ? fmtNum(i.unit_price) : '—'}</td>
        <td class="num">${subtotal > 0 ? fmtNum(subtotal) : '—'}</td>
      </tr>`
  }).join('')

  const storeQr  = storeMapsUrl ? qrUrl(storeMapsUrl) : ''
  const bankQr   = bankQrData   ? qrUrl(bankQrData)   : ''

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
    padding: 16px;
    max-width: 400px;
    margin: 0 auto;
    background: #fff;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    border-bottom: 2px solid #111;
    padding-bottom: 10px;
  }
  .header .logo {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }
  .header-text { flex: 1; }
  .header h1 { font-size: 17px; font-weight: 900; letter-spacing: 0.5px; color: #c0392b; }
  .header .sub { font-size: 11px; color: #555; margin-top: 2px; }
  .inv-meta  { display: flex; justify-content: space-between; margin: 10px 0; font-size: 12px; color: #333; }
  .store-section { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 10px; }
  .store-box { flex: 1; background: #f8f9fa; border-radius: 6px; padding: 8px 10px; border: 1px solid #e9ecef; }
  .store-box .name { font-weight: 700; font-size: 14px; color: #1a1a1a; }
  .store-qr { text-align: center; }
  .store-qr img { border-radius: 4px; }
  .store-qr p { font-size: 9px; color: #777; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th    { background: #2c3e50; color: #fff; padding: 6px; font-size: 11px; text-align: left; }
  td    { padding: 5px 6px; border-bottom: 1px solid #eee; font-size: 12px; }
  .num  { text-align: right; }
  .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #111; border-bottom: none; background: #f8f9fa; }
  .pay-section { display: flex; gap: 10px; align-items: flex-start; margin-top: 10px; }
  .pay-info { flex: 1; font-size: 12px; }
  .pay-info .label { color: #555; }
  .status { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 6px; }
  .paid   { background: #d4edda; color: #155724; }
  .unpaid { background: #fff3cd; color: #856404; }
  .bank-qr { text-align: center; }
  .bank-qr img { border-radius: 4px; }
  .bank-qr p { font-size: 9px; color: #777; margin-top: 2px; }
  .footer { margin-top: 16px; border-top: 1px dashed #ccc; padding-top: 10px; text-align: center; font-size: 11px; color: #888; }
  .sig    { margin-top: 28px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
  .print-btn { text-align: center; margin-top: 16px; }
  @media print {
    body { padding: 0; }
    .print-btn { display: none !important; }
  }
</style>
</head>
<body>

<!-- Header with logo -->
<div class="header">
  <img class="logo" src="/logo.png" alt="Logo" onerror="this.style.display='none'" />
  <div class="header-text">
    <h1>🌶 ແຈ່ວຫອມແຊບ</h1>
    <p class="sub">ໃບສົ່ງສິນຄ້າ / Delivery Invoice</p>
  </div>
</div>

<div class="inv-meta">
  <span><b>ເລກທີ:</b> ${invoiceNo}</span>
  <span>${fmtDate(date)}</span>
</div>

<!-- Store box + Location QR -->
<div class="store-section">
  <div class="store-box">
    <div class="name">🏪 ${storeName}</div>
    ${storeMapsUrl ? `<a href="${storeMapsUrl}" style="font-size:11px;color:#0066cc;margin-top:3px;display:block;word-break:break-all;">📍 ເບິ່ງ Maps</a>` : ''}
    ${distributorName ? `<div style="font-size:11px;color:#555;margin-top:4px;">🚚 ຜູ້ສົ່ງ: ${distributorName}</div>` : ''}
    ${receiverName ? `<div style="font-size:11px;color:#555;">📋 ຜູ້ຮັບ: ${receiverName}</div>` : ''}
  </div>
  ${storeQr ? `
  <div class="store-qr">
    <img src="${storeQr}" width="80" height="80" alt="Location QR" />
    <p>📍 ທີ່ຕັ້ງ</p>
  </div>` : ''}
</div>

<!-- Items table -->
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

<!-- Payment info + Bank QR -->
<div class="pay-section">
  <div class="pay-info">
    <div><span class="label">ການຊຳລະ: </span>${paymentMethod === 'cash' ? '💵 ເງິນສົດ' : '💳 ໂອນ'}</div>
    ${notes ? `<div style="margin-top:5px;color:#555;">📝 ${notes}</div>` : ''}
    <div><span class="status ${isPaid ? 'paid' : 'unpaid'}">${isPaid ? '✅ ຊຳລະແລ້ວ' : '⏳ ຄ້າງຊຳລະ'}</span></div>
  </div>
  ${bankQr ? `
  <div class="bank-qr">
    <img src="${bankQr}" width="90" height="90" alt="Bank QR" />
    <p>💳 ສະແກນຊຳລະ</p>
  </div>` : ''}
</div>

<div class="sig">
  <div>ຜູ້ສົ່ງ: ${distributorName || '___________'}<br><br>ລາຍເຊັນ: ___________</div>
  <div>ຜູ້ຮັບ: ${receiverName || '___________'}<br><br>ລາຍເຊັນ: ___________</div>
</div>

<div class="footer">
  <div>ຂໍຂອບໃຈທີ່ໃຊ້ບໍລິການ ✨ ແຈ່ວຫອມແຊບ</div>
</div>

<div class="print-btn">
  <button onclick="window.print()" style="padding:10px 28px;background:#F5C518;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px;">
    🖨️ ພິມ Invoice
  </button>
  <button onclick="window.close()" style="padding:10px 20px;background:#eee;border:none;border-radius:10px;font-size:14px;cursor:pointer;">
    ✕ ປິດ
  </button>
</div>

</body>
</html>`

  const w = window.open('', '_blank', 'width=460,height=750,scrollbars=yes')
  if (!w) { alert('ກ່ຽດ pop-up — ອະນຸຍາດ pop-up ໃນ browser ກ່ອນ'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
}
