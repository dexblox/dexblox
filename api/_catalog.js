// Helper katalog (bukan endpoint — diawali "_" jadi di-skip Vercel).
//
// Katalog = pengaturan yang bisa diubah admin tanpa deploy ulang:
//   prices : { [idPaket]: harga }                 -> menimpa harga bawaan di index.html
//   media  : { [kunci]: { url, kind, mime, ... } } -> foto / GIF / video pengganti gambar bawaan
//   shop   : { items, extra, meta, products }      -> jumlah/nama/deskripsi paket, paket tambahan,
//                                                     deskripsi produk, dan produk baru (game, cloud phone, aplikasi)
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

const emptyShop = () => ({ items: {}, extra: {}, meta: {}, products: [] });

async function loadCatalog() {
  const c = await kvGet(CATALOG_KEY);
  if (!c || typeof c !== 'object') return { prices: {}, media: {}, shop: emptyShop(), updatedAt: 0 };
  const sh = (c.shop && typeof c.shop === 'object') ? c.shop : {};
  return {
    prices: c.prices || {}, media: c.media || {},
    shop: { items: sh.items || {}, extra: sh.extra || {}, meta: sh.meta || {}, products: Array.isArray(sh.products) ? sh.products : [] },
    updatedAt: c.updatedAt || 0
  };
}

// ── Validasi & pembersihan data toko (produk, paket, deskripsi) dari admin ──
const GROUP_RE = /^[a-z0-9]{1,12}$/;
const BASE_ID_RE = /^[A-Za-z0-9_.\-]{1,60}$/;
const PRODUCT_ID_RE = /^u-[a-z0-9]{3,10}$/;
const EXTRA_ID_RE = /^x-[a-z0-9]{1,12}-[a-z0-9]{3,10}$/;
const KINDS_SHOP = ['game', 'cloud', 'app'];
const SHOP_MIN_PRICE = 1000;      // BuatQris: minimal Rp1.000
const SHOP_MAX_PRICE = 5000000;   // sama dengan batas buatqris-create
const MAX_PRODUCTS = 60, MAX_PACKS = 80, MAX_EXTRA = 60;
const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
class ShopError extends Error {}
function bad(msg) { throw new ShopError(msg); }

function cleanPrice(v, label) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < SHOP_MIN_PRICE || n > SHOP_MAX_PRICE) {
    bad('Harga ' + label + ' harus antara Rp' + SHOP_MIN_PRICE.toLocaleString('id-ID') + ' dan Rp' + SHOP_MAX_PRICE.toLocaleString('id-ID'));
  }
  return n;
}
function cleanTag(v) { const t = txt(v, 12).toUpperCase(); return t; }

function sanitizeShop(input) {
  const inp = (input && typeof input === 'object') ? input : {};
  const out = emptyShop();

  // items: perubahan pada paket bawaan  { [idBawaan]: { qty?, name?, desc?, tag?, hidden?, produk? } }
  const items = (inp.items && typeof inp.items === 'object') ? inp.items : {};
  const itemIds = Object.keys(items);
  if (itemIds.length > 800) bad('Terlalu banyak perubahan paket');
  for (const id of itemIds) {
    if (!BASE_ID_RE.test(id)) bad('ID paket tidak valid: ' + txt(id, 30));
    const o = items[id]; if (!o || typeof o !== 'object') continue;
    const c = {};
    if (o.qty != null && o.qty !== '') {
      const q = Math.round(Number(o.qty));
      if (!Number.isFinite(q) || q < 1 || q > 100000000) bad('Jumlah untuk ' + txt(id, 30) + ' tidak valid');
      c.qty = q;
    }
    if (o.name != null && txt(o.name, 80)) c.name = txt(o.name, 80);
    if (o.desc != null && txt(o.desc, 200)) c.desc = txt(o.desc, 200);
    if (o.tag != null) c.tag = cleanTag(o.tag);          // '' = hapus label
    if (o.hidden) c.hidden = true;
    if (o.produk != null && txt(o.produk, 120)) c.produk = txt(o.produk, 120);
    if (Object.keys(c).length) out.items[id] = c;
  }

  // extra: paket tambahan di grup bawaan  { [grup]: [ { id, qty?, name?, price, desc?, tag?, cat?, produk } ] }
  const extra = (inp.extra && typeof inp.extra === 'object') ? inp.extra : {};
  const seen = new Set();
  for (const g of Object.keys(extra)) {
    if (!GROUP_RE.test(g)) bad('Grup tidak valid: ' + txt(g, 20));
    const arr = Array.isArray(extra[g]) ? extra[g] : [];
    if (arr.length > MAX_EXTRA) bad('Terlalu banyak paket tambahan di grup ' + g);
    const list = [];
    for (const e of arr) {
      if (!e || typeof e !== 'object') continue;
      const id = String(e.id || '');
      if (!EXTRA_ID_RE.test(id) || seen.has(id)) bad('ID paket tambahan tidak valid');
      seen.add(id);
      const c = { id, price: cleanPrice(e.price, txt(e.name || e.qty || id, 30)) };
      if (e.qty != null && e.qty !== '') {
        const q = Math.round(Number(e.qty));
        if (!Number.isFinite(q) || q < 1 || q > 100000000) bad('Jumlah paket tambahan tidak valid');
        c.qty = q;
      }
      if (txt(e.name, 80)) c.name = txt(e.name, 80);
      if (c.qty == null && !c.name) bad('Paket tambahan butuh jumlah atau nama');
      if (txt(e.desc, 200)) c.desc = txt(e.desc, 200);
      if (cleanTag(e.tag)) c.tag = cleanTag(e.tag);
      if (txt(e.cat, 40)) c.cat = txt(e.cat, 40);
      c.produk = txt(e.produk, 120) || String(c.name || c.qty);
      list.push(c);
    }
    if (list.length) out.extra[g] = list;
  }

  // meta: deskripsi / subjudul / sembunyikan produk bawaan  { [kunci]: { sub?, desc?, hidden? } }
  const meta = (inp.meta && typeof inp.meta === 'object') ? inp.meta : {};
  for (const k of Object.keys(meta)) {
    if (!GROUP_RE.test(k)) bad('Kunci produk tidak valid: ' + txt(k, 20));
    const m = meta[k]; if (!m || typeof m !== 'object') continue;
    const c = {};
    if (txt(m.sub, 120)) c.sub = txt(m.sub, 120);
    if (txt(m.desc, 600)) c.desc = txt(m.desc, 600);
    if (m.hidden) c.hidden = true;
    if (Object.keys(c).length) out.meta[k] = c;
  }

  // products: produk baru  [ { id, kind, name, sub, desc, idLabel, hidden, packs:[ { id, name, price, desc, tag } ] } ]
  const prods = Array.isArray(inp.products) ? inp.products : [];
  if (prods.length > MAX_PRODUCTS) bad('Maksimal ' + MAX_PRODUCTS + ' produk baru');
  const pids = new Set();
  for (const p of prods) {
    if (!p || typeof p !== 'object') continue;
    const id = String(p.id || '');
    if (!PRODUCT_ID_RE.test(id) || pids.has(id)) bad('ID produk tidak valid');
    pids.add(id);
    if (!KINDS_SHOP.includes(p.kind)) bad('Jenis produk tidak valid');
    const name = txt(p.name, 50); if (!name) bad('Nama produk wajib diisi');
    const c = { id, kind: p.kind, name, sub: txt(p.sub, 120), desc: txt(p.desc, 600), idLabel: txt(p.idLabel, 40) || (p.kind === 'game' ? 'Player ID' : 'Email / No. WhatsApp'), hidden: !!p.hidden, packs: [] };
    const packs = Array.isArray(p.packs) ? p.packs : [];
    if (packs.length > MAX_PACKS) bad('Maksimal ' + MAX_PACKS + ' paket per produk');
    const pk = new Set();
    for (const k of packs) {
      if (!k || typeof k !== 'object') continue;
      const kid = String(k.id || '');
      if (!kid.startsWith(id + '-') || !/^u-[a-z0-9]{3,10}-[a-z0-9]{1,10}$/.test(kid) || pk.has(kid)) bad('ID paket tidak valid di ' + name);
      pk.add(kid);
      const kn = txt(k.name, 80); if (!kn) bad('Nama paket di ' + name + ' wajib diisi');
      const q = { id: kid, name: kn, price: cleanPrice(k.price, kn) };
      if (txt(k.desc, 200)) q.desc = txt(k.desc, 200);
      if (cleanTag(k.tag)) q.tag = cleanTag(k.tag);
      c.packs.push(q);
    }
    out.products.push(c);
  }
  return out;
}

