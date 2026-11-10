// POST /api/owner {password} → a token that unlocks the owner-only part of the page (the Changes tab).
// GET  /api/owner?token=…   → whether that token is still valid.
//
// The password is the Vercel environment variable OWNER_PASSWORD. Tokens are signed with it and last
// 30 days; changing the password signs every browser out.

const crypto = require('crypto');

const DAYS = 30;
const sign = (secret, exp) => crypto.createHmac('sha256', secret).update('owner:' + exp).digest('hex');
// Compare digests, not the strings, so the time taken says nothing about the password.
const same = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.OWNER_PASSWORD;
  if (!secret) {
    res.status(503).json({ ok: false, error: 'OWNER_PASSWORD is not set on Vercel' });
    return;
  }
  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!same(body.password || '', secret)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      res.status(401).json({ ok: false });
      return;
    }
    const exp = Date.now() + DAYS * 864e5;
    res.status(200).json({ ok: true, token: `${exp}.${sign(secret, exp)}`, exp });
    return;
  }
  const [exp, mac] = String(req.query.token || '').split('.');
  const ok = Number(exp) > Date.now() && !!mac && same(mac, sign(secret, exp));
  res.status(ok ? 200 : 401).json({ ok });
};
