// Pruebas de cómo el chat reconoce que le piden música (server/controllers/chatController.js).
// Sin red ni base de datos: las corre CI en cada push.   npm run test:unit
const test = require("node:test");
const assert = require("node:assert");
const { _music: M } = require("../controllers/chatController");

test("reconoce las formas de pedir música, con o sin tildes", () => {
  for (const q of [
    "que tema de el cantante clarent me recomiendas",   // el caso que falló en el chat
    "qué tema de Feid me recomiendas",
    "qué canción de Morat me recomiendas",               // "canción" con tilde nunca funcionaba
    "que cancion de morat me recomiendas",
    "tienes algún tema de Bad Bunny?",
    "qué disco de Soda Stereo escucho",
    "una rola de los bukis",
    "pásame un temazo",
    "recomiéndame un artista para escuchar",
    "ponme algo de Karol G",
    "quiero escuchar a shakira",
    "qué canción me recomiendas",
  ]) assert.ok(M.wantsMusic(q), "debía ser música: " + q);
});

test("no confunde conversaciones normales con pedidos de música", () => {
  for (const q of [
    "me recomiendas un tema para mi ensayo",
    "cambiemos de tema",
    "el tema del trabajo me tiene mal",
    "no sé qué tema elegir para mi exposición",
    "pon atención al tema",
    "tienes algún tema de conversación?",
    "hoy me demora el bus",
    "escuché que el artista estaba enfermo",
    "te cuento algo de mi día",
  ]) assert.ok(!M.wantsMusic(q), "no debía ser música: " + q);
});

test("saca el nombre del artista sin las palabras de relleno", () => {
  assert.equal(M.extractArtistName("que tema de el cantante clarent me recomiendas"), "clarent");
  assert.equal(M.extractArtistName("que me recomiendas del cantante Clarent"), "clarent");
  assert.equal(M.extractArtistName("qué disco de Soda Stereo escucho"), "soda stereo");
  assert.equal(M.extractArtistName("ponme un tema de Silvana Estrada"), "silvana estrada");
  assert.equal(M.extractArtistName("tienes algún tema de Bad Bunny?"), "bad bunny");
  // La respuesta de Zyra también sirve para saber el artista
  assert.equal(M.extractArtistName("Va, te pongo algo de Clarent 🎵"), "clarent");
});

test("artista conocido: palabra completa, no un pedazo", () => {
  assert.equal(M.detectArtist("qué canción de Morat me recomiendas"), null); // no es "Mora"
  assert.equal(M.detectArtist("una canción de fantasía"), null);             // no es "Sia"
  assert.equal(M.detectArtist("ponme a Mora").name, "Mora");
  assert.equal(M.detectArtist("una canción de Sia").name, "Sia");
  assert.equal(M.detectArtist("pon algo de bad bunny").name, "Bad Bunny");
});

test("si Zyra promete una canción y no la encuentra, lo dice", () => {
  assert.ok(M.AI_MUSIC_PROMISE.test("Va, te pongo algo de Clarent 🎵"));
  assert.ok(!M.AI_MUSIC_PROMISE.test("Qué bueno que me cuentas eso"));
  assert.match(M.noSongFoundText("clarent"), /no encontré canciones de Clarent/);
  assert.match(M.noSongFoundText(null), /no encontré esa canción/);
});
