// api/ad-claim.js -> POST /api/ad-claim  body: { start }
// 30 seconds are measured by the SERVER clock, so editing the timer in the
// browser or calling this early is rejected. No database needed.
const { sign, verify, uaHash, cors, SECRET } = require('./_sign');

const WAIT_MS = 30 * 1000;
const START_MAX_AGE = 30 * 60 * 1000;   // start token valid 30 min
const PASS_TTL = 3 * 60 * 60 * 1000;    // pass valid 3 hours

module.exports = (req, res) => {
  if (cors(req, res)) return;
  if (!SECRET) return res.status(500).json({ success: false, error: 'PASS_SECRET not set' });
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const t = verify(body.start);
  if (!t || t.k !== 'start') return res.status(400).json({ success: false, error: 'invalid session' });
  if (t.ua !== uaHash(req)) return res.status(403).json({ success: false, error: 'session mismatch' });

  const elapsed = Date.now() - t.t0;
  if (elapsed > START_MAX_AGE) return res.status(410).json({ success: false, error: 'expired' });
  if (elapsed < WAIT_MS) {
    return res.status(425).json({
      success: false,
      error: 'too early',
      wait: Math.ceil((WAIT_MS - elapsed) / 1000)
    });
  }

  const pass = sign({ k: 'pass', id: t.id, ua: t.ua, exp: Date.now() + PASS_TTL });
  res.status(200).json({ success: true, pass });
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
