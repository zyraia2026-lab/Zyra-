const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB conectado: ${mongoose.connection.host}`);
  } catch (error) {
    console.error(`❌ Error MongoDB: ${error.message}`);
    // Reintentar cada 5s en lugar de matar el proceso
    console.log("🔄 Reintentando en 5 segundos...");
    setTimeout(connectDB, 5000);
  }
};

// Reconexión automática si se cae la conexión
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB desconectado — reconectando...");
  setTimeout(connectDB, 3000);
});

mongoose.connection.on("error", (err) => {
  console.error("⚠️  MongoDB error:", err.message);
});

module.exports = connectDB;
