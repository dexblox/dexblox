// Vercel Serverless Function — cek status transaksi BuatQris.
// Catatan: BuatQris membatasi 1 cek / 20 detik per transaksi (HTTP 429 + retry_after).
const API = 'https://api.buatqris.site';

module.exports = async (req, res) => {
  const accountId = process.env.BUATQRIS_ACCOUNT_ID;
  const secret = process.env.BUATQRIS_SECRET_TOKEN;
  if (!accountId || !secret) return res.status(500).json({ error: 'Konfigurasi pembayaran belum lengkap' });

  const txnId = String((req.query && req.query.txn_id) || '').trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(txnId)) return res.status(400).json({ error: 'txn_id tidak valid' });

  const form = new URLSearchParams({
    action: 'api_check_status',
    account_id: accountId,
    secret_token: secret,
    transaction_id: txnId
  });

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const j = await r.json();

    if (r.status === 429 || (j && j.error === 'rate_limited')) {
      return res.status(200).json({ transaction: { status: 'pending' }, retry_after: Number(j && j.retry_after) || 20 });
    }
    if (!j || !j.success || !j.data) {
      return res.status(200).json({ transaction: { status: 'pending' } });
    }
    const st = String(j.data.status || 'pending');
    // Frontend memakai status 'completed' sebagai tanda lunas.
    return res.status(200).json({
      transaction: { status: st === 'success' ? 'completed' : st, raw_status: st }
    });
  } catch (e) {
    return res.status(200).json({ transaction: { status: 'pending' } });
  }
};
