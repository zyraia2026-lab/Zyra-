const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const cookie = require('cookie');
const User   = require('../models/User');

const BASE = process.env.APP_URL || 'https://zyra-app-8qva.onrender.com';
const STATE_COOKIE = 'zyra_oauth_state';

// Códigos de intercambio de un solo uso: el token real nunca viaja en la URL
// del redirect (quedaría en logs del servidor/CDN, historial del navegador,
// etc.) — en su lugar el cliente cambia este código de corta duración por el
// token real en una llamada POST aparte.
const _oauthExchange = new Map(); // code -> { token, userData, expiresAt }
function _cleanExpiredExchangeCodes() {
  const now = Date.now();
  for (const [code, v] of _oauthExchange) if (v.expiresAt < now) _oauthExchange.delete(code);
}
setInterval(_cleanExpiredExchangeCodes, 60 * 1000).unref();

function readCookie(req, name) {
  const parsed = cookie.parse(req.headers.cookie || '');
  return parsed[name];
}

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

  // Parámetro 'state' anti-CSRF: sin esto, cualquiera podía enviarle a una
  // víctima un link al callback con un 'code' propio y quedaba logueada en
  // la cuenta del atacante sin darse cuenta (login CSRF). Se guarda en una
  // cookie de corta duración y se compara con lo que el proveedor devuelve.
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', cookie.serialize(STATE_COOKIE, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600,
    path:     '/api/auth',
  }));

  const params = new URLSearchParams({
    client_id:     cfg.clientId(),
    redirect_uri:  `${BASE}/api/auth/${req.params.provider}/callback`,
    response_type: 'code',
    scope:         cfg.scope,
    state,
    ...(cfg.extra || {}),
  });
  res.redirect(`${cfg.authUrl}?${params}`);
});

// GET /api/auth/:provider/callback — maneja la respuesta
router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const cfg = PROVIDERS[provider];
  const { code, error, state } = req.query;

  // Limpiar la cookie de state sin importar el resultado
  res.setHeader('Set-Cookie', cookie.serialize(STATE_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/api/auth',
  }));

  if (error || !code || !cfg) return res.redirect(`${BASE}/?auth_error=cancelled`);

  const expectedState = readCookie(req, STATE_COOKIE);
  if (!state || !expectedState || state !== expectedState) {
    console.error(`[OAuth ${provider}] state inválido o ausente`);
    return res.redirect(`${BASE}/?auth_error=${encodeURIComponent('Sesión de inicio de sesión expirada. Intenta de nuevo.')}`);
  }

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
      // Crear nuevo usuario OAuth. Los términos NO se dan por aceptados: la app se los muestra
      // (con la edad mínima y el aviso de que Zyra no reemplaza a un profesional), igual que
      // al registrarse con correo. Antes se marcaban aceptados sin que la persona los viera.
      user = new User({
        name:  name || email.split('@')[0],
        email: email.toLowerCase(),
        [cfg.idField]: providerId,
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
    const userData  = {
      _id: user._id, name: user.name, email: user.email,
      plan: user.plan, darkMode: user.darkMode,
      spotifyConnected:  user.spotifyConnected  || false,
      googleConnected:   !!user.googleId,
      facebookConnected: !!user.facebookId,
      termsAcceptedAt:   user.termsAcceptedAt || null,
    };

    // El token real no va en la URL — solo un código de un solo uso, valido
    // 60s, que el cliente cambia de inmediato por el token via POST.
    const exchangeCode = crypto.randomBytes(24).toString('hex');
    _oauthExchange.set(exchangeCode, { token: zyraToken, userData, expiresAt: Date.now() + 60 * 1000 });

    res.redirect(`${BASE}/?oauth_code=${exchangeCode}`);
  } catch(e) {
    console.error(`[OAuth ${provider}]`, e.message);
    res.redirect(`${BASE}/?auth_error=${encodeURIComponent('Error al conectar. Intenta de nuevo.')}`);
  }
});

// POST /api/auth/oauth/exchange { code } — cambia el codigo de un solo uso
// por el token real. El codigo se borra apenas se usa (o si expira).
router.post('/oauth/exchange', (req, res) => {
  const { code } = req.body || {};
  const entry = code && _oauthExchange.get(code);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) _oauthExchange.delete(code);
    return res.status(400).json({ message: 'Código de inicio de sesión inválido o expirado' });
  }
  _oauthExchange.delete(code);
  res.json({ success: true, token: entry.token, user: entry.userData });
});

module.exports = router;
