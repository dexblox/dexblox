# Roblox Proxy API

Proxy publik untuk ambil data dari API Roblox tanpa kena CORS. Cocok buat frontend, tools, atau integrasi lokal.

## 🔗 Endpoint

| Endpoint | Deskripsi |
|----------|-----------|
| `/api/user?username=Yuzie123` | Ambil UserId dari username |
| `/api/avatar?userId=123456`   | Ambil avatar Roblox user |
| `/api/games?userId=123456`    | Ambil daftar game yang dibuat user |
| `/api/gamepasses?gameId=987654` | Ambil daftar gamepass dari game |

## 🚀 Cara Pakai

```js
fetch("https://roblox-proxy.vercel.app/api/user?username=Yuzie123")
  .then(res => res.json())
  .then(data => console.log(data));
