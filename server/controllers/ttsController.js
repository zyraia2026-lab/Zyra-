const fs   = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const DID_BASE = "https://api.d-id.com";
const DID_KEY  = () => process.env.DID_API_KEY;
const EL_KEY   = () => process.env.ELEVENLABS_API_KEY;
const EL_VOICE = () => process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
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

async function elevenLabsAudio(text) {
  const normalized = normalizeTTSText(text);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE()}`, {
    method: "POST",
    headers: {
      "xi-api-key":   EL_KEY(),
      "Content-Type": "application/json",
      Accept:         "audio/mpeg",
    },
    body: JSON.stringify({
      text: normalized,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error("ElevenLabs " + r.status + ": " + await r.text().catch(() => ""));
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

/* ── POST /api/tts/speak ── Audio ElevenLabs inmediato + D-ID en background real */
exports.speak = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });
    if (!EL_KEY())    return res.status(503).json({ message: "ElevenLabs no configurado" });

    // 1. Generar audio ElevenLabs (~1s)
    const elRes       = await elevenLabsAudio(text);
    const audioBuffer = Buffer.from(await elRes.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");

    // 2. Generar ID local para que el cliente pueda hacer poll ANTES de que D-ID responda
    const localId = DID_KEY() ? randomUUID() : null;
    if (localId) pendingDID.set(localId, { done: false, url: null, error: false });

    // 3. Responder INMEDIATAMENTE con el audio
    res.json({ audioBase64, audioMime: "audio/mpeg", talkId: localId });

    // 4. D-ID en background real
    if (localId) {
      startDIDTalk(audioBuffer, text)
        .then(realTalkId => {
          if (realTalkId) bgPollDID(realTalkId, localId);
          else pendingDID.set(localId, { done: true, url: null, error: true });
        })
        .catch(e => {
          console.warn("[D-ID] bg error:", e.message);
          pendingDID.set(localId, { done: true, url: null, error: true });
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

/* ── POST /api/tts/audio ── Solo audio ElevenLabs (chat y voz rápida) */
exports.audio = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });
    if (!EL_KEY())    return res.status(503).json({ message: "ElevenLabs no configurado" });

    const elRes = await elevenLabsAudio(text);
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await elRes.arrayBuffer()));
  } catch(e) {
    console.error("tts/audio error:", e.message);
    res.status(500).json({ message: e.message });
  }
};
