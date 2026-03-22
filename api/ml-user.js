// api/ml-user.js
const fetch = require("node-fetch");

module.exports = async (req, res) => {
  // Allow CORS dari frontend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, zoneId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User ID wajib diisi" });
  }

  try {
    const params = new URLSearchParams();
    params.append("voucherPricePoint.id",            "647985");
    params.append("voucherPricePoint.price",         "22000.0000");
    params.append("voucherPricePoint.variablePrice", "0");
    params.append("n",                               "1");
    params.append("email",                           "");
    params.append("userVariablePrice",               "0");
    params.append("userId",                          userId);
    params.append("zoneId",                          zoneId || "0");
    params.append("gvtSku",                          "MOBILE_LEGENDS-VG");
    params.append("checkoutId",                      "coda_molpoints_web_none");
    params.append("affiliateTrackingId",             "");
    params.append("shopLang",                        "id_ID");
    params.append("paymentChannelId",                "8");

    const response = await fetch(
      "https://order-sg.codashop.com/initPayment.action",
      {
        method:  "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer":      "https://www.codashop.com/",
          "Origin":       "https://www.codashop.com",
        },
        body: params.toString(),
      }
    );

    const data = await response.json();

    if (
      data &&
      data.confirmationFields &&
      data.confirmationFields.username
    ) {
      return res.status(200).json({
        name:      data.confirmationFields.username,
        avatarUrl: "",
      });
    } else {
      return res.status(404).json({ error: "Akun tidak ditemukan. Periksa User ID dan Zone ID." });
    }

  } catch (err) {
    console.error("ML User Error:", err);
    return res.status(500).json({ error: "Gagal menghubungi server. Coba lagi." });
  }
};
