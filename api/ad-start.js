// api/ad-start.js  -> GET /api/ad-start?id=123
// Server records WHEN the ad session began (inside a signed token).
// No database needed.
const crypto = require('crypto');
const { sign, uaHash, cors, validId, SECRET } = require('./_sign');

module.exports = (req, res) => {
  if (cors(req, res)) return;
  if (!SECRET) return res.status(500).json({ success: false, error: 'PASS_SECRET not set' });

  const { id } = req.query;
  if (!validId(id)) return res.status(400).json({ success: false, error: 'bad id' });

  const start = sign({
    k: 'start',
    id: String(id),
    t0: Date.now(),
    n: crypto.randomBytes(8).toString('hex'),
    ua: uaHash(req)
  });
  res.status(200).json({ success: true, start, wait: 30 });
};
