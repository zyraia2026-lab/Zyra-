const fs   = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const DID_BASE = "https://api.d-id.com";
const DID_KEY  = () => process.env.DID_API_KEY;
const DID_AUTH = () => `Basic ${Buffer.from(DID_KEY()).toString("base64")}`;

// Cache de URL de imagen subida a D-ID
let cachedZyraUrl  = null;
let cachedZyraFile = null;

// Pendientes D-ID: talkId → { done: bool, url: string|null, error: bool }
const pendingDID = new Map();

async function getZyraImageUrl() {
  const faceImg = path.join(__dirname, "../../client/Imagenes/zyra-face.png");
  const bodyImg = path.join(__dirname, "../../client/Imagenes/zyra-avatar.png");
  const imgPath = fs.existsSync(faceImg) ? faceImg : bodyImg;

  const stat    = fs.statSync(imgPath);
  const fileKey = imgPath + "_" + stat.mtime.getTime();
  if (cachedZyraUrl && cachedZyraFile === fileKey) return cachedZyraUrl;

  console.log("[D-ID] Subiendo imagen:", path.basename(imgPath));
  const imgBuffer = fs.readFileSync(imgPath);
  const blob      = new Blob([imgBuffer], { type: "image/png" });
  const form      = new FormData();
  form.append("image", blob, "zyra.png");

  const res  = await fetch(`${DID_BASE}/images`, {
    method: "POST",
    headers: { Authorization: DID_AUTH() },
    body: form,
  });
  const data = await res.json();
  if (!data.url) throw new Error("D-ID image upload: " + JSON.stringify(data));

  cachedZyraUrl  = data.url;
  cachedZyraFile = fileKey;
  console.log("[D-ID] Imagen subida:", cachedZyraUrl.substring(0, 60));
  return cachedZyraUrl;
}

function normalizeTTSText(text) {
  return text
    .replace(/\bZyra\b/g, "Zira")
    .replace(/\bzyra\b/g, "zira")
    .replace(/\*+/g, "")
    .replace(/#{1,6}\s/g, "")
    .trim();
}

async function streamElementsAudio(text) {
  const clean = normalizeTTSText(text).substring(0, 280);
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=es-MX-DaliaNeural&text=${encodeURIComponent(clean)}`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Referer": "https://streamelements.com/" },
  });
  if (!r.ok) throw new Error("StreamElements " + r.status);
  return r;
}

async function googleTTSAudio(text) {
  const short = normalizeTTSText(text).substring(0, 200);
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

// Inicia un D-ID talk. Devuelve talkId string o null si falla.
async function startDIDTalk(audioBuffer, text) {
  try {
    const imageUrl = await getZyraImageUrl();

    // Subir audio a D-ID
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioForm = new FormData();
    audioForm.append("audio", audioBlob, "voice.mp3");
    const audioRes  = await fetch(`${DID_BASE}/audios`, {
      method: "POST",
      headers: { Authorization: DID_AUTH() },
      body: audioForm,
    });
    const audioData = await audioRes.json();
    const script = audioData.url
      ? { type: "audio", audio_url: audioData.url }
      : { type: "text", input: text, provider: { type: "microsoft", voice_id: "es-MX-DaliaNeural" } };

    // Crear talk
    const talkRes  = await fetch(`${DID_BASE}/talks`, {
      method: "POST",
      headers: { Authorization: DID_AUTH(), "Content-Type": "application/json" },
      body: JSON.stringify({
        source_url: imageUrl,
        script,
        config: { fluent: true, pad_audio: 0, stitch: true },
      }),
    });
    const talkData = await talkRes.json();
    const talkId   = talkData.id;
    if (!talkId) { console.warn("[D-ID] No talkId:", JSON.stringify(talkData).substring(0, 200)); return null; }
    console.log("[D-ID] Talk creado:", talkId);
    return talkId;
  } catch(e) {
    console.warn("[D-ID] startDIDTalk error:", e.message);
    return null;
  }
}

// Polling en background — actualiza pendingDID[localId] cuando termina
function bgPollDID(realTalkId, localId) {
  const key = localId || realTalkId;

  (async () => {
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 1200));
      try {
        const poll = await fetch(`${DID_BASE}/talks/${realTalkId}`, {
          headers: { Authorization: DID_AUTH() },
        });
        const pd = await poll.json();
        if (pd.status === "done") {
          console.log("[D-ID] Video listo:", key, pd.result_url?.substring(0, 60));
          pendingDID.set(key, { done: true, url: pd.result_url, error: false });
          setTimeout(() => pendingDID.delete(key), 120_000);
          return;
        }
        if (pd.status === "error") {
          console.warn("[D-ID] Talk error:", key);
          pendingDID.set(key, { done: true, url: null, error: true });
          setTimeout(() => pendingDID.delete(key), 30_000);
          return;
        }
      } catch(e) {
        console.warn("[D-ID] poll error:", e.message);
      }
    }
    pendingDID.set(key, { done: true, url: null, error: true });
    setTimeout(() => pendingDID.delete(key), 30_000);
  })();
}

/* ── POST /api/tts/speak ── StreamElements Dalia Neural → Google TTS + D-ID en background */
exports.speak = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });

    // 1. Generar audio: StreamElements → Google TTS
    let audioBuffer = null;
    let provider = "streamelements";
    try {
      const r = await streamElementsAudio(text);
      audioBuffer = Buffer.from(await r.arrayBuffer());
    } catch(e) {
      console.warn("[TTS/speak] StreamElements:", e.message, "→ Google TTS");
      provider = "google";
      try {
        const r = await googleTTSAudio(text);
        audioBuffer = Buffer.from(await r.arrayBuffer());
      } catch(e2) {
        throw new Error("TTS no disponible: " + e2.message);
      }
    }

    const audioBase64 = audioBuffer.toString("base64");

    // 2. Generar ID local para D-ID polling
    const localId = DID_KEY() ? randomUUID() : null;
    if (localId) pendingDID.set(localId, { done: false, url: null, error: false });

    // 3. Responder INMEDIATAMENTE con el audio
    res.json({ audioBase64, audioMime: "audio/mpeg", talkId: localId, provider });

    // 4. D-ID en background
    if (localId) {
      const _didCleanup = (id) => setTimeout(() => pendingDID.delete(id), 30_000);
      startDIDTalk(audioBuffer, text)
        .then(realTalkId => {
          if (realTalkId) bgPollDID(realTalkId, localId);
          else { pendingDID.set(localId, { done: true, url: null, error: true }); _didCleanup(localId); }
        })
        .catch(e => {
          console.warn("[D-ID] bg error:", e.message);
          pendingDID.set(localId, { done: true, url: null, error: true });
          _didCleanup(localId);
        });
    }
  } catch(e) {
    console.error("tts/speak error:", e.message);
    if (!res.headersSent) res.status(500).json({ message: e.message });
  }
};

/* ── GET /api/tts/video/:talkId ── Polling del cliente para video D-ID */
exports.pollVideo = (req, res) => {
  const { talkId } = req.params;
  const entry = pendingDID.get(talkId);
  if (!entry)             return res.json({ status: "not_found" });
  if (!entry.done)        return res.json({ status: "pending" });
  if (entry.error || !entry.url) return res.json({ status: "error" });
  return res.json({ status: "done", videoUrl: entry.url });
};

/* ── POST /api/tts/audio ── StreamElements Dalia Neural → Google TTS */
exports.audio = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });

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
