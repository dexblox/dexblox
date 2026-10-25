// Helper pesanan (bukan endpoint — diawali "_" jadi di-skip Vercel).
//
// Status pesanan:
//   unpaid  -> QR dibuat, belum dibayar. Setelah 30 menit jadi "expired" (setelah dicek terakhir kali ke BuatQris).
//   expired -> pembeli tidak jadi bayar. Disimpan sebagai riwayat (EXPIRED_KEEP_MS), bisa dihapus admin. Tidak tampil ke pembeli.
//   paid   -> sudah dibayar (diverifikasi server lewat BuatQris), menunggu diproses admin ("Pending" di mata pembeli)
//   done   -> sudah diproses admin ("Succeed")
//   cancel -> dibatalkan admin
const crypto = require('crypto');
const { kvGet, kvSet, kvDel, kvZrem } = require('./_kv');

const UNPAID_TTL_MS = 30 * 60 * 1000;   // transaksi belum bayar hilang setelah 30 menit
const EXPIRED_KEEP_MS = 7 * 24 * 60 * 60 * 1000; // riwayat "tidak jadi" dihapus otomatis setelah 7 hari
const GATEWAY_CHECK_GAP_MS = 21 * 1000; // BuatQris: maks 1 cek / 20 detik per transaksi
const API = 'https://api.buatqris.site';

// Sesi admin: token bertanda tangan (HMAC dari ADMIN_PASS) supaya password mentah tidak perlu disimpan di browser.
// Format: s1.<kedaluwarsa-ms>.<hmac-hex>. Mengganti ADMIN_PASS otomatis membatalkan semua sesi.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function sessionSign(exp) {
  return crypto.createHmac('sha256', String(process.env.ADMIN_PASS || '')).update('admin-session:' + exp).digest('hex');
}
function makeSession() {
  const exp = Date.now() + SESSION_TTL_MS;
  return 's1.' + exp + '.' + sessionSign(exp);
}
function checkSession(tok) {
  const m = /^s1\.(\d{10,15})\.([a-f0-9]{64})$/.exec(String(tok || ''));
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > Date.now())) return false;
  const a = Buffer.from(m[2], 'hex'), b = Buffer.from(sessionSign(exp), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAdmin(req) {
  const expected = process.env.ADMIN_PASS;
  if (!expected) return false; // ADMIN_PASS belum diset -> tidak ada yang boleh masuk
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const given = String(req.headers['x-admin-pass'] || body.pass || (req.query && req.query.pass) || '');
  if (checkSession(given)) return true;
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
  if (record.status === 'expired') {
    if (Date.now() - (record.expiredAt || record.createdAt || 0) > EXPIRED_KEEP_MS) { await removeOrder(record); return null; }
    return record;
  }
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
    // Cek terakhir ke BuatQris supaya pembayaran yang telat masuk tidak hilang begitu saja
    if (opts.allowGateway !== false && record.txn_id && !canCheck && await gatewayStatus(record.txn_id) === 'success') {
      record.status = 'paid'; record.paidAt = now;
      await kvSet(`order:${record.order_id}`, record);
      return record;
    }
    record.status = 'expired'; record.expiredAt = now;
    try { await kvSet(`order:${record.order_id}`, record); } catch (_) {}
    return record;
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

module.exports = { UNPAID_TTL_MS, EXPIRED_KEEP_MS, isAdmin, makeSession, gatewayStatus, refreshOrder, removeOrder, publicOrder, clean };
