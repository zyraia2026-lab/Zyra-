const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');

const BASE = process.env.APP_URL || 'https://zyra-app-8qva.onrender.com';

const PROVIDERS = {
  google: {
    authUrl:    'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl:   'https://oauth2.googleapis.com/token',
    profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope:      'openid email profile',
    clientId:   () => process.env.GOOGLE_CLIENT_ID,
    secret:     () => process.env.GOOGLE_CLIENT_SECRET,
    idField:    'googleId',
    getProfile: d => ({ id: d.id, email: d.email, name: d.name, picture: d.picture }),
    extra:      { access_type: 'offline', prompt: 'select_account' },
  },
  spotify: {
    authUrl:    'https://accounts.spotify.com/authorize',
    tokenUrl:   'https://accounts.spotify.com/api/token',
    profileUrl: 'https://api.spotify.com/v1/me',
    scope:      'user-read-private user-read-email playlist-read-private playlist-read-collaborative streaming user-library-read user-top-read',
    clientId:   () => process.env.SPOTIFY_CLIENT_ID,
    secret:     () => process.env.SPOTIFY_CLIENT_SECRET,
    idField:    'spotifyId',
    getProfile: d => ({ id: d.id, email: d.email, name: d.display_name || d.id, picture: d.images?.[0]?.url }),
    tokenIsBasic: true, // Spotify usa Basic auth para token exchange
  },
  facebook: {
    authUrl:    'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl:   'https://graph.facebook.com/v19.0/oauth/access_token',
    profileUrl: 'https://graph.facebook.com/me?fields=id,name,email,picture',
    scope:      'public_profile',
    clientId:   () => process.env.FACEBOOK_APP_ID,
    secret:     () => process.env.FACEBOOK_APP_SECRET,
    idField:    'facebookId',
    getProfile: d => ({ id: d.id, email: d.email || `fb_${d.id}@zyra.local`, name: d.name, picture: d.picture?.data?.url }),
  },
};

// GET /api/auth/:provider — redirige al proveedor
router.get('/:provider', (req, res) => {
  const cfg = PROVIDERS[req.params.provider];
  if (!cfg || !cfg.clientId()) return res.redirect(`${BASE}/?auth_error=not_configured`);

  const params = new URLSearchParams({
    client_id:     cfg.clientId(),
    redirect_uri:  `${BASE}/api/auth/${req.params.provider}/callback`,
    response_type: 'code',
    scope:         cfg.scope,
    ...(cfg.extra || {}),
  });
  res.redirect(`${cfg.authUrl}?${params}`);
});

// GET /api/auth/:provider/callback — maneja la respuesta
router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const cfg = PROVIDERS[provider];
  const { code, error } = req.query;

  if (error || !code || !cfg) return res.redirect(`${BASE}/?auth_error=cancelled`);

  try {
    // Intercambiar code por tokens
    const tokenBody = new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: `${BASE}/api/auth/${provider}/callback`,
      ...(cfg.tokenIsBasic ? {} : { client_id: cfg.clientId(), client_secret: cfg.secret() }),
    });

    const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (cfg.tokenIsBasic) {
      tokenHeaders['Authorization'] = 'Basic ' + Buffer.from(`${cfg.clientId()}:${cfg.secret()}`).toString('base64');
    }

    const tokenRes  = await fetch(cfg.tokenUrl, { method: 'POST', headers: tokenHeaders, body: tokenBody });
    const tokens    = await tokenRes.json();
    if (!tokens.access_token) throw new Error('Sin access token del proveedor');

    // Obtener perfil del usuario
    const profileRes = await fetch(cfg.profileUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile    = await profileRes.json();
    const { id: providerId, email, name, picture } = cfg.getProfile(profile);
    if (!providerId) throw new Error('El proveedor no entregó ID de usuario');

    // Buscar usuario existente por provider ID primero; por email solo si es real (no placeholder)
    let user = await User.findOne({ [cfg.idField]: providerId });
    const isRealEmail = email && !email.endsWith('@zyra.local');
    if (!user && isRealEmail) user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Crear nuevo usuario OAuth
      user = new User({
        name:  name || email.split('@')[0],
        email: email.toLowerCase(),
        [cfg.idField]: providerId,
        termsAcceptedAt:      new Date(),
        termsAcceptedVersion: '1.0',
      });
    } else {
      if (!user[cfg.idField]) user[cfg.idField] = providerId;
    }

    // Guardar tokens de Spotify para reproducción de música
    if (provider === 'spotify') {
      user.spotifyAccessToken  = tokens.access_token;
      user.spotifyRefreshToken = tokens.refresh_token || user.spotifyRefreshToken;
      user.spotifyTokenExpiry  = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
      user.spotifyConnected    = true;
    }

    await user.save();

    // Emitir JWT de Zyra
    const zyraToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const userData  = JSON.stringify({
      _id: user._id, name: user.name, email: user.email,
      plan: user.plan, darkMode: user.darkMode,
      spotifyConnected:  user.spotifyConnected  || false,
      googleConnected:   !!user.googleId,
      facebookConnected: !!user.facebookId,
    });

    res.redirect(`${BASE}/?oauth_token=${zyraToken}&oauth_user=${encodeURIComponent(userData)}`);
  } catch(e) {
    console.error(`[OAuth ${provider}]`, e.message);
    res.redirect(`${BASE}/?auth_error=${encodeURIComponent('Error al conectar. Intenta de nuevo.')}`);
  }
});

module.exports = router;
