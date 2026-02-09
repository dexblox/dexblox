export default function handler(req, res) {
  const harga = process.env.HARGA_PER100 || 12000;
  res.status(200).json({ hargaPer100: parseInt(harga) });
}
