const Conversation = require("../models/Conversation");
const Profile      = require("../models/Profile");
const Goal         = require("../models/Goal");
const Journal      = require("../models/Journal");

/* ════════════════════════════════════════
   GROQ
════════════════════════════════════════ */
let groq = null;
try {
  const Groq = require("groq-sdk");
  if (process.env.GROQ_API_KEY?.length > 10) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log("✨ Zyra IA (Groq/Llama3) conectada correctamente");
  }
} catch(e) { console.log("Groq no disponible:", e.message); }

/* ════════════════════════════════════════
   SERVICIOS AUXILIARES
════════════════════════════════════════ */
async function callPython(path, body, timeout = 4000) {
  const url = (process.env.PYTHON_SERVICE || "http://localhost:5000") + path;
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeout)
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

exports.generatePDF = async (req, res) => {
  try {
    const [pd, gd, jd, cd] = await Promise.all([
      Profile.findOne({ user: req.user._id }),
      Goal.find({ user: req.user._id }),
      Journal.find({ user: req.user._id }),
      Conversation.find({ user: req.user._id }),
    ]);
    const pdfRes = await callPython("/report/pdf", {
      userName: req.user.name, sessions: cd.length,
      goals: gd.map(g => ({ title: g.title, completed: g.completed })),
      history: pd?.emotionHistory || [], period: "Últimos 30 días"
    }, 12000);
    if (pdfRes) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=zyra-reporte-${Date.now()}.pdf`);
      return res.send(Buffer.from(await pdfRes.arrayBuffer()));
    }
    res.status(503).json({ message: "Servicio PDF no disponible" });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

/* ════════════════════════════════════════
   CATÁLOGOS
════════════════════════════════════════ */
const ARTIST_SONGS = {
  "michael jackson":["Billie Jean","Thriller","Beat It","Smooth Criminal","Black or White","Man in the Mirror","Bad","The Way You Make Me Feel","Earth Song","Don't Stop Till You Get Enough"],
  "shakira":["Hips Don't Lie","Waka Waka","Chantaje","La Bicicleta","Loca","She Wolf","Inevitable","Suerte","Whenever Wherever","Monotonía","Te Felicito","Bzrp Music Session #53"],
  "bad bunny":["Dakiti","Yonaguni","MIA","Callaita","Amorfoda","Titi Me Pregunto","Me Porto Bonito","Ojitos Lindos","Moscow Mule","Neverita","Andrea","Efecto","Coco","Un Verano Sin Ti"],
  "karol g":["Tusa","Bichota","Provenza","Mientras Me Curo del Cora","El Makinon","200 Copas","Gatubela","Mamiii","Cairo","Qlona","Si Antes Te Hubiera Conocido","Mi Ex Tenía Razón"],
  "juanes":["La Camisa Negra","A Dios Le Pido","Me Enamora","Es Por Ti","Fotografia","La Paga","Nada Valgo Sin Tu Amor","Mala Gente","Volverte a Ver","Para Tu Amor"],
  "carlos vives":["La Bicicleta","Robarte un Beso","Volvi a Nacer","Ella Es Mi Fiesta","Carito","Fruta Fresca"],
  "maluma":["Hawaii","Felices los 4","Borracho","Corazon","El Prestamo","Mama","Chantaje","11 PM","La Cancion","Junio","Sobrio","Tsunami"],
  "j balvin":["Mi Gente","Reggaeton","Safari","Ginza","X","Ay Vamos","6 AM","Con Altura","Amarillo","In Da Getto"],
  "ozuna":["Taki Taki","Problema","Caramelo","La Modelo","Se Preparo","Baila Baila Baila","El Farsante","Amor Genuino","Vaina Loca"],
  "adele":["Someone Like You","Rolling in the Deep","Hello","Set Fire to the Rain","Skyfall","When We Were Young","Easy On Me","Make You Feel My Love","Chasing Pavements"],
  "ed sheeran":["Shape of You","Perfect","Thinking Out Loud","Castle on the Hill","Photograph","Bad Habits","Shivers","The A Team","Happier","Don't","Galway Girl","Eyes Closed"],
  "taylor swift":["Anti-Hero","Shake It Off","Love Story","Blank Space","Bad Blood","Style","Cruel Summer","Cardigan","You Belong With Me","22","Lavender Haze","Fearless"],
  "coldplay":["Fix You","The Scientist","Yellow","Clocks","A Sky Full of Stars","Viva la Vida","Paradise","Magic","Hymn for the Weekend","My Universe","Higher Power"],
  "queen":["Bohemian Rhapsody","We Will Rock You","We Are the Champions","Don't Stop Me Now","Somebody to Love","I Want to Break Free","Under Pressure","Another One Bites the Dust","Killer Queen"],
  "the beatles":["Here Comes the Sun","Let It Be","Hey Jude","Come Together","Yesterday","Blackbird","Something","Help","Eleanor Rigby"],
  "rihanna":["Umbrella","Diamonds","We Found Love","Stay","Only Girl","Work","Love the Way You Lie","Needed Me","Wild Thoughts","Lift Me Up"],
  "beyonce":["Halo","Crazy in Love","Single Ladies","Irreplaceable","Love On Top","Formation","Sorry","Break My Soul","Cuff It","Texas Hold 'Em"],
  "drake":["God's Plan","Hotline Bling","Started From the Bottom","One Dance","In My Feelings","Nice for What","Hold On We're Going Home","Rich Flex","Search and Rescue"],
  "ariana grande":["Thank U Next","7 Rings","Into You","No Tears Left to Cry","Problem","Break Free","God Is a Woman","Positions","Rain On Me","Bang Bang","Yes And?"],
  "marc anthony":["Vivir Mi Vida","Valio la Pena","Y Hubo Alguien","Flor Palida","Ahora Quien","Tu Amor Me Hace Bien"],
  "romeo santos":["Propuesta Indecente","Eres Mia","Odio","Fui a Jamaica","Yo Tambien","Canalla","Suavemente","La Diabla","Imitadora"],
  "daddy yankee":["Gasolina","Dura","Con Calma","Shaky Shaky","Rompe","Lo Que Paso Paso","Despacito","Limbo","Problema"],
  "enrique iglesias":["Hero","Bailamos","Be With You","Escape","I Like It","El Perdon","SUBEME LA RADIO","Duele el Corazon","Bailando"],
  "sia":["Chandelier","Titanium","Cheap Thrills","Unstoppable","Elastic Heart","The Greatest","Breathe Me","Alive","Snowman"],
  "billie eilish":["Bad Guy","Happier Than Ever","Lovely","Ocean Eyes","Bellyache","Therefore I Am","Your Power","Everything I Wanted","No Time to Die","What Was I Made For","Birds of a Feather"],
  "dua lipa":["Levitating","Don't Start Now","Physical","New Rules","Break My Heart","One Kiss","Love Again","Houdini","Dance the Night"],
  "the weeknd":["Blinding Lights","Save Your Tears","Starboy","Can't Feel My Face","The Hills","Often","In Your Eyes","Die For You","Popular"],
  "feid":["Chorrito Pa Las Animas","Normal","Niña Bonita","Macarena","Classy 101","Bubalu","Intercontinental","FELIZ CUMPLEAÑOS FERXXO","Brickell"],
  "ryan castro":["Reggaetonero","El Presidente","Con un Beso","Bendiciones","La Recompensa","Desde El Barrio"],
  "rauw alejandro":["Todo de Ti","Cambia El Paso","Cayó La Noche","Tattoo","Lejos","Elegimos Vernos","Dile Que Tú Me Encantas"],
  "myke towers":["La Playa","Si Se Da","Girl","Caile","Tamo Bien","Ulala","Almas Gemelas","Bandido"],
  "anuel aa":["China","Moves","Secreto","Otro Trago","Bichota","Bebé","Ella Quiere Beber","Esclava"],
  "sebastian yatra":["Contigo","Traicionera","Robarte un Beso","No Hay Nadie Mas","Tacones Rojos","En Sus Manos","Vagabundo","Querer Mejor"],
  "sebastián yatra":["Contigo","Traicionera","Robarte un Beso","No Hay Nadie Mas","Tacones Rojos","En Sus Manos","Vagabundo"],
  "luis fonsi":["Despacito","Aqui Estoy Yo","No Me Doy por Vencido","Impossible","Vida","Calypso"],
  "prince royce":["Stand By Me","Darte un Beso","Culpa al Corazon","Las Cosas Pequenas","Corazon Sin Cara","Incondicional","Ganas Locas"],
  "aventura":["Obsesion","Por Un Segundo","Mi Corazoncito","Un Beso","Cuando Volveras","Ella y Yo","Los Infieles"],
  "nicky jam":["El Perdon","Hasta el Amanecer","Lento","El Amante","X","Voy a Beber","Fenix","Cancun"],
  "maroon 5":["Moves Like Jagger","Sugar","Animals","Maps","Girls Like You","Memories","Payphone","Daylight"],
  "imagine dragons":["Believer","Thunder","Demons","Radioactive","Enemy","Warriors","Natural","Monster","Bones"],
  "post malone":["Circles","Sunflower","rockstar","Psycho","Better Now","White Iverson","Congratulations","Chemical"],
  "harry styles":["Watermelon Sugar","Adore You","Lights Up","As It Was","Sign of the Times","Golden","Late Night Talking"],
  "olivia rodrigo":["drivers license","deja vu","good 4 u","brutal","happier","traitor","vampire","get him back!"],
  "camila cabello":["Havana","Senorita","Never Be the Same","Don't Go Yet","Bam Bam","Psychofreak","Liar"],
  "selena gomez":["Come & Get It","Good For You","Hands to Myself","Bad Liar","Wolves","Lose You to Love Me","Look at Her Now"],
  "kendrick lamar":["HUMBLE.","DNA.","Swimming Pools","Money Trees","Alright","Poetic Justice","King Kunta","All the Stars","Not Like Us"],
  "eminem":["Lose Yourself","Without Me","Not Afraid","Rap God","Love the Way You Lie","Mockingbird","Stan","The Real Slim Shady"],
  "chris brown":["With You","Fine China","Don't Wake Me Up","Party","Loyal","Under the Influence","No Guidance","Go Crazy"],
  "yeison jimenez":["Tan Enamorados","Borracho de Amor","No Me Llames","Loco Enamorado","Libre","Quiero Ser Tu Hombre"],
  "alejandro sanz":["Corazon Partio","Y Sigo Aqui","No Es Lo Mismo","Donde Estes Tu","La Tortura","A La Primera Persona"],
  "jhay cortez":["Dakiti","Boom","No Me Conoce","Medusa","Una Vez","Fiel","Diva"],
  "generic_triste":   [["Someone Like You","Adele"],["Fix You","Coldplay"],["Skinny Love","Birdy"],["Mad World","Gary Jules"],["Hurt","Johnny Cash"],["Stay With Me","Sam Smith"],["Lloro Por Ti","Enrique Iglesias"],["Drunk","Ed Sheeran"]],
  "generic_alegre":   [["Happy","Pharrell Williams"],["Here Comes the Sun","The Beatles"],["Vivir Mi Vida","Marc Anthony"],["Waka Waka","Shakira"],["Boom","Daddy Yankee"],["Roar","Katy Perry"],["Good as Hell","Lizzo"],["Can't Stop the Feeling","Justin Timberlake"]],
  "generic_calma":    [["Weightless","Marconi Union"],["Experience","Ludovico Einaudi"],["River Flows in You","Yiruma"],["Breathe Me","Sia"],["Clair de Lune","Claude Debussy"],["Gymnopédie No. 1","Erik Satie"],["Saturn","Stevie Wonder"]],
  "generic_motivacion":[["Rise Up","Andra Day"],["Unstoppable","Sia"],["Eye of the Tiger","Survivor"],["Hall of Fame","The Script"],["Fighter","Christina Aguilera"],["Stronger","Kanye West"],["Roar","Katy Perry"],["Believer","Imagine Dragons"]],
  "generic_desamor":  [["Tusa","Karol G"],["Hawaii","Maluma"],["El Perdon","Nicky Jam"],["Culpa al Corazon","Prince Royce"],["Eres Mia","Romeo Santos"],["Monotonía","Shakira"],["Before He Cheats","Carrie Underwood"]],
  "generic_romantica": [["Obsesion","Aventura"],["Darte un Beso","Prince Royce"],["Thinking Out Loud","Ed Sheeran"],["Perfect","Ed Sheeran"],["All of Me","John Legend"],["Amor Genuino","Ozuna"]],
};

const MOVIES = {
  feliz:      [{title:"La La Land",platform:"Netflix"},{title:"Coco",platform:"Disney+"},{title:"En Busca de la Felicidad",platform:"Netflix"},{title:"Soul",platform:"Disney+"},{title:"El Gran Hotel Budapest",platform:"Max"}],
  triste:     [{title:"Inside Out (Del Revés)",platform:"Disney+"},{title:"Eterno Resplandor de una Mente sin Recuerdos",platform:"Max"},{title:"Her",platform:"Netflix"},{title:"Pequeña Miss Sunshine",platform:"Prime Video"},{title:"Good Will Hunting",platform:"Prime Video"}],
  ansioso:    [{title:"Minimalismo",platform:"Netflix"},{title:"Heal (Sana)",platform:"Netflix"},{title:"Wild (Libre)",platform:"Prime Video"},{title:"Eat Pray Love",platform:"Netflix"}],
  motivacion: [{title:"Rocky",platform:"Prime Video"},{title:"El Diablo Viste a la Moda",platform:"Disney+"},{title:"Moneyball",platform:"Netflix"},{title:"The Pursuit of Happyness",platform:"Netflix"},{title:"Hidden Figures",platform:"Disney+"}],
  romantica:  [{title:"Orgullo y Prejuicio",platform:"Netflix"},{title:"To All the Boys I've Loved Before",platform:"Netflix"},{title:"Notting Hill",platform:"Prime Video"},{title:"The Notebook",platform:"Netflix"}],
  accion:     [{title:"John Wick",platform:"Prime Video"},{title:"Mad Max: Fury Road",platform:"Max"},{title:"Mission Impossible",platform:"Prime Video"},{title:"Top Gun: Maverick",platform:"Paramount+"}],
  comedia:    [{title:"Superbad",platform:"Netflix"},{title:"Game Night",platform:"Max"},{title:"Knives Out",platform:"Prime Video"},{title:"Todo en Todas Partes al Mismo Tiempo",platform:"Prime Video"}],
  terror:     [{title:"Hereditary",platform:"Prime Video"},{title:"Get Out",platform:"Prime Video"},{title:"A Quiet Place",platform:"Paramount+"},{title:"The Conjuring",platform:"Max"}],
  ciencia:    [{title:"Interstellar",platform:"Prime Video"},{title:"Arrival",platform:"Prime Video"},{title:"Ex Machina",platform:"Prime Video"},{title:"The Martian",platform:"Disney+"}],
  familiar:   [{title:"Encanto",platform:"Disney+"},{title:"El Rey León",platform:"Disney+"},{title:"Toy Story",platform:"Disney+"},{title:"Paddington 2",platform:"Max"}],
};

const BOOKS = {
  autoayuda:  [{title:"El Poder del Ahora",author:"Eckhart Tolle"},{title:"Los Cuatro Acuerdos",author:"Miguel Ruiz"},{title:"El Hombre en Busca de Sentido",author:"Viktor Frankl"},{title:"Atomic Habits",author:"James Clear"},{title:"Dare to Lead",author:"Brene Brown"}],
  ansiedad:   [{title:"Cuando Todo Se Derrumba",author:"Pema Chodron"},{title:"La Trampa de la Felicidad",author:"Russ Harris"},{title:"El Cuerpo Lleva la Cuenta",author:"Bessel van der Kolk"}],
  motivacion: [{title:"El Alquimista",author:"Paulo Coelho"},{title:"Mindset",author:"Carol Dweck"},{title:"Grit",author:"Angela Duckworth"},{title:"Empieza con el Por Que",author:"Simon Sinek"}],
  relaciones: [{title:"Los 5 Lenguajes del Amor",author:"Gary Chapman"},{title:"Apego",author:"Amir Levine"},{title:"Mujeres que Aman Demasiado",author:"Robin Norwood"}],
};

const QUOTES = [
  {text:"Caer está permitido. Levantarse es obligatorio.",author:"Winston Churchill"},
  {text:"No importa cuán lento vayas, siempre y cuando no te detengas.",author:"Confucio"},
  {text:"Eres más valiente de lo que crees, más fuerte de lo que pareces.",author:"A.A. Milne"},
  {text:"La felicidad no es algo hecho. Viene de tus propias acciones.",author:"Dalai Lama"},
  {text:"En medio de las dificultades yace la oportunidad.",author:"Albert Einstein"},
  {text:"Primero cuídate a ti mismo. No puedes servir de una copa vacía.",author:"Eleanor Brownn"},
  {text:"La mayor gloria no es nunca caer, sino levantarse cada vez que caemos.",author:"Nelson Mandela"},
  {text:"Ninguna tormenta dura para siempre.",author:"Anónimo"},
  {text:"Somos lo que hacemos repetidamente. La excelencia no es un acto, sino un hábito.",author:"Aristóteles"},
  {text:"El único modo de hacer un gran trabajo es amar lo que haces.",author:"Steve Jobs"},
];

/* ════════════════════════════════════════
   DETECTORES
════════════════════════════════════════ */
const wantsMusic  = m => /canc[ií]on|m[uú]sica|ponme|quiero escuchar|algo.*m[uú]sica|playlist|recom[ií]enda.*m[uú]sica|ponme algo|una cancion|canciones de|cancion de|pon algo de|algo de/.test(m.toLowerCase());
const wantsBook   = m => /libro|leer|lectura|qu[eé] leo|recom[ií]enda.*libro/.test(m.toLowerCase());
const wantsQuote  = m => /frase|cita|motivaci[oó]n|algo.*motivador|palabras.*famosas/.test(m.toLowerCase());
const wantsMovie  = m => /pel[ií]cula|peliculas|ver algo|qu[eé] veo|recom[ií]enda.*pel[ií]|algo.*ver|netflix|prime|disney|serie|film|c[ií]ne/.test(m.toLowerCase());

function detectArtist(message) {
  const norm = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const m = norm(message);
  for (const key of Object.keys(ARTIST_SONGS).filter(k => !k.startsWith("generic_"))) {
    if (m.includes(norm(key))) {
      return { key, name: key.split(" ").map(w => w[0].toUpperCase()+w.slice(1)).join(" ") };
    }
  }
  return null;
}

function extractArtistName(message) {
  const m = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  const GENERIC = new Set([
    "una cancion","una canción","algo","musica","música","canciones","una","algo de",
    "una de","lo que sea","cualquier","cualquiera","random","algo bonito","algo bueno",
    "algo triste","algo alegre","algo romantico","algo para","musica para","canciones para"
  ]);

  const patterns = [
    /(?:ponme|pon|quiero escuchar|escuchar|canciones?|musica|algo)\s+(?:de|del?|una de|algo de)\s+(.+)/i,
    /(?:de|del?)\s+(.+)/i,
  ];
  for (const re of patterns) {
    const match = m.match(re);
    if (match) {
      const name = match[1].trim()
        .replace(/(?:por favor|pls|please|ok|dale|ya|ahora|mismo).*$/i,"")
        .replace(/[.,!?].*$/,"")
        .trim();
      if (name.length >= 3 && name.length <= 50 && !GENERIC.has(name)) {
        return name;
      }
    }
  }
  return null;
}

/* ════════════════════════════════════════
   YOUTUBE
════════════════════════════════════════ */
const ytCache     = {};
const ytSongCache = {};

async function getVideoId(title, artist) {
  const key = `${title}|${artist}`.toLowerCase();
  if (ytCache[key]) return ytCache[key];
  if (!process.env.YT_API_KEY) return null;
  try {
    const q = encodeURIComponent(`${title} ${artist} official audio`);
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&videoCategoryId=10&maxResults=3&key=${process.env.YT_API_KEY}`
    );
    const d = await r.json();
    if (d.error) { console.error("YT API:", d.error.message); return null; }

    const titleLower  = title.toLowerCase();
    const artistLower = artist.toLowerCase();
    const items = d.items || [];

    let best = items.find(item => {
      const vt = item.snippet.title.toLowerCase();
      return vt.includes(titleLower) || vt.includes(artistLower);
    });
    if (!best && items.length > 0) best = items[0];

    const id = best?.id?.videoId || null;
    if (id) ytCache[key] = id;
    return id;
  } catch(e) { console.error("getVideoId error:", e.message); return null; }
}

