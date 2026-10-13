// GET/POST /api/order-list  (header x-admin-pass)  ->  { orders: [...], stats: {...} }
const { kvGet, kvZrem, kvZrangeRev } = require('./_kv');
const { isAdmin, refreshOrder } = require('./_orders');
const { rateLimit } = require('./_ratelimit');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan' });

  const rl = await rateLimit(req, 'olist', 30, 60);
  if (!rl.ok) return res.status(429).json({ error: 'Terlalu banyak permintaan' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Password admin salah' });

  try {
    const ids = (await kvZrangeRev('orders:index', 0, 199)) || []; // 200 pesanan terbaru
    let gatewayBudget = 12; // batasi jumlah cek ke BuatQris per permintaan
    const records = await Promise.all(ids.map(async (id) => {
      const rec = await kvGet(`order:${id}`);
      if (!rec) { try { await kvZrem('orders:index', id); } catch (_) {} return null; }
      if (rec.status === 'unpaid') {
        const allow = gatewayBudget > 0; if (allow) gatewayBudget--;
        return refreshOrder(rec, { allowGateway: allow });
      }
      return rec;
    }));

    const orders = records.filter(Boolean);
    const stats = { total: orders.length, unpaid: 0, paid: 0, done: 0, cancel: 0, revenue: 0, revenueToday: 0 };
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    for (const o of orders) {
      if (stats[o.status] != null) stats[o.status]++;
      if (o.status === 'paid' || o.status === 'done') {
        stats.revenue += Number(o.amount) || 0;
        if ((o.paidAt || o.createdAt) >= startOfDay.getTime()) stats.revenueToday += Number(o.amount) || 0;
      }
    }
    return res.status(200).json({ orders, stats });
  } catch (e) {
    console.error('order-list:', e);
    return res.status(500).json({ error: 'Gagal mengambil daftar pesanan: ' + String((e && e.message) || e).slice(0, 220) });
  }
};
