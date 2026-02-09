import { set } from '@vercel/edge-config';

export default async function handler(req, res) {
  const { password, harga } = req.body;

  // Validasi password admin
  if(password !== process.env.ADMIN_PASS){
    return res.status(403).json({ error: "Unauthorized" });
  }

  // Update harga di Edge Config
  await set("HARGA_PER100", harga);
  res.status(200).json({ success: true, harga });
}