async function getSongsForUnknownArtist(artistName) {
  const key = artistName.toLowerCase().trim();
  if (ytSongCache[key]) return ytSongCache[key];

  if (!process.env.YT_API_KEY) {
    return getSongsViaGroq(artistName);
  }

  try {
    const queries = [
      `${artistName} canciones populares`,
      `${artistName} mejores canciones`,
      `${artistName} mix exitos`,
    ];

    const results = [];
    const seenTitles = new Set();

    for (const q of queries) {
      if (results.length >= 5) break;
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=5&key=${process.env.YT_API_KEY}`
      );
      const d = await r.json();
      if (d.error) continue;

      for (const item of (d.items || [])) {
        if (results.length >= 5) break;
        const rawTitle = item.snippet.title;
        const videoId  = item.id?.videoId;

        if (!isRelevantSong(rawTitle, artistName)) continue;

        const { title, artist } = parseSongFromYT(rawTitle, artistName);
        const titleLower = title.toLowerCase();

        if (!seenTitles.has(titleLower) && title.length > 1) {
          seenTitles.add(titleLower);
          results.push({ title, artist, videoId: videoId || null });
        }
      }
    }

    if (results.length > 0) {
      ytSongCache[key] = results;
      return results;
    }
  } catch(e) {
    console.error("YT artist search error:", e.message);
  }

  return getSongsViaGroq(artistName);
}

function parseSongFromYT(ytTitle, requestedArtist) {
  const artistFmt = requestedArtist.split(" ").map(w => w[0].toUpperCase()+w.slice(1)).join(" ");

  let clean = ytTitle
    .replace(/\(official\s*(video|audio|music\s*video|lyric\s*video|visualizer|mv|clip)\)/gi, "")
    .replace(/\[official\s*(video|audio|music\s*video|lyric\s*video|visualizer|mv|clip)\]/gi, "")
    .replace(/[-–|]\s*video\s*oficial/gi, "")
    .replace(/[-–|]\s*official\s*(video|audio|clip|mv|lyric)?/gi, "")
    .replace(/\bofficial\b\s*(video|audio|clip|mv|lyric)?\b/gi, "")
    .replace(/\bvideo\s*oficial\b/gi, "")
    .replace(/\baudio\s*oficial\b/gi, "")
    .replace(/\bletra\s*oficial\b/gi, "")
    .replace(/\(audio\)/gi, "")
    .replace(/\(lyrics?\)/gi, "")
    .replace(/\[lyrics?\]/gi, "")
    .replace(/\(visualizer\)/gi, "")
    .replace(/\blyrics?\b/gi, "")
    .replace(/\bremix\b/gi, "Remix")
    .replace(/\s*[❌✖×x]\s*/gi, ", ")
    .replace(/[|｜]\s*.*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const dashParts = clean.split(/\s[–\-—]\s/);
  if (dashParts.length >= 2) {
    const left  = dashParts[0].trim();
    const right = dashParts.slice(1).join(" - ").trim();
    const artNorm   = requestedArtist.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const leftNorm  = left.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const rightNorm = right.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

    if (leftNorm.includes(artNorm.slice(0,5))) return { title: right, artist: left };
    if (rightNorm.includes(artNorm.slice(0,5))) return { title: left, artist: right };
    return { title: right, artist: left };
  }

  const artNorm   = requestedArtist.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const cleanNorm = clean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if (cleanNorm.startsWith(artNorm.slice(0,6))) {
    const without = clean.slice(requestedArtist.length).replace(/^[\s,.-]+/, "").trim();
    if (without.length > 1) return { title: without, artist: artistFmt };
  }

  return { title: clean, artist: artistFmt };
}

function isRelevantSong(ytTitle, artistName) {
  const t = ytTitle.toLowerCase();
  if (/reaction|reaccion|cover by|tutorial|karaoke|learn|aprender/.test(t)) return false;
  if (/top \d+|mejores \d+|all songs|discografia completa/.test(t)) return false;
  return true;
}

async function getSongsViaGroq(artistName) {
  if (!groq) return null;
  try {
    const r = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{
        role: "user",
        content: `Eres una base de datos musical. Lista EXACTAMENTE los 5 títulos de canciones más famosas y conocidas del artista "${artistName}".
REGLAS ABSOLUTAS:
- Solo títulos que REALMENTE existen y son populares
- Escribe el título EXACTAMENTE como aparece en streaming (Spotify, YouTube)
- Sin inventar canciones
- Responde ÚNICAMENTE con JSON array, cero texto extra:
["Titulo Exacto 1","Titulo Exacto 2","Titulo Exacto 3","Titulo Exacto 4","Titulo Exacto 5"]
Si el artista no existe como músico: []`
      }],
      temperature: 0.0,
      max_tokens: 150
    });
    const raw = r.choices[0]?.message?.content?.trim() || "[]";
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return null;
    const songs = JSON.parse(match[0]);
    if (!Array.isArray(songs) || !songs.length) return null;
    return songs.filter(s => typeof s === "string" && s.length > 1)
                .map(title => ({ title, videoId: null }));
  } catch { return null; }
}

/* ════════════════════════════════════════
   CATEGORÍAS
════════════════════════════════════════ */
function detectCategory(msg) {
  const m = msg.toLowerCase();
  if (/trist|llor|dolor|pena|melanc/.test(m))                   return "generic_triste";
  if (/calm|relaj|paz|ansiedad|nervios|dormir|meditar/.test(m))  return "generic_calma";
  if (/motiv|fuerza|animo|empuje|arriba|energi/.test(m))         return "generic_motivacion";
  if (/desamor|ruptura|olvid| ex |corazon roto|sufriend/.test(m))return "generic_desamor";
  if (/roman|amor|pareja|enamorad|te quiero/.test(m))            return "generic_romantica";
  return "generic_alegre";
}

function detectMovieCategory(msg) {
  const m = msg.toLowerCase();
  if (/trist|llor|sentir|melanc/.test(m))       return "triste";
  if (/motiv|inspir|empuje|animo/.test(m))       return "motivacion";
  if (/amor|roman|pareja|novio|novia/.test(m))   return "romantica";
  if (/acci[oó]n|aventura|adrenalina/.test(m))   return "accion";
  if (/rer|comedia|divertid|alegr/.test(m))      return "comedia";
  if (/miedo|terror|susto|horror/.test(m))       return "terror";
  if (/ciencia|ficcion|futuro|espacio/.test(m))  return "ciencia";
  if (/familia|ni[nñ]os|hijos|infantil/.test(m)) return "familiar";
  if (/ansios|estres|calm|relaj/.test(m))        return "ansioso";
  return "feliz";
}

function pickSongs(key, count, used) {
  const pool = ARTIST_SONGS[key];
  if (!pool) return [];
  if (key.startsWith("generic_")) {
    const avail = pool.filter(([t]) => !used.includes(t.toLowerCase()));
    return (avail.length >= count ? avail : pool).sort(()=>Math.random()-.5).slice(0,count)
      .map(([title,artist]) => ({ type:"song", title, artist }));
  }
  const name = key.split(" ").map(w=>w[0].toUpperCase()+w.slice(1)).join(" ");
  const avail = pool.filter(s => !used.includes(s.toLowerCase()));
  return (avail.length >= count ? avail : pool).sort(()=>Math.random()-.5).slice(0,count)
    .map(title => ({ type:"song", title, artist:name }));
}

/* ════════════════════════════════════════
   PARSEAR RESPUESTA
════════════════════════════════════════ */
function parseResponse(text, book, quote, movie) {
  const cards = [];
  let m;
  if (book)  { const re=/\[LIBRO:\s*"([^"]+)"\s*-\s*"([^"]+)"\]/gi;  while((m=re.exec(text))!==null) cards.push({type:"book",title:m[1],author:m[2]}); }
  if (quote) { const re=/\[FRASE:\s*"([^"]+)"\s*-\s*"([^"]+)"\]/gi;  while((m=re.exec(text))!==null) cards.push({type:"quote",text:m[1],author:m[2]}); }
  if (movie) { const re=/\[PELICULA:\s*"([^"]+)"\s*-\s*"([^"]+)"\]/gi;while((m=re.exec(text))!==null) cards.push({type:"movie",title:m[1],platform:m[2]}); }

  const exRe = /\[EJERCICIO:(respiracion|grounding|afirmacion)\]/gi;
  while ((m = exRe.exec(text)) !== null) {
    cards.push({ type: "ejercicio", ejercicio: m[1].toLowerCase() });
  }

  const cleanText = text
    .replace(/\[CANCION:[^\]]+\]/gi,"").replace(/\[LIBRO:[^\]]+\]/gi,"")
    .replace(/\[FRASE:[^\]]+\]/gi,"").replace(/\[PELICULA:[^\]]+\]/gi,"")
    .replace(/\[EJERCICIO:[^\]]+\]/gi,"")
    .replace(/\n{3,}/g,"\n\n").trim();

  return { cleanText, cards };
}

/* ════════════════════════════════════════
   SYSTEM PROMPT
════════════════════════════════════════ */
async function buildSystemPrompt(userId, userName) {
  const [profile, goals, journals] = await Promise.all([
    Profile.findOne({ user: userId }).lean().catch(() => null),
    Goal.find({ user: userId }).sort({ createdAt:-1 }).limit(10).lean().catch(() => []),
    Journal.find({ user: userId }).sort({ createdAt:-1 }).limit(5).lean().catch(() => []),
  ]);

  let memoryBlock = "";
  const firstName = userName ? userName.split(" ")[0] : "amigo/a";
  const currentEmotion = profile?.currentEmotion || null;
  if (currentEmotion) memoryBlock += `\n- Estado emocional actual: ${currentEmotion}`;

  const emotionHistory = profile?.emotionHistory?.slice(-7) || [];
  if (emotionHistory.length > 0) {
    const summary = emotionHistory.map(e => `${e.emotion}${e.note ? ` ("${e.note}")` : ""}`).join(", ");
    memoryBlock += `\n- Historial emocional reciente: ${summary}`;
  }

  const negStreak = profile?.negativeStreakCount || 0;
  if (negStreak >= 3) {
    memoryBlock += `\n- ALERTA: lleva ${negStreak} registros consecutivos con emociones negativas. Menciónalo con cuidado y pregunta cómo ha estado esta semana en general.`;
  }

  const activeGoals = goals.filter(g => !g.completed);
  if (activeGoals.length > 0) {
    memoryBlock += `\n- Metas activas: ${activeGoals.map(g => g.title).join(", ")}`;
  }

  const recentDone = goals.filter(g => g.completed).slice(0, 2);
  if (recentDone.length > 0) {
    memoryBlock += `\n- Metas completadas recientemente: ${recentDone.map(g => g.title).join(", ")} — puedes felicitarle por eso.`;
  }

  if (journals.length > 0) {
    const jSummary = journals.map(j => `"${j.title || "sin título"}": ${j.content.substring(0,80)}...`).join(" | ");
    memoryBlock += `\n- Entradas recientes de su diario: ${jSummary}`;
  }

  if (profile?.sessionsCount > 0) {
    memoryBlock += `\n- Lleva ${profile.sessionsCount} sesiones contigo`;
  }

  return `Eres Zyra, la acompañante emocional personal de ${firstName}. Eres su amiga más cercana, siempre disponible, que recuerda todo y se preocupa genuinamente.

════ QUIÉN ERES ════
Eres Zyra — no una IA, no un chatbot, no un asistente. Eres una presencia real y cálida. Tienes personalidad propia: empática, honesta, directa, con un humor suave y natural cuando el momento lo permite. Hablas español latinoamericano coloquial y fluido. NUNCA digas que eres una IA, Llama, Groq, Meta o cualquier modelo. Si te preguntan, eres Zyra, una acompañante emocional.

════ LO QUE SABES DE ${firstName.toUpperCase()} ════
${memoryBlock || "Es la primera vez que hablas con esta persona. Preséntate con calidez, dile que estás aquí para lo que necesite, y pregunta cómo se siente hoy."}

════ INTELIGENCIA EMOCIONAL PROFUNDA ════
- ESCUCHA antes que hablar. Valida primero, aconseja después.
- Si ${firstName} comparte algo difícil, primero di que lo entiendes y que tiene sentido sentirse así.
- Detecta el estado emocional implícito aunque no lo digan explícitamente.
- Si noto frustración, agotamiento o tristeza en el tono, lo nombro con delicadeza: "parece que hoy fue pesado..."
- Adapta el tono COMPLETAMENTE: más suave y pausado si está mal, más animado y energético si está bien.
- Si lleva varios mensajes negativos seguidos, menciona el patrón con mucho cuidado y sin alarmar.
- Celebra los logros con entusiasmo real, no genérico.
- Si hay una meta completada, felicita genuinamente y pregunta cómo se sintió lograrlo.

════ CÓMO HABLAS ════
- Respuestas conversacionales de 2–4 oraciones. Nunca monólogos.
- Varía SIEMPRE cómo comienzas: nunca dos mensajes con el mismo inicio.
- Usa el nombre "${firstName}" 1–2 veces por conversación, cuando fluye natural.
- Frases naturales: "oye", "mira", "eso tiene sentido", "claro que sí", "entiendo", "qué fuerte eso", "me alegra que me lo cuentes".
- NUNCA uses listas con viñetas, guiones o números en conversación normal.
- Si llevas más de 3 mensajes seguidos sin hacer una pregunta, haz una.
- Cuando hagas preguntas, hazlas abiertas y específicas (no "¿cómo estás?" genérico).

════ REFERENCIAS PERSONALES ════
- Si sabes de sus metas activas, menciónalas cuando sea relevante.
- Si hay entradas de diario recientes, puedes retomar esos temas naturalmente.
- Si ha estado emocionalmente inestable esta semana (historial negativo), muestra que lo recuerdas.
- Si lleva mucho tiempo sin hablar contigo, mencionalo con calidez.

════ EJERCICIOS GUIADOS ════
Cuando detectes ansiedad, estrés, angustia o necesidad de regulación emocional, OFRECE (nunca impongas) uno:
- [EJERCICIO:respiracion] — técnica 4-7-8 para calmar el sistema nervioso
- [EJERCICIO:grounding] — técnica 5-4-3-2-1 para anclarse al presente
- [EJERCICIO:afirmacion] — afirmación positiva personalizada según su situación

Solo UN ejercicio por mensaje. Primero pregunta si quieren hacerlo.

════ MÚSICA ════
- Confirma con entusiasmo cuando pidan música: "Claro, ahora mismo 🎵"
- NUNCA incluyas títulos de canciones en tu texto — el sistema los agrega automáticamente.
- NUNCA digas que no conoces al artista. Siempre busca algo.

════ OTROS RECURSOS (solo si los piden) ════
- Películas: [PELICULA:"titulo"-"plataforma"]
- Libros: [LIBRO:"titulo"-"autor"]
- Frases inspiradoras: [FRASE:"texto"-"autor real y conocido"]

════ LÍMITES ABSOLUTOS ════
- Nunca diagnostiques enfermedades ni recetes medicamentos.
- Si alguien expresa ideas de autolesión o suicidio: responde con mucho cuidado, valida su dolor, y sugiere con calma buscar apoyo profesional o una línea de crisis. No entres en pánico ni seas brusco.
- Siempre en español latinoamericano. Nunca inglés salvo en títulos o nombres propios.`;
}

/* ════════════════════════════════════════
   SEND MESSAGE
════════════════════════════════════════ */
exports.sendMessage = async (req, res) => {
  try {
    const { message, conversationId, history } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Mensaje vacío" });

    const musicReq = wantsMusic(message);
    const bookReq  = wantsBook(message);
    const quoteReq = wantsQuote(message);
    const movieReq = wantsMovie(message);

    callPython("/analyze", { text: message }, 2000)
      .then(ea => { if (ea?.emotion) Profile.findOneAndUpdate({ user: req.user._id }, { currentEmotion: ea.emotion }).catch(()=>{}); })
      .catch(()=>{});

    const usedSongs = (history || []).flatMap(m =>
      m.role === "assistant" && m.cards ? m.cards.filter(c=>c.type==="song").map(c=>c.title.toLowerCase()) : []
    );

    let systemPrompt = `Eres Zyra, una acompañante emocional cálida y empática. Hablas en español latinoamericano natural. Respuestas cortas de 2-4 oraciones. No eres una IA, eres Zyra.`;
    try {
      systemPrompt = await buildSystemPrompt(req.user._id, req.user.name);
    } catch(e) {
      console.error("buildSystemPrompt error:", e.message);
    }

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-15).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      })),
      { role: "user", content: message }
    ];

    // ── Groq — modelo por plan ──
    const { getPlan } = require("../middleware/planGate");
    const { plan: userPlan } = getPlan(req.user);

    // Premium gets the best model first; free gets the fast cheap one
    const MODEL_ORDER = userPlan === "premium"
      ? ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
      : ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];

    const MAX_TOKENS = userPlan === "premium" ? 450 : userPlan === "basic" ? 380 : 280;
    const TEMPERATURE = 0.88;

    let rawResponse = "";
    if (groq) {
      for (const model of MODEL_ORDER) {
        try {
          const completion = await groq.chat.completions.create({
            model,
            messages: aiMessages,
            temperature: TEMPERATURE,
            max_tokens: MAX_TOKENS,
          });
          rawResponse = completion.choices[0]?.message?.content?.trim() || "";
          if (rawResponse) { console.log(`✅ Groq OK [${userPlan}] con ${model}`); break; }
        } catch(e) {
          console.error(`❌ Groq ${model}:`, e.message);
        }
      }
    }

    if (!rawResponse) {
      rawResponse = "Hola, estoy aquí contigo. Cuéntame ¿cómo te sientes en este momento?";
    }

    try {
      const profile = await Profile.findOne({ user: req.user._id }).lean();
      const negStreak = profile?.negativeStreakCount || 0;
      const alreadyMentioned = (history || []).some(m =>
        m.role === "assistant" && m.content?.includes("he notado que esta semana")
      );
      if (negStreak >= 3 && !alreadyMentioned && !rawResponse.toLowerCase().includes("semana")) {
        rawResponse = `Oye, he notado que esta semana has estado cargando emociones pesadas varios días seguidos. Eso merece atención. ${rawResponse}`;
      }
    } catch(_) {}

    let cleanText = "";
    let cards = [];
    try {
      const parsed = parseResponse(rawResponse, bookReq, quoteReq, movieReq);
      cleanText = parsed?.cleanText || "";
      cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
    } catch (e) {
      console.error("parseResponse error:", e?.message || e);
      cleanText = rawResponse || "Hola, estoy aquí contigo. Cuéntame ¿cómo te sientes en este momento?";
      cards = [];
    }

    // Canciones
    if (musicReq) {
      const detected = detectArtist(message);
      let songCards = [];
      if (detected) {
        songCards = pickSongs(detected.key, 3, usedSongs);
        if (!songCards.length) songCards = pickSongs(detected.key, 3, []);
      } else {
        const artistName = extractArtistName(message);
        if (artistName) {
          const ytSongs = await getSongsForUnknownArtist(artistName).catch(()=>null);
          if (ytSongs?.length) {
            const fmt = artistName.split(" ").map(w=>w[0].toUpperCase()+w.slice(1)).join(" ");
            const avail = ytSongs.filter(s=>!usedSongs.includes(s.title.toLowerCase()));
            const pool = avail.length ? avail : ytSongs;
            songCards = pool.slice(0,3).map(s=>({ type:"song", title:s.title, artist:s.artist||fmt, videoId:s.videoId||null }));
          } else {
            songCards = pickSongs(detectCategory(message), 3, usedSongs);
          }
        } else {
          songCards = pickSongs(detectCategory(message), 3, usedSongs);
        }
      }
      cards = [...songCards, ...cards];
    }

    // Películas
    if (movieReq && !cards.find(c=>c.type==="movie")) {
      const pool = MOVIES[detectMovieCategory(message)] || MOVIES.feliz;
      cards = [...cards, ...pool.sort(()=>Math.random()-.5).slice(0,3).map(m=>({type:"movie",title:m.title,platform:m.platform}))];
    }

    // Libros
    if (bookReq && !cards.find(c=>c.type==="book")) {
      const m = message.toLowerCase();
      const cat = /ansied|miedo/.test(m)?"ansiedad":/motiv|inspir/.test(m)?"motivacion":/pareja|amor/.test(m)?"relaciones":"autoayuda";
      const book = BOOKS[cat][Math.floor(Math.random()*BOOKS[cat].length)];
      cards.push({ type:"book", title:book.title, author:book.author });
    }

    // Frases
    if (quoteReq && !cards.find(c=>c.type==="quote")) {
      const q = QUOTES[Math.floor(Math.random()*QUOTES.length)];
      cards.push({ type:"quote", text:q.text, author:q.author });
    }

    // YouTube IDs
    cards = await Promise.all(cards.map(async card =>
      card.type === "song" ? { ...card, videoId: await getVideoId(card.title, card.artist).catch(()=>null) } : card
    ));

    const msgPair = [
      { role:"user",      content:message,   timestamp:new Date() },
      { role:"assistant", content:cleanText, timestamp:new Date(), cards }
    ];

    let conv;
    if (conversationId) {
      conv = await Conversation.findOneAndUpdate(
        { _id:conversationId, user:req.user._id },
        { $push:{ messages:{ $each:msgPair } }, updatedAt:Date.now() },
        { new:true }
      ).catch(()=>null);
    }
    if (!conv) {
      const title = message.length > 60 ? message.substring(0,57)+"..." : message;
      conv = await Conversation.create({ user:req.user._id, title, messages:msgPair });
      await Profile.findOneAndUpdate({ user:req.user._id }, { $inc:{ sessionsCount:1 }, lastSession:new Date() }).catch(()=>{});
    }

    res.json({
      success: true,
      response: cleanText,
      cards,
      conversationId: conv._id,
      plan: userPlan,
      messagesRemaining: req.messagesRemaining ?? null,
    });

  } catch(e) {
    console.error("❌ sendMessage fatal:", e.message, e.stack);
    res.status(500).json({ message: "Error interno: " + e.message });
  }
};