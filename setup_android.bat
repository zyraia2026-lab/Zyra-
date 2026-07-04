@echo off
echo.
echo  ============================================
echo   ZYRA - Configuracion Android APK
echo  ============================================
echo.

:: Verificar Node
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no encontrado. Instala Node.js primero.
    pause & exit /b 1
)

:: Verificar Java 17+
java -version 2>&1 | findstr "17\|18\|19\|20\|21\|22" >nul
if %errorlevel% neq 0 (
    echo [AVISO] Necesitas Java 17 o superior.
    echo Descarga: https://adoptium.net
    echo.
)

:: Instalar dependencias si hace falta
echo [1/4] Instalando dependencias npm...
npm install

:: Inicializar Capacitor (si no esta inicializado)
if not exist "android" (
    echo [2/4] Inicializando proyecto Android...
    npx cap add android
) else (
    echo [2/4] Plataforma Android ya existe.
)

:: Sincronizar archivos web con Android
echo [3/4] Sincronizando archivos web...
npx cap sync

:: Abrir en Android Studio
echo [4/4] Abriendo Android Studio...
npx cap open android

echo.
echo  ============================================
echo   LISTO! Sigue estos pasos en Android Studio:
echo   1. Espera que Gradle termine (puede tardar)
echo   2. Menu Build > Build APK(s)
echo   3. El APK estara en android/app/build/outputs/apk/
echo  ============================================
echo.
pause
