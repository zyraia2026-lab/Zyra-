function normalizeTTSText(text) {
  return text
    .replace(/https?:\/\/\S+/g, "")        // strip URLs
    .replace(/\bZyra\b/g, "Zira")
    .replace(/\bzyra\b/g, "zira")
    .replace(/[—–]/g, ", ")                 // em/en dash → natural pause
    .replace(/\*+/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\s{2,}/g, " ")               // collapse extra spaces left by removals
    .trim();
}

// Corta en el último punto/signo de cierre antes del límite en vez de partir
// a media palabra/oración — si no hay ninguno cerca, corta duro como respaldo.
function truncateAtSentence(text, maxLen) {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf(".\n"));
  if (lastEnd > maxLen * 0.4) return slice.slice(0, lastEnd + 1);
  return slice;
}

// Circuit breaker: si un proveedor responde 401/429 (sin credito, sin API key,
// bloqueado), dejar de intentarlo por un rato en vez de perder tiempo en CADA
// mensaje esperando una respuesta que ya sabemos que va a fallar igual.
const _ttsCooldownUntil = { fishaudio: 0, elevenlabs: 0, streamelements: 0 };
const COOLDOWN_MS = { fishaudio: 60 * 60 * 1000, elevenlabs: 60 * 60 * 1000, streamelements: 24 * 60 * 60 * 1000 };
function _isOnCooldown(provider) { return Date.now() < _ttsCooldownUntil[provider]; }
function _markCooldown(provider, status) {
  if (status === 401 || status === 429) {
    _ttsCooldownUntil[provider] = Date.now() + COOLDOWN_MS[provider];
    console.warn(`[TTS] ${provider} en cooldown ${COOLDOWN_MS[provider]/60000}min tras status ${status}`);
  }
}

async function fishAudioAudio(text) {
  if (!process.env.FISH_AUDIO_API_KEY || !process.env.FISH_AUDIO_VOICE_ID) {
    throw new Error("Fish Audio no configurado");
  }
  if (_isOnCooldown("fishaudio")) throw new Error("Fish Audio en cooldown");
  const clean = truncateAtSentence(normalizeTTSText(text), 600);
  const r = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Authorization": "Bearer " + process.env.FISH_AUDIO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: clean,
      reference_id: process.env.FISH_AUDIO_VOICE_ID,
      format: "mp3",
    }),
  });
  if (!r.ok) { _markCooldown("fishaudio", r.status); throw new Error("Fish Audio " + r.status); }
  return r;
}

async function elevenLabsAudio(text) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    throw new Error("ElevenLabs no configurado");
  }
  if (_isOnCooldown("elevenlabs")) throw new Error("ElevenLabs en cooldown");
  const clean = truncateAtSentence(normalizeTTSText(text), 600);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`;
  const r = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: clean,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!r.ok) { _markCooldown("elevenlabs", r.status); throw new Error("ElevenLabs " + r.status); }
  return r;
}

async function streamElementsAudio(text) {
  if (_isOnCooldown("streamelements")) throw new Error("StreamElements en cooldown");
  const clean = truncateAtSentence(normalizeTTSText(text), 320);
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=es-MX-DaliaNeural&text=${encodeURIComponent(clean)}`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://streamelements.com/",
    },
  });
  if (!r.ok) { _markCooldown("streamelements", r.status); throw new Error("StreamElements " + r.status); }
  return r;
}

// Edge TTS (voz neural gratis de Microsoft, sin API key -- el mismo servicio
// que usa "Leer en voz alta" de Microsoft Edge). Implementado a mano, SIN el
// paquete npm "msedge-tts": ese paquete se probo dos veces en Render y ambas
// veces fallo con "Cannot find module" en el runtime a pesar de que el log
// de build mostraba la instalacion exitosa -- tiene ademas un script
// "preinstall" que exige pnpm (npx only-allow pnpm), posible causa real.
// Se reimplementa el protocolo (muy simple: un websocket + un token derivado
// de la hora) usando solo "ws" (sin scripts de instalacion raros, ya probado
// localmente contra el servidor real de Microsoft).
const crypto = require("crypto");
const _TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const _EDGE_WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const _EDGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const _EDGE_DELIM = "\r\n\r\n";
const _EDGE_AUDIO_DELIM = "Path:audio\r\n";

