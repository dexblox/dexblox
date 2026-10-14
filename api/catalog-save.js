// POST /api/catalog-save  (header x-admin-pass)
// body: { prices?: { [id]: angka | null }, media?: { [kunci]: { url, kind, ... } | null } }
// null = hapus override (kembali ke harga / gambar bawaan).  ->  { success, catalog }
const { isAdmin } = require('./_orders');
const { rateLimit } = require('./_ratelimit');
const {
  MAX_PRICE, PRICE_ID_RE, MEDIA_KEY_RE, SITE_SLOTS, loadCatalog, saveCatalog, validMediaUrl, deleteStoredMedia
} = require('./_catalog');

const KINDS = ['image', 'gif', 'video'];
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });

  const rl = await rateLimit(req, 'csave', 40, 60);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan' });
  if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Password admin salah' });

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const cat = await loadCatalog();
    const trash = [];

    if (body.prices && typeof body.prices === 'object') {
      const ids = Object.keys(body.prices);
      if (ids.length > 600) return res.status(400).json({ success: false, error: 'Terlalu banyak perubahan harga' });
      for (const id of ids) {
        if (!PRICE_ID_RE.test(id)) return res.status(400).json({ success: false, error: 'ID paket tidak valid: ' + clip(id, 30) });
        const v = body.prices[id];
        if (v === null) { delete cat.prices[id]; continue; }
        const n = Math.round(Number(v));
        if (!Number.isFinite(n) || n < 1 || n > MAX_PRICE) {
          return res.status(400).json({ success: false, error: 'Harga ' + clip(id, 30) + ' harus antara Rp1 dan Rp' + MAX_PRICE.toLocaleString('id-ID') });
        }
        cat.prices[id] = n;
      }
    }

    if (body.media && typeof body.media === 'object') {
      for (const key of Object.keys(body.media)) {
        if (!MEDIA_KEY_RE.test(key)) return res.status(400).json({ success: false, error: 'Kunci media tidak valid: ' + clip(key, 30) });
        if (key.startsWith('site:') && !SITE_SLOTS.includes(key.slice(5))) {
          return res.status(400).json({ success: false, error: 'Slot situs tidak dikenal: ' + clip(key, 30) });
        }
        const v = body.media[key];
        const old = cat.media[key];
        if (v === null) { if (old) trash.push(old); delete cat.media[key]; continue; }
        if (!v || typeof v !== 'object' || !validMediaUrl(v.url) || !KINDS.includes(v.kind)) {
          return res.status(400).json({ success: false, error: 'Data media tidak valid untuk ' + clip(key, 30) });
        }
        const next = {
          url: v.url, kind: v.kind, mime: clip(v.mime, 40), size: Math.max(0, Number(v.size) || 0),
          caption: clip(v.caption, 120), link: /^https?:\/\//i.test(String(v.link || '')) ? clip(v.link, 300) : '',
          updatedAt: Date.now()
        };
        if (old && old.url !== next.url) trash.push(old); // file lama dibersihkan setelah disimpan
        cat.media[key] = next;
      }
    }

    await saveCatalog(cat);
    for (const o of trash) await deleteStoredMedia(o);
    return res.status(200).json({ success: true, catalog: cat });
  } catch (e) {
    console.error('catalog-save:', e);
    return res.status(500).json({ success: false, error: 'Gagal menyimpan katalog: ' + String((e && e.message) || e).slice(0, 200) });
  }
};
