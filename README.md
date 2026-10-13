# Meng Store — siap deploy ke Vercel

Website top up game (Roblox, Mobile Legends, Free Fire, dan lainnya) dengan pembayaran QRIS otomatis lewat **BuatQris**.

## Struktur project

```
index.html                  <- frontend (halaman toko)
assets/                     <- semua gambar & musik (logo.png, ml.png, ff.png, ...)
api/
  _kv.js                    <- helper penyimpanan (bukan endpoint, di-skip Vercel)
  user.js                   <- cari User ID Roblox by username
  avatar.js                 <- ambil foto avatar Roblox
  followers.js              <- ambil jumlah followers Roblox
  buatqris-create.js        <- bikin transaksi QRIS (BuatQris Open API)
  buatqris-status.js        <- cek status pembayaran QRIS
  order-save.js             <- simpan pesanan baru
  order-status-update.js    <- admin: tandai pesanan selesai
  order-list.js             <- admin: lihat semua pesanan
package.json
.env.example
```

## 1. Push ke GitHub

```
git init
git add .
git commit -m "Meng Store - vercel ready"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

Atau upload file lewat tombol **Add file → Upload files** di GitHub.

## 2. Import ke Vercel

1. Buka https://vercel.com/new, pilih repo GitHub kamu → Import.
2. Framework preset biarkan "Other". Tidak perlu build command (project ini statis + serverless function).
3. Klik **Deploy** dulu (nanti error karena env var belum diisi, itu wajar).

## 3. Tambah Storage (KV) untuk simpan pesanan

Vercel serverless function itu stateless, jadi pesanan disimpan di Redis (KV).

1. Di dashboard project → tab **Storage** → **Create Database** → pilih **KV** (atau Upstash Redis dari Marketplace).
2. Connect database itu ke project kamu.
3. Vercel otomatis menambahkan env var `KV_REST_API_URL` dan `KV_REST_API_TOKEN` — tidak perlu diisi manual.

## 4. Isi Environment Variables

Di **Settings → Environment Variables**, tambahkan:

| Key | Value |
| --- | --- |
| `BUATQRIS_ACCOUNT_ID` | Account ID dari dasbor BuatQris (menu Open API) |
| `BUATQRIS_SECRET_TOKEN` | Secret token dari BuatQris (aktifkan opsi **Sensitive**) |
| `BUATQRIS_TEST` | `0` untuk live, `1` untuk mode sandbox (tes tanpa uang asli) |
| `ADMIN_PASS` | Password admin (harus **sama** dengan yang ada di `index.html`) |

Opsional:

| Key | Value |
| --- | --- |
| `BUATQRIS_FEE_BY` | `buyer` (default, biaya admin ditanggung pembeli) atau `user` (ditanggung toko) |
| `BUATQRIS_METHOD` | Metode QRIS tertentu, mis. `qris_two` |

> Daftar/lihat Account ID & secret token di https://app.buatqris.site (menu Open API).
> Jangan pernah menaruh secret token di `index.html` atau commit ke GitHub.

## 5. Samakan password admin

Buka `index.html`, cari baris:

```js
const ADMIN_PASS = '...';
```

Ganti isinya dengan password yang sama persis dengan env var `ADMIN_PASS` di Vercel. Ini dipakai untuk gerbang login panel admin di sisi tampilan; validasi sesungguhnya tetap dicek ulang di server (`order-list.js`, `order-status-update.js`).

Pakai password yang kuat, bukan angka sederhana.

## 6. Redeploy

Setelah semua env var terisi → **Deployments → ⋮ → Redeploy**.
Setiap kali env var diubah, redeploy lagi supaya terbaca.

## Mode sandbox (tes pembayaran)

1. Set `BUATQRIS_TEST` = `1`, lalu Redeploy.
2. Di dasbor BuatQris, pindah ke mode **Sandbox**.
3. Buat pesanan di website sampai QR muncul; transaksi akan tercatat sebagai sandbox.
4. Selesai tes: set `BUATQRIS_TEST` = `0`, Redeploy, dan kembalikan dasbor ke mode **Real**.

Kalau lupa mengembalikan ke `0`, pembayaran pelanggan berjalan di sandbox dan tidak ada uang yang masuk.

## Catatan penting

- Cek status pembayaran dibatasi BuatQris **1x per 20 detik** per transaksi, jadi website mengecek otomatis tiap ±21 detik.
- Domain Vercel bawaan (`nama-project.vercel.app`) sudah langsung bisa dipakai, atau hubungkan domain sendiri lewat **Settings → Domains**.
- Gambar dan musik ada di folder `assets/`. Kalau menambah file baru, taruh di sana dan panggil dengan path `assets/nama-file.png`.
- 