function _edgeSecMsGec() {
  // Microsoft valida este token: hash de la hora actual (redondeada a bloques
  // de 5 min, en "ticks" de Windows) combinada con el token publico fijo de
  // Edge. Sin esto responde 403 -- ya se confirmo con prueba directa.
  const ticks = Math.floor(Date.now() / 1000) + 11644473600; // epoch Windows
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  return crypto.createHash("sha256").update(`${windowsTicks}${_TRUSTED_CLIENT_TOKEN}`).digest("hex").toUpperCase();
}
function _edgeUuid() {
  return "xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function _escapeSSML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

let _edgeWsLoadFailed = false;
async function edgeTTSAudio(text) {
  if (_edgeWsLoadFailed) throw new Error("Edge TTS no disponible en este entorno");
  let WebSocket;
  try { WebSocket = require("ws"); }
  catch(e) { _edgeWsLoadFailed = true; throw new Error("Edge TTS: falta el paquete ws: " + e.message); }

  const clean = _escapeSSML(truncateAtSentence(normalizeTTSText(text), 600));
  const synthUrl = `${_EDGE_WSS_URL}?TrustedClientToken=${_TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${_edgeSecMsGec()}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${_edgeUuid()}`;

  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(synthUrl, {
      headers: { "User-Agent": _EDGE_UA, "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold" },
    });
    const chunks = [];
    let settled = false;
    const finish = (err, buf) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch(_) {}
      if (err) reject(err); else resolve(buf);
    };
    const timeout = setTimeout(() => finish(new Error("Edge TTS timeout")), 12000);

    ws.on("open", () => {
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config${_EDGE_DELIM}{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      const requestId = crypto.randomBytes(16).toString("hex");
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-CO"><voice name="es-CO-SalomeNeural"><prosody pitch="default" rate="default" volume="default">${clean}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml${_EDGE_DELIM}${ssml}`);
    });
    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const msg = data.toString();
        if (msg.includes("Path:turn.end")) finish(null, Buffer.concat(chunks));
        return;
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const headerEnd = buf.indexOf(_EDGE_AUDIO_DELIM);
      if (headerEnd >= 0) chunks.push(buf.subarray(headerEnd + _EDGE_AUDIO_DELIM.length));
    });
    ws.on("error", (e) => finish(new Error("Edge TTS WS: " + e.message)));
    ws.on("close", () => { if (!settled) finish(new Error("Edge TTS: conexión cerrada antes de terminar")); });
  }).then(buf => {
    if (!buf || !buf.length) throw new Error("Edge TTS devolvió audio vacío");
    return buf;
  });
}

async function googleTTSAudio(text) {
  const short = truncateAtSentence(normalizeTTSText(text), 200);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(short)}&tl=es&total=1&idx=0&textlen=${short.length}&client=tw-ob`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://translate.google.com/",
    },
  });
  if (!r.ok) throw new Error("Google TTS " + r.status);
  return r;
}

/* ── POST /api/tts/speak ── Edge TTS → Fish Audio → ElevenLabs → StreamElements Dalia Neural → Google TTS */
exports.speak = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });

    let audioBuffer = null;
    let provider = "edge";
    try {
      audioBuffer = await edgeTTSAudio(text);
    } catch(eEdge) {
      console.warn("[TTS/speak] Edge TTS:", eEdge.message, "→ Fish Audio");
      provider = "fishaudio";
      try {
        const r = await fishAudioAudio(text);
        audioBuffer = Buffer.from(await r.arrayBuffer());
      } catch(e0) {
        console.warn("[TTS/speak] Fish Audio:", e0.message, "→ ElevenLabs");
        provider = "elevenlabs";
        try {
          const r = await elevenLabsAudio(text);
          audioBuffer = Buffer.from(await r.arrayBuffer());
        } catch(e) {
          console.warn("[TTS/speak] ElevenLabs:", e.message, "→ StreamElements");
          provider = "streamelements";
          try {
            const r = await streamElementsAudio(text);
            audioBuffer = Buffer.from(await r.arrayBuffer());
          } catch(e2) {
            console.warn("[TTS/speak] StreamElements:", e2.message, "→ Google TTS");
            provider = "google";
            try {
              const r = await googleTTSAudio(text);
              audioBuffer = Buffer.from(await r.arrayBuffer());
            } catch(e3) {
              throw new Error("TTS no disponible: " + e3.message);
            }
          }
        }
      }
    }

    res.json({ audioBase64: audioBuffer.toString("base64"), audioMime: "audio/mpeg", provider });
  } catch(e) {
    console.error("tts/speak error:", e.message);
    if (!res.headersSent) res.status(500).json({ message: e.message });
  }
};

/* ── POST /api/tts/audio ── Edge TTS → Fish Audio → ElevenLabs → StreamElements Dalia Neural → Google TTS */
exports.audio = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });

    try {
      const buf = await edgeTTSAudio(text);
      res.set("Content-Type", "audio/mpeg");
      res.set("X-TTS-Provider", "edge");
      res.send(buf);
      return;
    } catch(eEdge) { console.warn("[TTS] Edge TTS:", eEdge.message, "→ Fish Audio"); }

    try {
      const r = await fishAudioAudio(text);
      res.set("Content-Type", "audio/mpeg");
      res.set("X-TTS-Provider", "fishaudio");
      res.send(Buffer.from(await r.arrayBuffer()));
      return;
    } catch(e0) { console.warn("[TTS] Fish Audio:", e0.message, "→ ElevenLabs"); }

    try {
      const r = await elevenLabsAudio(text);
      res.set("Content-Type", "audio/mpeg");
      res.set("X-TTS-Provider", "elevenlabs");
      res.send(Buffer.from(await r.arrayBuffer()));
      return;
    } catch(e) { console.warn("[TTS] ElevenLabs:", e.message, "→ StreamElements"); }

    try {
      const r = await streamElementsAudio(text);
      res.set("Content-Type", "audio/mpeg");
      res.set("X-TTS-Provider", "streamelements");
      res.send(Buffer.from(await r.arrayBuffer()));
      return;
    } catch(e) { console.warn("[TTS] StreamElements:", e.message, "→ Google TTS"); }

    const r = await googleTTSAudio(text);
    res.set("Content-Type", "audio/mpeg");
    res.set("X-TTS-Provider", "google");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch(e) {
    console.error("tts/audio error:", e.message);
    res.status(500).json({ message: e.message });
  }
};
