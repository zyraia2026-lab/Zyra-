const router = require('express').Router();
const { protect } = require('../middleware/auth');

let _spotToken = null;
let _spotTokenExp = 0;

async function getSpotToken() {
  if (_spotToken && Date.now() < _spotTokenExp) return _spotToken;
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) throw new Error('Spotify no configurado');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Sin token de Spotify');
  _spotToken = d.access_token;
  _spotTokenExp = Date.now() + (d.expires_in - 60) * 1000;
  return _spotToken;
}

// GET /api/spotify/track?title=X&artist=Y
router.get('/track', protect, async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ message: 'title requerido' });
  if (!process.env.SPOTIFY_CLIENT_ID) return res.json({ trackId: null });
  try {
    const tok = await getSpotToken();
    const q = encodeURIComponent(`${title} ${artist || ''}`.trim());
    const r = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const d = await r.json();
    const items = d.tracks?.items || [];
    // Preferir coincidencia exacta de artista
    const artistLower = (artist || '').toLowerCase();
    const exact = items.find(t =>
      t.artists?.some(a => a.name.toLowerCase().includes(artistLower) || artistLower.includes(a.name.toLowerCase()))
    );
    const track = exact || items[0];
    if (!track) return res.json({ trackId: null });
    res.json({ trackId: track.id, name: track.name, artist: track.artists?.[0]?.name });
  } catch(e) {
    console.error('[Spotify track]', e.message);
    res.json({ trackId: null });
  }
});

module.exports = router;
