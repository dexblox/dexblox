import { get, set } from '@vercel/edge-config';

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Ambil harga dari Edge Config
    const harga = await get("HARGA_PER100");
    return res.status(200).json({ hargaPer100: parseInt(harga || 12000) });
  }

  if (req.method === "POST") {
    const { password, harga } = req.body;

    // Validasi password admin
    if (password !== process.env.ADMIN_PASS) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update harga di Edge Config
    await set("HARGA_PER100", harga);
    return res.status(200).json({ success: true, harga });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
