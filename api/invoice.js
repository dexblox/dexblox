export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, robux } = req.body;
  if (!username || !robux) {
    return res.status(400).json({ error: "Username dan Robux wajib diisi" });
  }

  const hargaPer100 = 13000; // contoh harga
  const amount = (robux / 100) * hargaPer100;
  const gamepassId = Math.round((robux / 100) * 143);

  try {
    console.log("=== Membuat invoice ===");
    console.log("Username:", username);
    console.log("Robux:", robux);
    console.log("Amount:", amount);
    console.log("Gamepass ID:", gamepassId);

    const response = await fetch("https://app.pakasir.com/api/v1/invoice", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PAKASIR_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        slug: "dexblox", // pastikan slug sesuai di dashboard Pakasir
        amount: amount,
        description: `Topup Robux untuk ${username} - Paket: ${robux} Robux (Gamepass ID: ${gamepassId})`
      })
    });

    const data = await response.json();
    console.log("Response status:", response.status);
    console.log("Response data:", data);

    if (response.ok && data.checkout_url) {
      res.status(200).json({ checkout_url: data.checkout_url });
    } else {
      res.status(500).json({ error: data.error || "Gagal membuat invoice" });
    }
  } catch (err) {
    console.error("Error invoice:", err);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
}