// Id media milik produk/paket kustom yang sudah tidak ada -> daftar kunci media yatim
function orphanMediaKeys(media, shop) {
  const keepGame = new Set(shop.products.map(p => p.id));
  const keepPack = new Set();
  shop.products.forEach(p => p.packs.forEach(k => keepPack.add(k.id)));
  Object.keys(shop.extra).forEach(g => shop.extra[g].forEach(e => keepPack.add(e.id)));
  return Object.keys(media || {}).filter(k =>
    (k.startsWith('game:u-') && !keepGame.has(k.slice(5))) ||
    ((k.startsWith('pack:u-') || k.startsWith('pack:x-')) && !keepPack.has(k.slice(5))));
}

async function saveCatalog(c) {
  c.updatedAt = Date.now();
  // POST (bukan lewat URL) karena katalog bisa besar
  await kvPost(['SET', CATALOG_KEY, JSON.stringify(c)]);
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

// Harga resmi sebuah paket menurut server: paket bawaan (+ perubahan admin), paket tambahan, atau paket produk baru.
// Mengembalikan null bila ID paket tidak dikenal atau disembunyikan admin.
async function resolveItem(id) {
  id = String(id || '');
  let cat = null;
  try { cat = await loadCatalog(); } catch (_) { /* KV bermasalah: hanya paket bawaan yang dikenal */ }

  if (/^u-/.test(id) || /^x-/.test(id)) {
    if (!cat) return null;
    if (id.startsWith('u-')) {
      for (const p of cat.shop.products) {
        if (p.hidden || !id.startsWith(p.id + '-')) continue;
        const k = p.packs.find(x => x.id === id);
        if (k) return { id, price: k.price, produk: (p.name + ' – ' + k.name).slice(0, 120) };
      }
      return null;
    }
    for (const g of Object.keys(cat.shop.extra)) {
      const e = cat.shop.extra[g].find(x => x.id === id);
      if (e) return { id, price: e.price, produk: e.produk };
    }
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(BASE_PRICES, id)) return null;
  const b = BASE_PRICES[id];
  let price = b.price, produk = b.produk;
  if (cat) {
    const o = Number(cat.prices[id]);
    if (Number.isFinite(o) && o > 0) price = Math.round(o);
    const it = cat.shop.items[id];
    if (it) { if (it.hidden) return null; if (it.produk) produk = it.produk; }
  }
  return { id, price, produk };
}

module.exports = {
  resolveItem, BASE_PRICES,
  CATALOG_KEY, MAX_PRICE, SITE_SLOTS, PRICE_ID_RE, MEDIA_KEY_RE, MIME_KIND,
  loadCatalog, saveCatalog, validMediaUrl, deleteStoredMedia, kvPost,
  sanitizeShop, orphanMediaKeys, ShopError
};
