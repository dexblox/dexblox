// POST /api/pakasir-create  { order_id, amount }  -> { success, payment }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });
  try {
    const { order_id, amount } = req.body || {};
    if (!order_id || !amount) {
      return res.status(400).json({ success: false, error: 'order_id dan amount wajib diisi' });
    }

    const slug = process.env.PAKASIR_SLUG;
    const apiKey = process.env.PAKASIR_API_KEY;
    if (!slug || !apiKey) {
      return res.status(500).json({ success: false, error: 'PAKASIR_SLUG / PAKASIR_API_KEY belum diset di Environment Variables' });
    }

    const r = await fetch(
      `https://app.pakasir.com/api/v2/create-transaction/${encodeURIComponent(slug)}/${encodeURIComponent(order_id)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ method: 'qris', amount })
      }
    );
    const data = await r.json();
    if (!r.ok || !data.txn_id) {
      return res.status(502).json({ success: false, error: data.message || data.error || 'Gagal membuat transaksi Pakasir' });
    }

    return res.status(200).json({
      success: true,
      payment: {
        // txn_id dikirim ke frontend supaya bisa langsung dipakai cek status —
        // tidak perlu database untuk menyimpan mapping order_id -> txn_id.
        txn_id: data.txn_id,
        payment_number: data.qr_string,
        fee: data.fee,
        total_payment: data.total_payment,
        expired_at: data.expired_at
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
  }
};
