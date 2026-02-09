export default function handler(req, res) {
  let hargaPer100 = 12000; // default

  if (req.method === "GET") {
    res.status(200).json({ hargaPer100 });
  } else if (req.method === "POST") {
    const { harga } = req.body;
    if (!harga || harga <= 0) {
      return res.status(400).json({ error: "Harga tidak valid" });
    }
    hargaPer100 = harga;
    res.status(200).json({ success: true, hargaPer100 });
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
