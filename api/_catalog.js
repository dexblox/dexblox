// Helper katalog (bukan endpoint — diawali "_" jadi di-skip Vercel).
//
// Katalog = pengaturan yang bisa diubah admin tanpa deploy ulang:
//   prices : { [idPaket]: harga }                 -> menimpa harga bawaan di index.html
//   media  : { [kunci]: { url, kind, mime, ... } } -> foto / GIF / video pengganti gambar bawaan
//
// Kunci media:  game:<id>  (ikon game di beranda)   pack:<id> (gambar paket)   site:<nama> (hero, iklan, banner)
// Disimpan di Redis pada kunci "catalog:v1".
const { kvGet, kvSet, kvDel, kvPost } = require('./_kv');

const BASE_PRICES = require('./_prices');

const CATALOG_KEY = 'catalog:v1';
const MAX_PRICE = 100000000;
const SITE_SLOTS = ['hero', 'iklan', 'banner', 'logo'];

const PRICE_ID_RE = /^[A-Za-z0-9_.\-]{1,60}$/;
const MEDIA_KEY_RE = /^(game|pack|site):[A-Za-z0-9_.\-]{1,60}$/;

const MIME_KIND = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/avif': 'image',
  'image/gif': 'gif',
  'video/mp4': 'video', 'video/webm': 'video'
};

async function loadCatalog() {
  const c = await kvGet(CATALOG_KEY);
  if (!c || typeof c !== 'object') return { prices: {}, media: {}, updatedAt: 0 };
  return { prices: c.prices || {}, media: c.media || {}, updatedAt: c.updatedAt || 0 };
}

async function saveCatalog(c) {
  c.updatedAt = Date.now();
  await kvSet(CATALOG_KEY, c);
  return c;
}

// Cek bahwa URL media berasal dari upload kita sendiri (Vercel Blob / Redis) atau link https biasa.
function validMediaUrl(u) {
  u = String(u || '');
  if (u.length > 600) return false;
  if (/^\/api\/media\?id=[a-f0-9]{16,40}$/.test(u)) return true;
  try {
    const x = new URL(u);
    return x.protocol === 'https:';
  } catch (_) { return false; }
}

// Hapus file lama dari penyimpanan (best-effort, tidak melempar error).
async function deleteStoredMedia(entry) {
  if (!entry || !entry.url) return;
  try {
    const m = /^\/api\/media\?id=([a-f0-9]+)$/.exec(entry.url);
    if (m) { await kvDel('media:' + m[1]); return; }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token && /\.public\.blob\.vercel-storage\.com\//.test(entry.url)) {
      await fetch('https://blob.vercel-storage.com/delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-api-version': '7' },
        body: JSON.stringify({ urls: [entry.url] })
      });
    }
  } catch (_) {}
}

// Harga resmi sebuah paket menurut server: override dari admin, kalau tidak ada pakai harga bawaan (_prices.js).
// Mengembalikan null bila ID paket tidak dikenal.
async function resolveItem(id) {
  id = String(id || '');
  if (!Object.prototype.hasOwnProperty.call(BASE_PRICES, id)) return null;
  const b = BASE_PRICES[id];
  let price = b.price;
  try {
    const o = Number((await loadCatalog()).prices[id]);
    if (Number.isFinite(o) && o > 0) price = Math.round(o);
  } catch (_) { /* KV bermasalah: pakai harga bawaan */ }
  return { id, price, produk: b.produk };
}

module.exports = {
  resolveItem, BASE_PRICES,
  CATALOG_KEY, MAX_PRICE, SITE_SLOTS, PRICE_ID_RE, MEDIA_KEY_RE, MIME_KIND,
  loadCatalog, saveCatalog, validMediaUrl, deleteStoredMedia, kvPost
};
