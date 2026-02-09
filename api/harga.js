export default function handler(req, res) {
  // Ambil dari ENV
  let hargaPer100 = parseInt(process.env.HARGA_PER100) || 12000;

  if (req.method === "GET") {
    res.status(200).json({ hargaPer100 });
  } else if (req.method === "POST") {
    const { harga } = req.body;
    if (!harga || harga <= 0) {
      return res.status(400).json({ error: "Harga tidak valid" });
    }
    // Catatan: ENV tidak bisa diubah langsung dari API.
    // Jadi untuk update harga, kamu harus edit ENV di dashboard Vercel.
    res.status(200).json({ success: true, hargaPer100: harga });
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
