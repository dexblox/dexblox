# Dex Blox Store — siap deploy ke Vercel

Struktur project ini:

```
index.html                     <- frontend kamu (sudah diubah: path API tanpa .php)
api/
  _kv.js                       <- helper penyimpanan (bukan endpoint, di-skip Vercel)
  user.js                      <- cari User ID Roblox by username
  avatar.js                    <- ambil foto avatar Roblox
  followers.js                 <- ambil jumlah followers Roblox
  pakasir-create.js            <- bikin transaksi QRIS (Pakasir API v2)
  pakasir-status.js            <- cek status pembayaran QRIS
  order-save.js                <- simpan pesanan baru
  order-status-update.js       <- admin: tandai pesanan selesai
  order-list.js                <- admin: lihat semua pesanan
package.json
.env.example
```

## 1. Push ke GitHub

```bash
git init
git add .
git commit -m "Dex Blox store - vercel ready"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

## 2. Import ke Vercel

1. Buka https://vercel.com/new, pilih repo GitHub kamu → Import.
2. Framework preset biarkan "Other". Tidak perlu build command (project ini statis + serverless function).
3. Klik **Deploy** dulu (nanti error karena env var belum diisi, itu wajar).

## 3. Tambah Storage (KV) untuk simpan pesanan

Vercel serverless function itu stateless — tidak bisa menulis file secara permanen. Makanya pesanan disimpan di Redis (KV):

1. Di dashboard project → tab **Storage** → **Create Database** → pilih **KV** (atau Upstash Redis dari Marketplace).
2. Connect database itu ke project kamu.
3. Vercel otomatis menambahkan env var `KV_REST_API_URL` dan `KV_REST_API_TOKEN` — kamu tidak perlu isi manual.

## 4. Isi Environment Variables

Di **Settings → Environment Variables**, tambahkan:

| Key | Value |
|---|---|
| `PAKASIR_SLUG` | slug proyek Pakasir kamu |
| `PAKASIR_API_KEY` | API key proyek Pakasir kamu |
| `ADMIN_PASS` | password admin (harus **sama** dengan yang ada di `index.html`) |

> Daftar/lihat slug & API key di https://app.pakasir.com (halaman detail Proyek).

## 5. Samakan password admin

Buka `index.html`, cari baris:

```js
const ADMIN_PASS = '54321';
```

Ganti `'54321'` dengan password yang sama persis dengan env var `ADMIN_PASS` di Vercel. Ini dipakai untuk gerbang login panel admin di sisi tampilan; validasi sesungguhnya tetap dicek ulang di server (`order-list.js`, `order-status-update.js`).

## 6. Redeploy

Setelah semua env var terisi → **Deployments → ⋮ → Redeploy**.

## Catatan penting

- **Pakasir API v1 akan dimatikan 20 Oktober 2026.** Kode ini sudah pakai **v2** supaya tidak perlu migrasi lagi.
- Domain Vercel bawaan (`nama-project.vercel.app`) sudah langsung bisa dipakai, atau hubungkan domain sendiri lewat **Settings → Domains**.
- Endpoint `/api/user`, `/api/avatar`, `/api/followers` memanggil API publik Roblox — tidak butuh API key tambahan.
- 
