// api/stream.js -> GET /api/stream?id=&type=&season=&episode=&pass=
// The embed URL no longer lives in player.html. It is only returned here,
// and only when the pass is valid. download.html can call this same
// endpoint to validate the pass before showing download links.
const { verify, uaHash, cors, validId, clampInt, SECRET } = require('./_sign');

const STREAM_BASE = process.env.STREAM_BASE || 'https://nxsha.space/embed';

module.exports = (req, res) => {
  if (cors(req, res)) return;
  if (!SECRET) return res.status(500).json({ success: false, error: 'PASS_SECRET not set' });

  const { id, type, season, episode, pass } = req.query;
  if (!validId(id)) return res.status(400).json({ success: false, error: 'bad id' });

  const p = verify(pass);
  if (!p || p.k !== 'pass' || p.id !== String(id) || p.exp < Date.now() || p.ua !== uaHash(req)) {
    return res.status(401).json({ success: false, error: 'ad pass required' });
  }

  const q = '?color=netflix&disable_dl_button=true&disable_app_ad=true';
  const url = type === 'tv'
    ? `${STREAM_BASE}/tv/${id}/${clampInt(season, 1)}/${clampInt(episode, 1)}${q}`
    : `${STREAM_BASE}/movie/${id}${q}`;

  res.status(200).json({ success: true, url });
};
