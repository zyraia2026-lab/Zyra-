// Conexión a MongoDB para scripts locales (respaldo y restauración).
// En algunas redes de Windows el DNS SRV de Atlas falla (querySrv ECONNREFUSED);
// en ese caso se conecta directo a los nodos del clúster.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { MongoClient } = require("mongodb");

const KNOWN_SHARD_HOSTS = [
  "ac-u2owcwm-shard-00-00.kum1w7r.mongodb.net:27017",
  "ac-u2owcwm-shard-00-01.kum1w7r.mongodb.net:27017",
  "ac-u2owcwm-shard-00-02.kum1w7r.mongodb.net:27017",
];
const KNOWN_REPLICA_SET = "atlas-b0c4l1-shard-0";

function toDirectUri(srvUri) {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]*)\??(.*)$/);
  if (!m) return null;
  const [, user, pass, , dbname] = m;
  return `mongodb://${user}:${pass}@${KNOWN_SHARD_HOSTS.join(",")}/${dbname}?ssl=true&replicaSet=${KNOWN_REPLICA_SET}&authSource=admin&retryWrites=true&w=majority`;
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI no configurado en server/.env");
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    return client;
  } catch (e) {
    if (!/querySrv/.test(e.message)) throw e;
    const direct = toDirectUri(uri);
    if (!direct) throw e;
    const client = new MongoClient(direct, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    return client;
  }
}

module.exports = { connectMongo };
