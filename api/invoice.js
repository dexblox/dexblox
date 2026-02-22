export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, robux } = req.body;
  if (!username || !robux) {
    return res.status(400).json({ error: "Data wajib diisi" });
  }

  const hargaPer100 = 13000;
  const amount = (robux / 100) * hargaPer100;

  try {
    const response = await fetch("https://app.pakasir.com/api/v1/invoice", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAKASIR_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        slug: "dexblox", // ganti sesuai slug project kamu
        amount,
        description: `Topup Robux untuk ${username} - Paket: ${robux} Robux`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || "Gagal membuat invoice" });
    }

    return res.status(200).json({ checkout_url: data.checkout_url });
  } catch (err) {
    console.error("Error Invoice:", err);
    return res.status(500).json({ error: "Terjadi kesalahan server", detail: err.message });
  }
}
