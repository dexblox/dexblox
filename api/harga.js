import fs from "fs";
import path from "path";
import express from "express";

const router = express.Router();
const configPath = path.join(process.cwd(), "config.json");

// GET harga terbaru
router.get("/", (req, res) => {
  try {
    const data = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(data);
    res.json({ hargaPer100: config.hargaPer100 });
  } catch (err) {
    res.status(500).json({ error: "Gagal membaca config" });
  }
});

// POST update harga
router.post("/", (req, res) => {
  const { hargaPer100 } = req.body;
  if (!hargaPer100 || hargaPer100 <= 0) {
    return res.status(400).json({ error: "Harga tidak valid" });
  }
  try {
    const config = { hargaPer100 };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    res.json({ success: true, hargaPer100 });
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan config" });
  }
});

export default router;
