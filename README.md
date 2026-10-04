# Zyra v5.0 — Bienestar Emocional con IA

App de acompañamiento emocional impulsada por IA. Chat, diario, metas, bienestar, gamificación y más.

## Stack

- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **IA**: Groq (Llama 3.3 70B)
- **Frontend**: SPA en `client/index.html` — PWA instalable
- **Pagos**: Stripe
- **Email**: Nodemailer (OTP login sin contraseña)
- **Push**: Web Push (VAPID)
- **App móvil**: Capacitor (Android)
- **Deploy**: Render

## Instalación local

```bash
# 1. Instalar dependencias del servidor
cd server
npm install
cd ..

# 2. Crear archivo de entorno
cp .env.example .env
# Edita .env con tus claves

# 3. Iniciar
node server/index.js
```

Abre: `http://localhost:438`

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | URI de MongoDB Atlas |
| `JWT_SECRET` | Clave secreta para JWT (string largo y aleatorio) |
| `GROQ_API_KEY` | API Key de Groq (console.groq.com) |
| `EMAIL_USER` | Gmail para envío de códigos OTP |
| `EMAIL_PASS` | Contraseña de aplicación de Gmail |
| `ADMIN_EMAIL` | Tu email — accede al panel de administración |
| `APP_URL` | URL pública de la app (para Stripe redirects) |

Variables opcionales en `.env.example`.

## Deploy en Render

El archivo `render.yaml` tiene toda la configuración lista. Solo conecta el repo en [render.com](https://render.com) y configura las variables de entorno.

## Respaldo de la base de datos

```bash
cd server
node scripts/backup-db.js                                  # copia completa en Documentos/zyra-backups/<fecha>/
node scripts/restore-db.js <carpeta-del-respaldo> --target <base-vacía>
```

El respaldo contiene diarios y conversaciones privadas de los usuarios: el script no permite guardarlo dentro del repositorio, y no se debe subir ni compartir. La restauración solo escribe en una base vacía y verifica la integridad de cada archivo y los conteos.

## App Android

```bash
# Construir APK (requiere Android Studio)
npm run cap:build
```

O usa [PWABuilder](https://www.pwabuilder.com) con tu URL pública para generar el APK sin Android Studio.

## Planes

| Plan | Precio | Características principales |
|---|---|---|
| Gratis | $0 | 15 mensajes/día, funciones básicas |
| Básico | $9.900 COP/mes | 100 mensajes/día, análisis IA, contacto emergencia |
| Premium | $24.900 COP/mes | Mensajes ilimitados, voz IA, reportes PDF |
