// Proxy Jikan: menyimpan hasil sementara (cache) supaya situs cepat dan tidak kena batas request.
module.exports = async (req, res) => {
  const path = req.query.path || '';
  if (!/^\/(anime|seasons|top)[\w\/\-?=&%.,+]*$/.test(path)) {
    return res.status(400).json({ error: 'path tidak valid' });
  }
  try {
    const r = await fetch('https://api.jikan.moe/v4' + path);
    const body = await r.text();
    if (r.ok) res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'Gagal menghubungi Jikan' });
  }
};
