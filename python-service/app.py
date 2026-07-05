"""
ZYRA Python Microservice v1.0
Servicios:
- Análisis emocional de texto
- Generación de reportes PDF
- Búsqueda de canciones en Spotify
Puerto: 5000
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import re
import io
import json
import requests
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# ══════════════════════════════════════════
#  ANÁLISIS EMOCIONAL DE TEXTO
#  Detecta emociones en mensajes del usuario
# ══════════════════════════════════════════

# Palabras clave por emoción
EMOTION_KEYWORDS = {
    "triste": [
        "triste", "tristeza", "lloro", "llorando", "llorar", "deprimido",
        "depresión", "solo", "soledad", "vacío", "dolor", "sufro",
        "sufrimiento", "perdida", "extraño", "duele", "duelo", "pena",
        "melancolía", "melancólico", "apagado", "sin ganas", "no quiero",
        "cansado de todo", "no puedo más", "horrible", "fatal", "mal",
    ],
    "ansioso": [
        "ansioso", "ansiedad", "nervioso", "nervios", "preocupado",
        "preocupación", "angustia", "angustiado", "estresado", "estrés",
        "pánico", "miedo", "temor", "asustado", "inquieto", "agitado",
        "no puedo dormir", "no duermo", "taquicardia", "ahogo", "tenso",
        "tensión", "angustia", "desesperado", "desesperación",
    ],
    "enojado": [
        "enojado", "enojo", "rabia", "furioso", "furia", "molesto",
        "molestia", "irritado", "frustrado", "frustración", "odio",
        "harto", "cansado", "injusto", "no aguanto", "exploto",
        "me tiene", "que rabia", "me molesta", "asco",
    ],
    "feliz": [
        "feliz", "felicidad", "alegre", "alegría", "contento", "bien",
        "genial", "excelente", "perfecto", "emocionado", "emoción",
        "ilusionado", "animado", "positivo", "agradecido", "gracias",
        "amor", "quiero", "me encanta", "fantástico", "increíble",
        "maravilloso", "estoy bien", "muy bien", "súper bien",
    ],
    "motivado": [
        "motivado", "motivación", "energía", "fuerza", "puedo",
        "voy a", "quiero lograr", "meta", "objetivo", "sueño",
        "empezar", "mejorar", "crecer", "avanzar", "lograr",
        "determinado", "enfocado", "comprometido", "listo",
    ],
    "tranquilo": [
        "tranquilo", "tranquilidad", "calma", "calmado", "paz",
        "sereno", "relajado", "relajación", "equilibrio", "neutral",
        "normal", "estable", "bien", "ok", "regular",
    ],
    "confundido": [
        "confundido", "confusión", "no sé", "no entiendo", "perdido",
        "dudas", "duda", "inseguro", "inseguridad", "desorientado",
        "sin rumbo", "qué hago", "no sé qué", "indeciso",
    ],
}

# Intensificadores y negaciones
INTENSIFIERS = ["muy", "súper", "demasiado", "bastante", "mucho", "tan", "totalmente"]
NEGATIONS = ["no", "nunca", "jamás", "sin", "nada"]


def analyze_emotion(text):
    """Analiza el texto y devuelve la emoción dominante con score."""
    if not text:
        return {"emotion": "tranquilo", "score": 0.5, "intensity": 5}

    text_lower = text.lower()
    words = re.findall(r'\w+', text_lower)
    scores = {emotion: 0 for emotion in EMOTION_KEYWORDS}

    for i, word in enumerate(words):
        # Detectar negación antes de la palabra
        is_negated = i > 0 and words[i-1] in NEGATIONS
        # Detectar intensificador antes
        is_intensified = i > 0 and words[i-1] in INTENSIFIERS

        for emotion, keywords in EMOTION_KEYWORDS.items():
            if word in keywords:
                score = 1.0
                if is_intensified:
                    score = 1.5
                if is_negated:
                    # Negación invierte la emoción
                    if emotion == "feliz":
                        scores["triste"] += score * 0.7
                    elif emotion == "triste":
                        scores["tranquilo"] += score * 0.5
                    score = 0
                scores[emotion] += score

    # Si no hay señales claras → tranquilo
    total = sum(scores.values())
    if total == 0:
        return {"emotion": "tranquilo", "score": 0.3, "intensity": 3}

    # Emoción dominante
    dominant = max(scores, key=scores.get)
    max_score = scores[dominant]
    confidence = min(max_score / max(total, 1), 1.0)

    # Intensidad 1-10
    intensity = min(int(max_score * 3) + 3, 10)

    return {
        "emotion": dominant,
        "score": round(confidence, 2),
        "intensity": intensity,
        "all_scores": {k: round(v, 2) for k, v in scores.items() if v > 0}
    }


def get_emotion_advice(emotion, intensity):
    """Devuelve consejo personalizado según la emoción."""
    advice = {
        "triste": [
            "Permitirte sentir la tristeza es un acto de valentía. No tienes que fingir estar bien.",
            "La tristeza a veces necesita espacio para existir. Zyra está aquí contigo.",
            "Recuerda que después de la tormenta siempre viene la calma. No estás solo.",
        ],
        "ansioso": [
            "Respira. Inhala 4 segundos, mantén 7, exhala 8. Repite. Tu cuerpo puede calmarse.",
            "La ansiedad miente — te hace sentir que todo es urgente cuando no lo es.",
            "Un paso a la vez. No tienes que resolver todo ahora mismo.",
        ],
        "enojado": [
            "El enojo es válido. Dice algo importante sobre lo que valoras.",
            "Antes de actuar desde la rabia, da un momento para respirar.",
            "¿Qué necesitas en este momento? A veces el enojo pide ser escuchado.",
        ],
        "feliz": [
            "¡Qué bueno que estés bien! Aprovecha esta energía positiva.",
            "La felicidad merece ser celebrada y compartida.",
            "Este es un buen momento para avanzar en algo que te importa.",
        ],
        "motivado": [
            "¡Esa energía es poderosa! Canalízala hacia lo que más importa.",
            "La motivación es el combustible — úsala mientras está encendida.",
            "Estás en un gran momento para dar el siguiente paso.",
        ],
        "tranquilo": [
            "La calma es un regalo. Disfruta este momento de equilibrio.",
            "Desde la tranquilidad se ven las cosas con más claridad.",
            "Este es un buen momento para reflexionar o simplemente ser.",
        ],
        "confundido": [
            "La confusión a veces precede a una gran claridad. Es parte del proceso.",
            "No tienes que tener todo resuelto. Está bien no saber.",
            "¿Qué es lo único que sí sabes en este momento?",
        ],
    }
    import random
    options = advice.get(emotion, advice["tranquilo"])
    return random.choice(options)


@app.route("/analyze", methods=["POST"])
def analyze():
    """Analiza emoción de un mensaje."""
    data = request.get_json()
    text = data.get("text", "")
    result = analyze_emotion(text)
    result["advice"] = get_emotion_advice(result["emotion"], result["intensity"])
    return jsonify(result)


@app.route("/analyze/batch", methods=["POST"])
def analyze_batch():
    """Analiza múltiples mensajes y devuelve tendencia."""
    data = request.get_json()
    messages = data.get("messages", [])
    results = []
    for msg in messages:
        if msg.get("role") == "user":
            r = analyze_emotion(msg.get("content", ""))
            r["timestamp"] = msg.get("timestamp", "")
            results.append(r)

    # Tendencia general
    if results:
        from collections import Counter
        emotions = [r["emotion"] for r in results]
        most_common = Counter(emotions).most_common(3)
        avg_intensity = sum(r["intensity"] for r in results) / len(results)
        trend = {
            "dominant_emotions": [{"emotion": e, "count": c} for e, c in most_common],
            "avg_intensity": round(avg_intensity, 1),
            "total_analyzed": len(results),
            "detail": results,
        }
    else:
        trend = {"dominant_emotions": [], "avg_intensity": 0, "total_analyzed": 0, "detail": []}

    return jsonify(trend)


# ══════════════════════════════════════════
#  SPOTIFY — Buscar canciones con preview
# ══════════════════════════════════════════

spotify_token = None
spotify_token_expiry = None


def get_spotify_token():
    """Obtiene token de Spotify usando Client Credentials."""
    global spotify_token, spotify_token_expiry

    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        return None

    # Verificar si el token actual sigue válido
    if spotify_token and spotify_token_expiry and datetime.now() < spotify_token_expiry:
        return spotify_token

    try:
        import base64
        credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        response = requests.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            spotify_token = data["access_token"]
            spotify_token_expiry = datetime.now() + timedelta(seconds=data["expires_in"] - 60)
            return spotify_token
    except Exception as e:
        print(f"Spotify token error: {e}")
    return None


@app.route("/spotify/search", methods=["POST"])
def spotify_search():
    """Busca canciones en Spotify con preview URL."""
    data = request.get_json()
    query = data.get("query", "")
    limit = data.get("limit", 5)

    token = get_spotify_token()
    if not token:
        return jsonify({"error": "Spotify no configurado", "tracks": []}), 200

    try:
        response = requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": query, "type": "track", "limit": limit, "market": "CO"},
            timeout=10
        )
        if response.status_code == 200:
            tracks = response.json().get("tracks", {}).get("items", [])
            results = []
            for t in tracks:
                results.append({
                    "title": t["name"],
                    "artist": ", ".join(a["name"] for a in t["artists"]),
                    "album": t["album"]["name"],
                    "preview_url": t.get("preview_url"),
                    "spotify_url": t["external_urls"].get("spotify"),
                    "image": t["album"]["images"][0]["url"] if t["album"]["images"] else None,
                    "duration_ms": t["duration_ms"],
                })
            return jsonify({"tracks": results})
    except Exception as e:
        print(f"Spotify search error: {e}")

    return jsonify({"tracks": [], "error": str(e)}), 200


@app.route("/spotify/recommendations", methods=["POST"])
def spotify_recommendations():
    """Recomienda canciones según estado emocional."""
    data = request.get_json()
    emotion = data.get("emotion", "tranquilo")

    # Parámetros de audio según emoción
    audio_params = {
        "feliz":     {"valence": 0.8, "energy": 0.7, "tempo": 120},
        "triste":    {"valence": 0.2, "energy": 0.3, "tempo": 70},
        "ansioso":   {"valence": 0.4, "energy": 0.3, "tempo": 80},
        "enojado":   {"valence": 0.3, "energy": 0.8, "tempo": 140},
        "motivado":  {"valence": 0.7, "energy": 0.9, "tempo": 130},
        "tranquilo": {"valence": 0.6, "energy": 0.3, "tempo": 90},
        "confundido":{"valence": 0.5, "energy": 0.4, "tempo": 100},
    }

    params = audio_params.get(emotion, audio_params["tranquilo"])

    # Géneros según emoción
    genre_map = {
        "feliz":     "pop,latin",
        "triste":    "sad,acoustic,piano",
        "ansioso":   "ambient,chill,sleep",
        "enojado":   "rock,metal",
        "motivado":  "hip-hop,power-pop",
        "tranquilo": "ambient,classical,chill",
        "confundido":"indie,alternative",
    }
    genre = genre_map.get(emotion, "pop")

    token = get_spotify_token()
    if not token:
        return jsonify({"error": "Spotify no configurado", "tracks": []}), 200

    try:
        response = requests.get(
            "https://api.spotify.com/v1/recommendations",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "seed_genres": genre,
                "limit": 5,
                "market": "CO",
                "target_valence": params["valence"],
                "target_energy": params["energy"],
                "target_tempo": params["tempo"],
            },
            timeout=10
        )
        if response.status_code == 200:
            tracks = response.json().get("tracks", [])
            results = [{
                "title": t["name"],
                "artist": ", ".join(a["name"] for a in t["artists"]),
                "preview_url": t.get("preview_url"),
                "spotify_url": t["external_urls"].get("spotify"),
                "image": t["album"]["images"][0]["url"] if t["album"]["images"] else None,
            } for t in tracks]
            return jsonify({"tracks": results, "emotion": emotion, "params": params})
    except Exception as e:
        print(f"Spotify recommendations error: {e}")

    return jsonify({"tracks": [], "error": "No se pudo conectar con Spotify"}), 200


# ══════════════════════════════════════════
#  REPORTES PDF
# ══════════════════════════════════════════

@app.route("/report/pdf", methods=["POST"])
def generate_pdf():
    """Genera reporte PDF de bienestar emocional."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import Color, HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    data = request.get_json()
    user_name = data.get("userName", "Usuario")
    history = data.get("history", [])
    goals = data.get("goals", [])
    sessions = data.get("sessions", 0)
    period = data.get("period", "Últimos 30 días")

    # Colores
    SKY = HexColor("#0ea5e9")
    PURPLE = HexColor("#7c3aed")
    DARK = HexColor("#0f172a")
    GRAY = HexColor("#64748b")
    LIGHT = HexColor("#f0f9ff")
    WHITE = HexColor("#ffffff")
    GREEN = HexColor("#059669")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    story = []

    # Estilo título
    title_style = ParagraphStyle("Title", parent=styles["Normal"], fontSize=28, textColor=DARK, spaceAfter=6, fontName="Helvetica-Bold", alignment=TA_CENTER)
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=14, textColor=GRAY, spaceAfter=20, fontName="Helvetica", alignment=TA_CENTER)
    section_style = ParagraphStyle("Section", parent=styles["Normal"], fontSize=16, textColor=PURPLE, spaceAfter=10, fontName="Helvetica-Bold")
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=11, textColor=DARK, spaceAfter=8, fontName="Helvetica", leading=16)
    small_style = ParagraphStyle("Small", parent=styles["Normal"], fontSize=9, textColor=GRAY, fontName="Helvetica")

    # ── Encabezado ──
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("✦ Zyra", title_style))
    story.append(Paragraph("Reporte de Bienestar Emocional", subtitle_style))
    story.append(Paragraph(f"Para: {user_name} | {period}", small_style))
    story.append(Paragraph(f"Generado: {datetime.now().strftime('%d de %B de %Y')}", small_style))
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=2, color=SKY))
    story.append(Spacer(1, 0.5*cm))

    # ── Resumen ──
    story.append(Paragraph("📊 Resumen del período", section_style))

    # Contar emociones
    emotion_counts = {}
    for h in history:
        e = h.get("emotion", "")
        if e:
            emotion_counts[e] = emotion_counts.get(e, 0) + 1

    emotion_names = {
        "feliz":"Feliz 😊","tranquilo":"Tranquilo 😌","ansioso":"Ansioso 😰",
        "triste":"Triste 😢","enojado":"Enojado 😤","motivado":"Motivado 💪",
        "confundido":"Confundido 🤔","esperanzado":"Esperanzado 🌟",
        "agotado":"Agotado 😮‍💨","nostalgico":"Nostálgico 🌅"
    }

    summary_data = [["Métrica", "Valor"]]
    summary_data.append(["Sesiones con Zyra", str(sessions)])
    summary_data.append(["Registros emocionales", str(len(history))])
    summary_data.append(["Metas activas", str(len([g for g in goals if not g.get("completed")]))])
    summary_data.append(["Metas completadas", str(len([g for g in goals if g.get("completed")]))])
    if emotion_counts:
        top_emotion = max(emotion_counts, key=emotion_counts.get)
        summary_data.append(["Emoción más frecuente", emotion_names.get(top_emotion, top_emotion)])

    summary_table = Table(summary_data, colWidths=[10*cm, 6*cm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), PURPLE),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 12),
        ("BACKGROUND", (0,1), (-1,-1), LIGHT),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT]),
        ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,1), (-1,-1), 11),
        ("GRID", (0,0), (-1,-1), 0.5, HexColor("#e2e8f8")),
        ("PADDING", (0,0), (-1,-1), 10),
        ("ALIGN", (1,0), (1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.5*cm))

    # ── Historial emocional ──
    if emotion_counts:
        story.append(Paragraph("💙 Distribución Emocional", section_style))
        total = sum(emotion_counts.values())
        emo_data = [["Emoción", "Veces", "Porcentaje"]]
        for emotion, count in sorted(emotion_counts.items(), key=lambda x: x[1], reverse=True):
            pct = round((count/total)*100, 1)
            emo_data.append([emotion_names.get(emotion, emotion), str(count), f"{pct}%"])

        emo_table = Table(emo_data, colWidths=[8*cm, 4*cm, 4*cm])
        emo_table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), SKY),
            ("TEXTCOLOR", (0,0), (-1,0), WHITE),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT]),
            ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
            ("FONTSIZE", (0,0), (-1,-1), 10),
            ("GRID", (0,0), (-1,-1), 0.5, HexColor("#e2e8f8")),
            ("PADDING", (0,0), (-1,-1), 8),
            ("ALIGN", (1,0), (2,-1), "CENTER"),
        ]))
        story.append(emo_table)
        story.append(Spacer(1, 0.5*cm))

    # ── Metas ──
    if goals:
        story.append(Paragraph("🎯 Mis Metas", section_style))
        for g in goals[:10]:
            status = "✅" if g.get("completed") else "⏳"
            story.append(Paragraph(f"{status} {g.get('title','Sin título')}", body_style))

    # ── Mensaje de cierre ──
    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e2e8f8")))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Generado por Zyra — Tu acompañante de bienestar emocional", small_style))
    story.append(Paragraph("Este reporte es confidencial y solo tuyo.", small_style))

    doc.build(story)
    buffer.seek(0)

    filename = f"zyra-reporte-{datetime.now().strftime('%Y%m%d')}.pdf"
    return send_file(buffer, as_attachment=True, download_name=filename, mimetype="application/pdf")


# ══════════════════════════════════════════
#  HEALTH CHECK
# ══════════════════════════════════════════

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "OK",
        "service": "Zyra Python Microservice",
        "version": "1.0",
        "features": ["emotion_analysis", "spotify", "pdf_reports"]
    })


@app.route("/", methods=["GET"])
def index():
    return jsonify({"message": "Zyra Python Microservice — funcionando correctamente ✦"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    print(f"🐍 Zyra Python Microservice iniciando en puerto {port}")
    print(f"✦ Análisis emocional: activo")
    print(f"✦ Spotify: {'activo' if os.environ.get('SPOTIFY_CLIENT_ID') else 'sin configurar'}")
    print(f"✦ Reportes PDF: activo")
    app.run(host="0.0.0.0", port=port, debug=debug)