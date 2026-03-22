// api/ml-user.js
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, zoneId } = req.body;

  if (!userId || !zoneId) {
    return res.status(400).json({ error: "User ID dan Zone ID wajib diisi" });
  }

  try {
    // Menggunakan endpoint Codashop (tidak resmi, banyak dipakai)
    const response = await fetch(
      "https://order-sg.codashop.com/initPayment.action",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
        },
        body: new URLSearchParams({
          voucherPricePoint.id: "1",
          voucherPricePoint.price: "1",
          voucherPricePoint.variablePrice: "0",
          n: "1",
          email: "user@example.com",
          userVariablePrice: "0",
          userId: userId,
          zoneId: zoneId,
          gvtSku: "MOBILE_LEGENDS",
          checkoutId: "coda_molpoints_web_none",
        }),
      }
    );

    const data = await response.json();

    // Codashop mengembalikan confirmationFields berisi username
    if (
      data &&
      data.confirmationFields &&
      data.confirmationFields.username
    ) {
      return res.status(200).json({
        name: data.confirmationFields.username,
        avatarUrl: "", // Codashop tidak return avatar
      });
    } else {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }
  } catch (err) {
    console.error("ML User Error:", err);
    return res.status(500).json({ error: "Gagal cek akun ML" });
  }
};
