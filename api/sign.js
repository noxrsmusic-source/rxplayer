// api/_sign.js  (underscore = Vercel will NOT expose this as a route)
// Set PASS_SECRET in Vercel -> Project Settings -> Environment Variables
// (any long random string, e.g. 64 random characters).
const crypto = require('crypto');

const SECRET = process.env.PASS_SECRET;
const ALLOWED_ORIGINS = [
  'https://rxplayer.in',
  'https://www.rxplayer.in',
  'https://rxplayer-indol.vercel.app'
];

function hmac(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + hmac(body);
}

function verify(token) {
  if (!SECRET || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); }
  catch (e) { return null; }
}

function uaHash(req) {
  return crypto.createHash('sha256')
    .update(String(req.headers['user-agent'] || ''))
    .digest('base64url').slice(0, 16);
}

// returns true if the request was a preflight and is already answered
function cors(req, res) {
  const o = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

const validId = (id) => /^\d{1,10}$/.test(String(id || ''));
const clampInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 999 ? n : d;
};

module.exports = { sign, verify, uaHash, cors, validId, clampInt, SECRET };
