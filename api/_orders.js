// Helper pesanan (bukan endpoint — diawali "_" jadi di-skip Vercel).
//
// Status pesanan:
//   unpaid -> QR dibuat, belum dibayar. Otomatis DIHAPUS 30 menit setelah dibuat.
//   paid   -> sudah dibayar (diverifikasi server lewat BuatQris), menunggu diproses admin ("Pending" di mata pembeli)
//   done   -> sudah diproses admin ("Succeed")
//   cancel -> dibatalkan admin
const crypto = require('crypto');
const { kvGet, kvSet, kvDel, kvZrem } = require('./_kv');

const UNPAID_TTL_MS = 30 * 60 * 1000;   // transaksi belum bayar hilang setelah 30 menit
const GATEWAY_CHECK_GAP_MS = 21 * 1000; // BuatQris: maks 1 cek / 20 detik per transaksi
const API = 'https://api.buatqris.site';

function isAdmin(req) {
  const expected = process.env.ADMIN_PASS;
  if (!expected) return false; // ADMIN_PASS belum diset -> tidak ada yang boleh masuk
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const given = String(req.headers['x-admin-pass'] || body.pass || (req.query && req.query.pass) || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

// Tanya BuatQris apakah transaksi sudah dibayar. Return 'success' | 'pending' | 'unknown'
async function gatewayStatus(txnId) {
  const accountId = process.env.BUATQRIS_ACCOUNT_ID;
  const secret = process.env.BUATQRIS_SECRET_TOKEN;
  if (!accountId || !secret || !txnId) return 'unknown';
  try {
    const form = new URLSearchParams({
      action: 'api_check_status', account_id: accountId, secret_token: secret, transaction_id: String(txnId)
    });
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(6000)
    });
    const j = await r.json();
    if (r.status === 429 || (j && j.error === 'rate_limited')) return 'pending';
    if (!j || !j.success || !j.data) return 'unknown';
    return String(j.data.status) === 'success' ? 'success' : 'pending';
  } catch (_) { return 'unknown'; }
}

async function removeOrder(record) {
  try {
    await kvDel(`order:${record.order_id}`);
    await kvZrem('orders:index', record.order_id);
    if (record.txn_id) await kvDel(`txn:${record.txn_id}`);
  } catch (_) {}
}

// Perbarui satu pesanan: cek pembayaran (kalau masih unpaid) & hapus kalau sudah > 30 menit tidak dibayar.
// Return record terbaru, atau null kalau pesanan sudah hilang.
async function refreshOrder(record, opts = {}) {
  if (!record) return null;
  if (record.status !== 'unpaid') return record;

  const now = Date.now();
  const canCheck = opts.allowGateway !== false && record.txn_id && (now - (record.lastCheck || 0) >= GATEWAY_CHECK_GAP_MS);
  if (canCheck) {
    record.lastCheck = now;
    const st = await gatewayStatus(record.txn_id);
    if (st === 'success') {
      record.status = 'paid';
      record.paidAt = now;
      await kvSet(`order:${record.order_id}`, record);
      return record;
    }
    try { await kvSet(`order:${record.order_id}`, record); } catch (_) {}
  }

  if (now - (record.createdAt || 0) > UNPAID_TTL_MS) {
    await removeOrder(record);
    return null;
  }
  return record;
}

function maskText(s) {
  s = String(s || '');
  if (!s || s === '-') return '-';
  return s.length <= 3 ? s[0] + '***' : s.slice(0, 3) + '***';
}

// Versi aman untuk pembeli (tanpa data sensitif)
function publicOrder(r) {
  return {
    order_id: r.order_id,
    produk: r.produk || '',
    jenis: r.jenis || '',
    total: r.total || '',
    username: maskText(r.username),
    status: r.status,
    createdAt: r.createdAt,
    paidAt: r.paidAt || null,
    doneAt: r.doneAt || null,
    expiresAt: r.status === 'unpaid' ? (r.createdAt || 0) + UNPAID_TTL_MS : null
  };
}

function clean(v, max) { return String(v == null ? '' : v).slice(0, max); }

module.exports = { UNPAID_TTL_MS, isAdmin, gatewayStatus, refreshOrder, removeOrder, publicOrder, clean };
