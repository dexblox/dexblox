export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, robux, promo } = req.body;
  if (!username || !robux) {
    return res.status(400).json({ error: "Username dan Robux wajib diisi" });
  }

  let harga = (robux / 100) * 10000;
  if (promo === "DEX10OFF") {
    harga = Math.round(harga * 0.9);
  }
  const gamepassId = Math.round((robux / 100) * 143);

  try {
    const response = await fetch("https://app.pakasir.com/api/v1/invoice", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PAKASIR_API_KEY}`, // API key dari env
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        slug: "dexblox",
        amount: harga,
        description: `Topup Robux untuk ${username} - Paket: ${robux} Robux (Gamepass ID: ${gamepassId})`
      })
    });

    const data = await response.json();
    if (response.ok && data.checkout_url) {
      res.status(200).json({ checkout_url: data.checkout_url });
    } else {
      res.status(500).json({ error: data.error || "Gagal membuat invoice" });
    }
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
}
