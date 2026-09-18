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

async function elevenLabsAudio(text) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    throw new Error("ElevenLabs no configurado");
  }
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
  if (!r.ok) throw new Error("ElevenLabs " + r.status);
  return r;
}

async function streamElementsAudio(text) {
  const clean = truncateAtSentence(normalizeTTSText(text), 320);
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=es-MX-DaliaNeural&text=${encodeURIComponent(clean)}`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://streamelements.com/",
    },
  });
  if (!r.ok) throw new Error("StreamElements " + r.status);
  return r;
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

/* ── POST /api/tts/speak ── ElevenLabs → StreamElements Dalia Neural → Google TTS */
exports.speak = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });

    let audioBuffer = null;
    let provider = "elevenlabs";
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

    res.json({ audioBase64: audioBuffer.toString("base64"), audioMime: "audio/mpeg", provider });
  } catch(e) {
    console.error("tts/speak error:", e.message);
    if (!res.headersSent) res.status(500).json({ message: e.message });
  }
};

/* ── POST /api/tts/audio ── ElevenLabs → StreamElements Dalia Neural → Google TTS */
exports.audio = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Texto requerido" });

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
