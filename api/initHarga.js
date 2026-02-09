import { set } from '@vercel/edge-config';

export default async function handler(req, res) {
  await set("HARGA_PER100", 12000); // harga default pertama kali
  return res.status(200).json({ success: true });
}
