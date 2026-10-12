// Vercel Serverless Function — buat transaksi QRIS via BuatQris Open API.
// Env wajib (Vercel → Settings → Environment Variables):
//   BUATQRIS_ACCOUNT_ID, BUATQRIS_SECRET_TOKEN
// Env opsional: BUATQRIS_FEE_BY ("buyer" | "user", default "buyer"), BUATQRIS_METHOD (mis. qris_two)
const API = 'https://api.buatqris.site';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const accountId = process.env.BUATQRIS_ACCOUNT_ID;
  const secret = process.env.BUATQRIS_SECRET_TOKEN;
  if (!accountId || !secret) return res.status(500).json({ success: false, error: 'Konfigurasi pembayaran belum lengkap' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const orderId = String(body.order_id || '').slice(0, 40);
  const amount = Math.round(Number(body.amount));
  if (!orderId || !Number.isFinite(amount) || amount < 1000 || amount > 5000000)
    return res.status(400).json({ success: false, error: 'Nominal tidak valid (min Rp1.000)' });

  // Donasi boleh minta fee ditanggung toko; selain itu pakai default dari env.
  const feeBy = body.fee_by === 'user' ? 'user' : (process.env.BUATQRIS_FEE_BY === 'user' ? 'user' : 'buyer');

  const form = new URLSearchParams({
    action: 'api_create_qris',
    account_id: accountId,
    secret_token: secret,
    amount: String(amount),
    description: ('Meng Store ' + orderId).slice(0, 100),
    fee_by: feeBy,
    app_name: 'Meng Store'
  });
  if (process.env.BUATQRIS_METHOD) form.set('qris_method', process.env.BUATQRIS_METHOD);
  if (process.env.BUATQRIS_TEST === '1') form.set('test', '1');

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const j = await r.json();
    if (!j || !j.success || !j.data) {
      return res.status(502).json({ success: false, error: (j && j.message) || 'Gagal membuat transaksi' });
    }
    const d = j.data;
    const total = Number(d.total_amount) || amount;
    return res.status(200).json({
      success: true,
      payment: {
        txn_id: String(d.transaction_id),
        fee: Math.max(total - amount, 0),   // biaya admin + kode unik yang ditanggung pembeli
        total_payment: total,
        payment_number: null,               // BuatQris tidak memberi string QRIS mentah
        qr_image: d.qr_url || d.qris_image || null,
        payment_url: d.payment_url || null,
        expired_at: d.expired_at || null
      }
    });
  } catch (e) {
    return res.status(502).json({ success: false, error: 'Gateway pembayaran tidak merespons' });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
