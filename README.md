# Meng Store — siap deploy ke Vercel

Website top up game (Roblox, Mobile Legends, Free Fire, dan lainnya) dengan pembayaran QRIS otomatis lewat **BuatQris**.

## Struktur project

```
index.html                  <- frontend (halaman toko)
assets/                     <- semua gambar & musik (logo.png, ml.png, ff.png, ...)
api/
  _kv.js                    <- helper penyimpanan (bukan endpoint, di-skip Vercel)
  _orders.js                <- helper pesanan: aturan 30 menit, verifikasi bayar (bukan endpoint)
  user.js                   <- cari User ID Roblox by username
  avatar.js                 <- ambil foto avatar Roblox
  followers.js              <- ambil jumlah followers Roblox
  buatqris-create.js        <- bikin transaksi QRIS (BuatQris Open API)
  buatqris-status.js        <- cek status pembayaran QRIS
  order-save.js             <- simpan transaksi saat QR dibuat (status awal: unpaid)
  order-lookup.js           <- pembeli: riwayat & cek status pesanan
  order-status-update.js    <- admin: tandai Succeed / Pending / Batal
  order-list.js             <- admin: dashboard pesanan + statistik
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
| `ADMIN_PASS` | Password admin (hanya di sini, divalidasi server — tidak ada lagi di `index.html`) |

Opsional:

| Key | Value |
| --- | --- |
| `BUATQRIS_FEE_BY` | `buyer` (default, biaya admin ditanggung pembeli) atau `user` (ditanggung toko) |
| `BUATQRIS_METHOD` | Metode QRIS tertentu, mis. `qris_two` |

> Daftar/lihat Account ID & secret token di https://app.buatqris.site (menu Open API).
> Jangan pernah menaruh secret token di `index.html` atau commit ke GitHub.

## 5. Alur pesanan & panel admin

| Status | Tampil ke pembeli | Arti |
|---|---|---|
| `unpaid` | Menunggu Pembayaran | QR dibuat, belum dibayar. **Dihapus otomatis 30 menit** setelah dibuat |
| `paid` | Pending | Sudah dibayar (diverifikasi server lewat BuatQris), menunggu diproses admin |
| `done` | Succeed | Admin sudah menekan tombol **Succeed** |
| `cancel` | Dibatalkan | Dibatalkan admin |

- Pembeli melihat riwayat lewat ikon 🔍 **Cek Pesanan** (tersimpan di browser + dicek ke server setiap 20 detik).
- Admin: ikon ⚙️ → masukkan `ADMIN_PASS` → dashboard (statistik, filter, pencarian, tombol Succeed, auto-refresh 20 detik).
- Sebelum menghapus transaksi kedaluwarsa, server mengecek ke BuatQris dulu: kalau ternyata sudah dibayar, pesanan dinaikkan ke Pending (bukan dihapus), jadi pembeli yang menutup tab setelah bayar tetap aman.

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
