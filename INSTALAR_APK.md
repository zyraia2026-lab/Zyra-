# 📱 Cómo generar el APK de Zyra

## Opción A — PWABuilder (MÁS FÁCIL, no necesita Android Studio)

1. Despliega Zyra en internet (ver sección "Deploy gratis" abajo)
2. Ve a https://www.pwabuilder.com
3. Escribe tu URL pública y haz clic en "Start"
4. Haz clic en "Package for Stores" → "Android"
5. Descarga el archivo `.apk`
6. Comparte el APK o súbelo a tu web para que otros lo descarguen

> Las actualizaciones automáticas funcionan por el Service Worker: cuando cambias el
> código y resubes al servidor, la app en el celular se actualiza sola la próxima vez
> que la abren con internet.

---

## Opción B — Android Studio + Capacitor

### Requisitos
- [ ] Instalar **Android Studio** → https://developer.android.com/studio
- [ ] Instalar **Java JDK 17+** → https://adoptium.net (el JDK 8 actual no es suficiente)

### Pasos (una sola vez)
```bash
# 1. Agregar plataforma Android
npx cap add android

# 2. Copiar archivos web al proyecto Android
npx cap sync android

# 3. Abrir en Android Studio
npx cap open android
```

### Dentro de Android Studio
1. Espera que Gradle termine de descargar
2. Menu **Build → Build Bundle(s)/APK(s) → Build APK(s)**
3. El APK se crea en `android/app/build/outputs/apk/debug/app-debug.apk`

### Para actualizaciones
```bash
# Cada vez que cambias el código, ejecuta:
npx cap sync android
# Luego rebuild en Android Studio o usa el botón ▶️ Run
```

---

## Deploy gratis en Render (para Opción A)

1. Crea cuenta en https://render.com
2. Conecta tu repositorio GitHub
3. New → Web Service → selecciona el repo
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Environment**: agrega las variables de tu `.env`
5. Tu URL pública será `https://zyra-app.onrender.com`

---

## Variables de entorno necesarias en Render
```
MONGODB_URI=tu_mongodb_uri
JWT_SECRET=tu_jwt_secret
GROQ_API_KEY=tu_groq_api_key
EMAIL_USER=tu_email
EMAIL_PASS=tu_password
YT_API_KEY=tu_yt_key
PORT=10000
```
