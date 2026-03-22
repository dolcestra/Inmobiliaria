from fastapi import FastAPI, Form, File, UploadFile, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from typing import Optional, List, Annotated
import openai
import os
import json
import sqlite3
import shutil
import uuid
from dotenv import load_dotenv
from pathlib import Path

# ── Config ────────────────────────────────────────
BASE_DIR = Path(__file__).parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

DB_PATH = BASE_DIR / "inmobiliaria.db"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Inmobiliaria Reyna")
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Database ──────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS propiedades (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at            TEXT NOT NULL DEFAULT (datetime('now')),
            tipo_propiedad        TEXT NOT NULL,
            operacion             TEXT NOT NULL,
            direccion             TEXT,
            codigo_postal         TEXT,
            ciudad                TEXT NOT NULL,
            provincia             TEXT NOT NULL,
            precio                TEXT NOT NULL,
            superficie_construida TEXT,
            superficie_util       TEXT NOT NULL,
            habitaciones          TEXT NOT NULL,
            banos                 TEXT NOT NULL,
            planta                TEXT,
            ascensor              TEXT DEFAULT 'No',
            garaje                TEXT DEFAULT 'No',
            garaje_incluido       TEXT,
            estado_vivienda       TEXT,
            anio_construccion     TEXT,
            eficiencia_energetica TEXT,
            orientacion           TEXT,
            exterior_interior     TEXT,
            gastos_comunidad      TEXT,
            ibi                   TEXT,
            amenidades            TEXT DEFAULT '[]',
            descripcion_agente    TEXT,
            titulo                TEXT,
            descripcion_corta     TEXT,
            descripcion_larga     TEXT,
            copy_instagram        TEXT,
            mensaje_whatsapp      TEXT,
            fotos                 TEXT DEFAULT '[]',
            estado                TEXT DEFAULT 'activo',
            cliente_comprador_id  INTEGER,
            referencia            TEXT,
            latitud               REAL,
            longitud              REAL,
            ref_catastral         TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contactos (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            nombre       TEXT NOT NULL,
            telefono     TEXT,
            email        TEXT,
            notas        TEXT,
            preferencias TEXT DEFAULT '{}'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS interesados (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            propiedad_id  INTEGER NOT NULL,
            contacto_id   INTEGER,
            nombre        TEXT NOT NULL,
            telefono      TEXT,
            email         TEXT,
            notas         TEXT,
            visita_fecha  TEXT,
            oferta        TEXT,
            resultado     TEXT DEFAULT 'pendiente',
            actualizaciones TEXT DEFAULT '[]',
            FOREIGN KEY (propiedad_id) REFERENCES propiedades(id) ON DELETE CASCADE,
            FOREIGN KEY (contacto_id) REFERENCES contactos(id)
        )
    """)
    # Add estado column if missing (for existing DBs)
    try:
        conn.execute("ALTER TABLE propiedades ADD COLUMN estado TEXT DEFAULT 'activo'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE propiedades ADD COLUMN cliente_comprador_id INTEGER")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE interesados ADD COLUMN actualizaciones TEXT DEFAULT '[]'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE interesados ADD COLUMN contacto_id INTEGER")
    except Exception:
        pass
    # New property columns
    for col, default in [("referencia", "TEXT"), ("latitud", "REAL"), ("longitud", "REAL"), ("ref_catastral", "TEXT"), ("zona", "TEXT")]:
        try:
            conn.execute(f"ALTER TABLE propiedades ADD COLUMN {col} {default}")
        except Exception:
            pass
    # Contactos table migration
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS contactos (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), nombre TEXT NOT NULL, telefono TEXT, email TEXT, notas TEXT, preferencias TEXT DEFAULT '{}')")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE contactos ADD COLUMN preferencias TEXT DEFAULT '{}'")
    except Exception:
        pass
    conn.commit()
    conn.close()


init_db()


def row_to_dict(row):
    d = dict(row)
    for key in ("fotos", "amenidades"):
        if d.get(key):
            try:
                d[key] = json.loads(d[key])
            except Exception:
                d[key] = []
        else:
            d[key] = []
    return d


# ── Pages ─────────────────────────────────────────
@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/propiedades")
async def propiedades_page():
    return FileResponse("static/propiedades.html")


@app.get("/contactos")
async def contactos_page():
    return FileResponse("static/contactos.html")


@app.get("/web")
async def web_publica():
    return FileResponse("static/web.html")


@app.get("/web/{property_id}")
async def web_detalle(property_id: int):
    return FileResponse("static/web-detalle.html")


@app.get("/cartel/{property_id}")
async def cartel_page(property_id: int):
    return FileResponse("static/cartel.html")


# ── Prompt builder ────────────────────────────────
def build_prompt(d: dict) -> str:
    sufijo_precio = "/mes" if d["operacion"] == "Alquiler" else ""

    extras = []
    if d.get("anio_construccion"):
        extras.append(f"Año de construcción: {d['anio_construccion']}")
    if d.get("eficiencia_energetica"):
        extras.append(f"Certificado energético: {d['eficiencia_energetica']}")
    if d.get("orientacion"):
        extras.append(f"Orientación: {d['orientacion']}")
    if d.get("exterior_interior"):
        extras.append(f"Tipo: {d['exterior_interior']}")
    if d.get("gastos_comunidad"):
        extras.append(f"Gastos de comunidad: {d['gastos_comunidad']} €/mes")
    if d.get("ibi"):
        extras.append(f"IBI: {d['ibi']} €/año")

    garaje_txt = d.get("garaje", "No")
    if garaje_txt.lower() in ("sí", "si"):
        inc = d.get("garaje_incluido", "")
        garaje_txt = f"Sí (precio {'incluido' if inc == 'incluido' else 'no incluido'})" if inc else "Sí"

    amenidades_txt = (
        ", ".join(d["amenidades"]) if d.get("amenidades") else "No especificadas"
    )
    nota = d.get("descripcion_agente", "")

    zona_txt = d.get('zona') or ''

    prompt = f"""Eres un copywriter inmobiliario experto en el mercado español.
Conoces Idealista, Fotocasa y Habitaclia a la perfección.
Tu estilo: profesional, claro, transparente. Sin hype exagerado.

═══ DATOS DE LA PROPIEDAD ═══
Tipo: {d['tipo_propiedad']} en {d['operacion']}
Ubicación: {d.get('direccion', 'N/D')}, CP {d.get('codigo_postal', 'N/D')}, {d['ciudad']} ({d['provincia']})
{f"Zona / Barrio: {zona_txt}" if zona_txt else ""}
Precio: {d['precio']} €{sufijo_precio}
Superficie construida: {d.get('superficie_construida', 'N/D')} m²
Superficie útil: {d['superficie_util']} m²
Habitaciones: {d['habitaciones']}
Baños: {d['banos']}
Planta: {d.get('planta') or 'N/D'}
Ascensor: {d.get('ascensor', 'No')}
Garaje: {garaje_txt}
Estado: {d.get('estado_vivienda') or 'N/D'}
{chr(10).join(extras)}
Amenidades: {amenidades_txt}
Inmobiliaria: Reyna Inmobiliaria — Desde 1998 en Zamora
{f"Notas adicionales: {nota}" if nota else ""}

═══ INSTRUCCIONES ═══
Genera este JSON exacto (sin markdown, sin texto extra):
{{
  "titulo": "Título atractivo de marketing, máx. 70 caracteres. DEBE incluir la calle o la zona/barrio si está disponible. Estilo: 'Luminoso piso en Santa Clara' o 'Amplio ático en Zona Centro'. NO incluir 'En venta', 'En alquiler', ni el nombre de la ciudad.",
  "descripcion_corta": "Descripción estilo Idealista con ESTA estructura exacta:\\n1. Frase gancho (15-20 palabras): lo más potente del inmueble.\\n2. Párrafo técnico (50-60 palabras): m² útiles, habitaciones, baños, planta, ascensor, garaje.\\n3. Párrafo emocional (30-40 palabras): por qué es un buen lugar para vivir.\\n4. Bullet points (4-6 con •): características destacadas.\\nMencionar comunidad e IBI si disponibles. Total: 220-300 palabras.",
  "descripcion_larga": "Descripción para web (400-600 palabras). Más narrativa, profesional y cercana. Incluir contexto del barrio si es conocido, detalles de calidades, distribución y potencial de la vivienda.",
  "mensaje_whatsapp": "Mensaje WhatsApp para leads: directo, máx. 80 palabras, precio + ubicación clave + CTA claro"
}}

REGLAS:
- Usar m² útiles como dato principal (muy importante en España)
- Mencionar certificado energético si disponible
- Comunidad e IBI aportan transparencia: incluirlos si existen
- PROHIBIDO: "¡No pierdas esta oportunidad!", "joya única", "exclusivo", "irrepetible"
- NO mencionar la ciudad ni la provincia en las descripciones ni en el título (el lector ya sabe dónde está, solo menciona calle/barrio si es relevante)
- NO mencionar NINGÚN aspecto negativo, limitación o carencia. Si no tienes un dato, simplemente no lo incluyas
- Tono siempre positivo: resalta lo bueno, ignora lo que no aporta
- NUNCA uses frases genéricas como "cerca de servicios esenciales", "zona con todos los servicios", "bien comunicado" sin especificar qué servicios. Si conoces la calle o zona, menciónalas por nombre. Si NO tienes información del entorno, NO inventes ni uses comodines genéricos.
- Si hay dirección o zona, úsala en el título (ej: "Luminoso piso en Santa Clara" o "Amplio ático en Zona Centro")
"""
    return prompt


# ── Generate endpoint ─────────────────────────────
FORM_FIELDS = [
    "tipo_propiedad", "operacion", "direccion", "codigo_postal",
    "ciudad", "provincia", "precio", "superficie_construida",
    "superficie_util", "habitaciones", "banos", "planta",
    "ascensor", "garaje", "garaje_incluido", "estado_vivienda",
    "anio_construccion", "eficiencia_energetica", "orientacion",
    "exterior_interior", "gastos_comunidad", "ibi",
    "amenidades", "descripcion_agente",
]


@app.post("/api/generate")
async def generate(
    tipo_propiedad: Annotated[str, Form()],
    operacion: Annotated[str, Form()],
    direccion: Annotated[str, Form()] = "Sin especificar",
    codigo_postal: Annotated[str, Form()] = "00000",
    ciudad: Annotated[str, Form()] = "",
    provincia: Annotated[str, Form()] = "",
    precio: Annotated[str, Form()] = "",
    superficie_construida: Annotated[str, Form()] = "0",
    superficie_util: Annotated[str, Form()] = "",
    habitaciones: Annotated[str, Form()] = "",
    banos: Annotated[str, Form()] = "",
    planta: Annotated[Optional[str], Form()] = None,
    ascensor: Annotated[str, Form()] = "No",
    garaje: Annotated[str, Form()] = "No",
    garaje_incluido: Annotated[Optional[str], Form()] = None,
    estado_vivienda: Annotated[Optional[str], Form()] = None,
    anio_construccion: Annotated[Optional[str], Form()] = None,
    eficiencia_energetica: Annotated[Optional[str], Form()] = None,
    orientacion: Annotated[Optional[str], Form()] = None,
    exterior_interior: Annotated[Optional[str], Form()] = None,
    gastos_comunidad: Annotated[Optional[str], Form()] = None,
    ibi: Annotated[Optional[str], Form()] = None,
    amenidades: Annotated[Optional[str], Form()] = None,
    descripcion_agente: Annotated[Optional[str], Form()] = None,
    fotos: List[UploadFile] = File(default=[]),
):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY no configurada. Crea un archivo .env con tu clave.",
        )

    amenidades_list: list[str] = []
    if amenidades:
        try:
            amenidades_list = json.loads(amenidades)
        except Exception:
            amenidades_list = [a.strip() for a in amenidades.split(",") if a.strip()]

    data = {
        "tipo_propiedad": tipo_propiedad,
        "operacion": operacion,
        "direccion": direccion,
        "codigo_postal": codigo_postal,
        "ciudad": ciudad,
        "provincia": provincia,
        "precio": precio,
        "superficie_construida": superficie_construida,
        "superficie_util": superficie_util,
        "habitaciones": habitaciones,
        "banos": banos,
        "planta": planta,
        "ascensor": ascensor,
        "garaje": garaje,
        "garaje_incluido": garaje_incluido,
        "estado_vivienda": estado_vivienda,
        "anio_construccion": anio_construccion,
        "eficiencia_energetica": eficiencia_energetica,
        "orientacion": orientacion,
        "exterior_interior": exterior_interior,
        "gastos_comunidad": gastos_comunidad,
        "ibi": ibi,
        "amenidades": amenidades_list,
        "descripcion_agente": descripcion_agente,
    }

    prompt = build_prompt(data)

    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "Eres experto en marketing inmobiliario español. Respondes SIEMPRE con JSON válido, sin markdown.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.72,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        result = json.loads(content)
        return JSONResponse(result)

    except openai.AuthenticationError:
        raise HTTPException(status_code=401, detail="API Key de OpenAI inválida. Revisa tu archivo .env")
    except openai.RateLimitError:
        raise HTTPException(status_code=429, detail="Límite de OpenAI alcanzado. Espera unos segundos.")
    except openai.APIConnectionError:
        raise HTTPException(status_code=503, detail="No se pudo conectar con OpenAI.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Error al procesar la respuesta de la IA.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")


# ── CRUD Propiedades ──────────────────────────────
@app.post("/api/propiedades")
async def save_property(
    tipo_propiedad: Annotated[str, Form()],
    operacion: Annotated[str, Form()],
    ciudad: Annotated[str, Form()],
    provincia: Annotated[str, Form()],
    precio: Annotated[str, Form()],
    superficie_util: Annotated[str, Form()],
    habitaciones: Annotated[str, Form()],
    banos: Annotated[str, Form()],
    titulo: Annotated[Optional[str], Form()] = "",
    descripcion_corta: Annotated[Optional[str], Form()] = "",
    descripcion_larga: Annotated[Optional[str], Form()] = "",
    copy_instagram: Annotated[Optional[str], Form()] = "",
    mensaje_whatsapp: Annotated[Optional[str], Form()] = "",
    direccion: Annotated[str, Form()] = "Sin especificar",
    codigo_postal: Annotated[str, Form()] = "00000",
    superficie_construida: Annotated[str, Form()] = "0",
    planta: Annotated[Optional[str], Form()] = None,
    ascensor: Annotated[str, Form()] = "No",
    garaje: Annotated[str, Form()] = "No",
    garaje_incluido: Annotated[Optional[str], Form()] = None,
    estado_vivienda: Annotated[Optional[str], Form()] = None,
    anio_construccion: Annotated[Optional[str], Form()] = None,
    eficiencia_energetica: Annotated[Optional[str], Form()] = None,
    orientacion: Annotated[Optional[str], Form()] = None,
    exterior_interior: Annotated[Optional[str], Form()] = None,
    gastos_comunidad: Annotated[Optional[str], Form()] = None,
    ibi: Annotated[Optional[str], Form()] = None,
    amenidades: Annotated[Optional[str], Form()] = None,
    descripcion_agente: Annotated[Optional[str], Form()] = None,
    latitud: Annotated[Optional[str], Form()] = None,
    longitud: Annotated[Optional[str], Form()] = None,
    ref_catastral: Annotated[Optional[str], Form()] = None,
    zona: Annotated[Optional[str], Form()] = None,
    fotos: List[UploadFile] = File(default=[]),
):
    # Validate required address
    if not direccion or direccion.strip() == "" or direccion == "Sin especificar":
        raise HTTPException(status_code=400, detail="La dirección es obligatoria")

    conn = get_db()

    # Auto-generate internal reference: RI-YYYYMM-NNNN
    from datetime import datetime
    ym = datetime.now().strftime("%Y%m")
    last = conn.execute(
        "SELECT referencia FROM propiedades WHERE referencia LIKE ? ORDER BY id DESC LIMIT 1",
        (f"RI-{ym}-%",),
    ).fetchone()
    seq = 1
    if last and last["referencia"]:
        try:
            seq = int(last["referencia"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            pass
    referencia = f"RI-{ym}-{seq:04d}"

    cur = conn.execute(
        """INSERT INTO propiedades (
            tipo_propiedad, operacion, direccion, codigo_postal, ciudad, provincia,
            precio, superficie_construida, superficie_util, habitaciones, banos,
            planta, ascensor, garaje, garaje_incluido, estado_vivienda,
            anio_construccion, eficiencia_energetica, orientacion, exterior_interior,
            gastos_comunidad, ibi, amenidades, descripcion_agente,
            titulo, descripcion_corta, descripcion_larga, copy_instagram, mensaje_whatsapp,
            referencia, latitud, longitud, ref_catastral, zona
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            tipo_propiedad, operacion, direccion, codigo_postal, ciudad, provincia,
            precio, superficie_construida, superficie_util, habitaciones, banos,
            planta, ascensor, garaje, garaje_incluido, estado_vivienda,
            anio_construccion, eficiencia_energetica, orientacion, exterior_interior,
            gastos_comunidad, ibi, amenidades or "[]", descripcion_agente,
            titulo, descripcion_corta, descripcion_larga, copy_instagram, mensaje_whatsapp,
            referencia,
            float(latitud) if latitud else None,
            float(longitud) if longitud else None,
            ref_catastral, zona,
        ),
    )
    prop_id = cur.lastrowid
    conn.commit()

    # Save photos
    foto_paths = []
    if fotos and fotos[0].filename:
        prop_dir = UPLOAD_DIR / str(prop_id)
        prop_dir.mkdir(parents=True, exist_ok=True)
        for foto in fotos:
            if not foto.filename:
                continue
            ext = Path(foto.filename).suffix or ".jpg"
            filename = f"{uuid.uuid4().hex[:8]}{ext}"
            filepath = prop_dir / filename
            content = await foto.read()
            filepath.write_bytes(content)
            foto_paths.append(f"/static/uploads/{prop_id}/{filename}")

        conn.execute(
            "UPDATE propiedades SET fotos = ? WHERE id = ?",
            (json.dumps(foto_paths), prop_id),
        )
        conn.commit()

    conn.close()
    return JSONResponse({"id": prop_id, "message": "Propiedad guardada"})


@app.get("/api/propiedades")
async def list_properties(
    q: str = "",
    tipo_propiedad: str = "",
    operacion: str = "",
    estado: str = "",
    precio_min: str = "",
    precio_max: str = "",
):
    conn = get_db()
    sql = "SELECT * FROM propiedades WHERE 1=1"
    params = []

    if q:
        sql += " AND (titulo LIKE ? OR ciudad LIKE ? OR direccion LIKE ? OR provincia LIKE ?)"
        params.extend([f"%{q}%"] * 4)
    if tipo_propiedad:
        sql += " AND tipo_propiedad = ?"
        params.append(tipo_propiedad)
    if operacion:
        sql += " AND operacion = ?"
        params.append(operacion)
    if estado:
        sql += " AND estado = ?"
        params.append(estado)
    if precio_min:
        sql += " AND CAST(precio AS REAL) >= ?"
        params.append(float(precio_min))
    if precio_max:
        sql += " AND CAST(precio AS REAL) <= ?"
        params.append(float(precio_max))

    sql += " ORDER BY created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    return JSONResponse([row_to_dict(r) for r in rows])


@app.get("/api/propiedades/{property_id}")
async def get_property(property_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return JSONResponse(row_to_dict(row))


@app.delete("/api/propiedades/{property_id}")
async def delete_property(property_id: int):
    conn = get_db()
    row = conn.execute("SELECT id FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    # Delete photos from disk
    prop_dir = UPLOAD_DIR / str(property_id)
    if prop_dir.exists():
        shutil.rmtree(prop_dir)

    conn.execute("DELETE FROM propiedades WHERE id = ?", (property_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"message": "Propiedad eliminada"})


# ── Editar propiedad completa ────────────────────
@app.patch("/api/propiedades/{property_id}")
async def update_property(
    property_id: int,
    tipo_propiedad: Annotated[Optional[str], Form()] = None,
    operacion: Annotated[Optional[str], Form()] = None,
    direccion: Annotated[Optional[str], Form()] = None,
    codigo_postal: Annotated[Optional[str], Form()] = None,
    ciudad: Annotated[Optional[str], Form()] = None,
    provincia: Annotated[Optional[str], Form()] = None,
    precio: Annotated[Optional[str], Form()] = None,
    superficie_construida: Annotated[Optional[str], Form()] = None,
    superficie_util: Annotated[Optional[str], Form()] = None,
    habitaciones: Annotated[Optional[str], Form()] = None,
    banos: Annotated[Optional[str], Form()] = None,
    planta: Annotated[Optional[str], Form()] = None,
    ascensor: Annotated[Optional[str], Form()] = None,
    garaje: Annotated[Optional[str], Form()] = None,
    garaje_incluido: Annotated[Optional[str], Form()] = None,
    estado_vivienda: Annotated[Optional[str], Form()] = None,
    anio_construccion: Annotated[Optional[str], Form()] = None,
    eficiencia_energetica: Annotated[Optional[str], Form()] = None,
    orientacion: Annotated[Optional[str], Form()] = None,
    exterior_interior: Annotated[Optional[str], Form()] = None,
    gastos_comunidad: Annotated[Optional[str], Form()] = None,
    ibi: Annotated[Optional[str], Form()] = None,
    descripcion_agente: Annotated[Optional[str], Form()] = None,
    ref_catastral: Annotated[Optional[str], Form()] = None,
    zona: Annotated[Optional[str], Form()] = None,
    latitud: Annotated[Optional[str], Form()] = None,
    longitud: Annotated[Optional[str], Form()] = None,
    fotos_nuevas: List[UploadFile] = File(default=[]),
    fotos_eliminar: Annotated[Optional[str], Form()] = None,
):
    conn = get_db()
    row = conn.execute("SELECT * FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    editable_fields = [
        "tipo_propiedad", "operacion", "direccion", "codigo_postal", "ciudad", "provincia",
        "precio", "superficie_construida", "superficie_util", "habitaciones", "banos",
        "planta", "ascensor", "garaje", "garaje_incluido", "estado_vivienda",
        "anio_construccion", "eficiencia_energetica", "orientacion", "exterior_interior",
        "gastos_comunidad", "ibi", "descripcion_agente", "ref_catastral", "zona",
    ]
    local_vals = locals()
    updates, params = [], []
    for field in editable_fields:
        val = local_vals.get(field)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)

    # Handle lat/lng separately (convert to float)
    if latitud is not None:
        try:
            updates.append("latitud = ?")
            params.append(float(latitud) if latitud else None)
        except (ValueError, TypeError):
            pass
    if longitud is not None:
        try:
            updates.append("longitud = ?")
            params.append(float(longitud) if longitud else None)
        except (ValueError, TypeError):
            pass

    if updates:
        params.append(property_id)
        conn.execute(f"UPDATE propiedades SET {', '.join(updates)} WHERE id = ?", params)

    # Load existing photos
    existing_fotos = json.loads(dict(row).get("fotos") or "[]")

    # Handle photo deletions
    if fotos_eliminar:
        try:
            to_delete = json.loads(fotos_eliminar)
            for photo_path in to_delete:
                if photo_path in existing_fotos:
                    existing_fotos.remove(photo_path)
                    # Delete file from disk
                    full_path = Path(".") / photo_path.lstrip("/")
                    if full_path.exists():
                        full_path.unlink()
        except (json.JSONDecodeError, Exception):
            pass

    # Handle new photos (append to existing)
    if fotos_nuevas and fotos_nuevas[0].filename:
        prop_dir = UPLOAD_DIR / str(property_id)
        prop_dir.mkdir(parents=True, exist_ok=True)
        for foto in fotos_nuevas:
            if not foto.filename:
                continue
            ext = Path(foto.filename).suffix or ".jpg"
            filename = f"{uuid.uuid4().hex[:8]}{ext}"
            filepath = prop_dir / filename
            content = await foto.read()
            filepath.write_bytes(content)
            existing_fotos.append(f"/static/uploads/{property_id}/{filename}")

    # Always save fotos (may have changed via delete or add)
    conn.execute("UPDATE propiedades SET fotos = ? WHERE id = ?", (json.dumps(existing_fotos), property_id))

    conn.commit()
    conn.close()
    return JSONResponse({"message": "Propiedad actualizada"})


# ── Regenerar textos con IA para propiedad existente ──
@app.post("/api/propiedades/{property_id}/regenerar")
async def regenerar_textos(property_id: int):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY no configurada")

    conn = get_db()
    row = conn.execute("SELECT * FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    p = dict(row)
    # Parse amenidades
    try:
        p["amenidades"] = json.loads(p.get("amenidades") or "[]")
    except Exception:
        p["amenidades"] = []

    prompt = build_prompt(p)

    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Eres experto en marketing inmobiliario español. Respondes SIEMPRE con JSON válido, sin markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.72,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        result = json.loads(content)

        # Save generated texts to the property (Instagram is generated separately)
        conn.execute(
            """UPDATE propiedades SET titulo = ?, descripcion_corta = ?, descripcion_larga = ?,
               mensaje_whatsapp = ? WHERE id = ?""",
            (result.get("titulo"), result.get("descripcion_corta"), result.get("descripcion_larga"),
             result.get("mensaje_whatsapp"), property_id),
        )
        conn.commit()
        conn.close()

        result["id"] = property_id
        return JSONResponse(result)

    except openai.AuthenticationError:
        conn.close()
        raise HTTPException(status_code=401, detail="API Key de OpenAI inválida")
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ── Generar copy Instagram por separado ───────────
@app.post("/api/propiedades/{property_id}/generar-instagram")
async def generar_instagram(property_id: int):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY no configurada")

    conn = get_db()
    row = conn.execute("SELECT * FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    p = dict(row)
    zona_txt = p.get('zona') or ''
    sufijo_precio = "/mes" if p["operacion"] == "Alquiler" else ""

    prompt = f"""Eres un community manager inmobiliario experto en redes sociales españolas.

═══ DATOS DE LA PROPIEDAD ═══
Tipo: {p['tipo_propiedad']} en {p['operacion']}
Ubicación: {p.get('direccion', 'N/D')}, {p['ciudad']} ({p['provincia']})
{f"Zona / Barrio: {zona_txt}" if zona_txt else ""}
Precio: {p['precio']} €{sufijo_precio}
Superficie útil: {p['superficie_util']} m²
Habitaciones: {p['habitaciones']} · Baños: {p['banos']}
{f"Título del anuncio: {p['titulo']}" if p.get('titulo') else ""}

═══ INSTRUCCIONES ═══
Genera este JSON exacto:
{{
  "copy_instagram": "Post Instagram:\\n- Texto 150-200 palabras con emojis relevantes (sin excesos)\\n- Tono cercano y profesional\\n- Mencionar precio y características clave\\n- CTA al final invitando a contactar\\n\\n#hashtag1 #hashtag2 ... (15-20 hashtags en español, específicos por ciudad/tipo)"
}}

REGLAS:
- Hashtags específicos y útiles: ciudad, barrio, tipo (ej: #PisosEnZamora #VentaZamora)
- PROHIBIDO frases genéricas vacías
- Tono positivo y cercano
"""

    try:
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Eres experto en marketing inmobiliario en redes sociales. Respondes SIEMPRE con JSON válido, sin markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.75,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        result = json.loads(content)

        conn.execute(
            "UPDATE propiedades SET copy_instagram = ? WHERE id = ?",
            (result.get("copy_instagram"), property_id),
        )
        conn.commit()
        conn.close()
        return JSONResponse(result)

    except openai.AuthenticationError:
        conn.close()
        raise HTTPException(status_code=401, detail="API Key de OpenAI inválida")
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ── Estado de propiedad ───────────────────────────
@app.patch("/api/propiedades/{property_id}/estado")
async def update_estado(
    property_id: int,
    estado: Annotated[str, Form()],
    cliente_comprador_id: Annotated[Optional[int], Form()] = None,
):
    conn = get_db()
    row = conn.execute("SELECT id, operacion FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    # Validate estado vs operacion
    prop = dict(row)
    if prop.get("operacion") == "Alquiler" and estado == "vendido":
        conn.close()
        raise HTTPException(status_code=400, detail="Una propiedad en alquiler no puede marcarse como vendida")
    if prop.get("operacion") != "Alquiler" and estado == "alquilado":
        conn.close()
        raise HTTPException(status_code=400, detail="Una propiedad en venta no puede marcarse como alquilada")

    conn.execute(
        "UPDATE propiedades SET estado = ?, cliente_comprador_id = ? WHERE id = ?",
        (estado, cliente_comprador_id, property_id),
    )
    conn.commit()
    conn.close()
    return JSONResponse({"message": f"Estado actualizado a '{estado}'"})


# ── Actualizar textos de propiedad ────────────────
@app.patch("/api/propiedades/{property_id}/textos")
async def update_textos(
    property_id: int,
    titulo: Annotated[Optional[str], Form()] = None,
    descripcion_corta: Annotated[Optional[str], Form()] = None,
    descripcion_larga: Annotated[Optional[str], Form()] = None,
    copy_instagram: Annotated[Optional[str], Form()] = None,
    mensaje_whatsapp: Annotated[Optional[str], Form()] = None,
):
    conn = get_db()
    row = conn.execute("SELECT id FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    updates = []
    params = []
    for field, val in [("titulo", titulo), ("descripcion_corta", descripcion_corta),
                       ("descripcion_larga", descripcion_larga), ("copy_instagram", copy_instagram),
                       ("mensaje_whatsapp", mensaje_whatsapp)]:
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)

    if updates:
        params.append(property_id)
        conn.execute(f"UPDATE propiedades SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    conn.close()
    return JSONResponse({"message": "Textos actualizados"})


# ── CRUD Interesados ──────────────────────────────
@app.post("/api/propiedades/{property_id}/interesados")
async def add_interesado(
    property_id: int,
    nombre: Annotated[str, Form()],
    telefono: Annotated[Optional[str], Form()] = None,
    email: Annotated[Optional[str], Form()] = None,
    notas: Annotated[Optional[str], Form()] = None,
    visita_fecha: Annotated[Optional[str], Form()] = None,
    oferta: Annotated[Optional[str], Form()] = None,
    contacto_id: Annotated[Optional[int], Form()] = None,
):
    conn = get_db()

    # If no contacto_id provided, try to find or create a contact
    if not contacto_id:
        existing = conn.execute(
            "SELECT id FROM contactos WHERE LOWER(nombre) = LOWER(?)", (nombre.strip(),)
        ).fetchone()
        if existing:
            contacto_id = existing["id"]
            # Update contact info if new data provided
            if telefono or email:
                updates, params = [], []
                if telefono:
                    updates.append("telefono = ?")
                    params.append(telefono)
                if email:
                    updates.append("email = ?")
                    params.append(email)
                params.append(contacto_id)
                conn.execute(f"UPDATE contactos SET {', '.join(updates)} WHERE id = ?", params)
        else:
            cur_c = conn.execute(
                "INSERT INTO contactos (nombre, telefono, email) VALUES (?,?,?)",
                (nombre.strip(), telefono, email),
            )
            contacto_id = cur_c.lastrowid

    cur = conn.execute(
        """INSERT INTO interesados (propiedad_id, contacto_id, nombre, telefono, email, notas, visita_fecha, oferta, actualizaciones)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (property_id, contacto_id, nombre, telefono, email, notas, visita_fecha, oferta, "[]"),
    )
    conn.commit()
    interesado_id = cur.lastrowid
    conn.close()
    return JSONResponse({"id": interesado_id, "contacto_id": contacto_id, "message": "Interesado registrado"})


@app.get("/api/propiedades/{property_id}/interesados")
async def list_interesados(property_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM interesados WHERE propiedad_id = ? ORDER BY created_at DESC",
        (property_id,),
    ).fetchall()
    conn.close()
    return JSONResponse([dict(r) for r in rows])


@app.patch("/api/interesados/{interesado_id}")
async def update_interesado(
    interesado_id: int,
    resultado: Annotated[Optional[str], Form()] = None,
    oferta: Annotated[Optional[str], Form()] = None,
    notas: Annotated[Optional[str], Form()] = None,
    visita_fecha: Annotated[Optional[str], Form()] = None,
    actualizacion: Annotated[Optional[str], Form()] = None,
    add_visita: Annotated[Optional[str], Form()] = None,
):
    conn = get_db()
    row = conn.execute("SELECT * FROM interesados WHERE id = ?", (interesado_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Interesado no encontrado")

    updates = []
    params = []
    if resultado is not None:
        updates.append("resultado = ?")
        params.append(resultado)
    if oferta is not None:
        updates.append("oferta = ?")
        params.append(oferta)
    if notas is not None:
        updates.append("notas = ?")
        params.append(notas)
    if visita_fecha is not None:
        updates.append("visita_fecha = ?")
        params.append(visita_fecha)

    # Add a new visit date to existing dates (comma-separated)
    if add_visita:
        existing = dict(row).get("visita_fecha", "") or ""
        dates = [d.strip() for d in existing.split(",") if d.strip()]
        if add_visita not in dates:
            dates.append(add_visita)
        updates.append("visita_fecha = ?")
        params.append(", ".join(dates))

    # Append a timestamped update to the actualizaciones log
    if actualizacion:
        from datetime import datetime
        existing_log = dict(row).get("actualizaciones", "[]") or "[]"
        try:
            log = json.loads(existing_log)
        except (json.JSONDecodeError, TypeError):
            log = []
        log.append({
            "fecha": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "texto": actualizacion,
        })
        updates.append("actualizaciones = ?")
        params.append(json.dumps(log, ensure_ascii=False))

    if updates:
        params.append(interesado_id)
        conn.execute(f"UPDATE interesados SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()

    conn.close()
    return JSONResponse({"message": "Interesado actualizado"})


@app.delete("/api/interesados/{interesado_id}")
async def delete_interesado(interesado_id: int):
    conn = get_db()
    conn.execute("DELETE FROM interesados WHERE id = ?", (interesado_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"message": "Interesado eliminado"})


# ── CRUD Contactos (Agenda) ──────────────────────
@app.get("/api/contactos")
async def list_contactos(q: str = ""):
    conn = get_db()
    if q:
        rows = conn.execute(
            "SELECT * FROM contactos WHERE nombre LIKE ? OR telefono LIKE ? OR email LIKE ? ORDER BY nombre ASC",
            (f"%{q}%", f"%{q}%", f"%{q}%"),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM contactos ORDER BY nombre ASC").fetchall()
    conn.close()
    return JSONResponse([dict(r) for r in rows])


@app.get("/api/contactos/{contacto_id}")
async def get_contacto(contacto_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM contactos WHERE id = ?", (contacto_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    # Also get all interesados linked to this contact
    interesados = conn.execute(
        """SELECT i.*, p.titulo, p.tipo_propiedad, p.ciudad, p.operacion, p.precio
           FROM interesados i
           LEFT JOIN propiedades p ON i.propiedad_id = p.id
           WHERE i.contacto_id = ?
           ORDER BY i.created_at DESC""",
        (contacto_id,),
    ).fetchall()
    conn.close()
    result = dict(row)
    result["interesados"] = [dict(r) for r in interesados]
    return JSONResponse(result)


@app.post("/api/contactos")
async def create_contacto(
    nombre: Annotated[str, Form()],
    telefono: Annotated[Optional[str], Form()] = None,
    email: Annotated[Optional[str], Form()] = None,
    notas: Annotated[Optional[str], Form()] = None,
    preferencias: Annotated[Optional[str], Form()] = None,
):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO contactos (nombre, telefono, email, notas, preferencias) VALUES (?,?,?,?,?)",
        (nombre, telefono, email, notas, preferencias or "{}"),
    )
    conn.commit()
    cid = cur.lastrowid
    conn.close()
    return JSONResponse({"id": cid, "message": "Contacto creado"})


@app.patch("/api/contactos/{contacto_id}")
async def update_contacto(
    contacto_id: int,
    nombre: Annotated[Optional[str], Form()] = None,
    telefono: Annotated[Optional[str], Form()] = None,
    email: Annotated[Optional[str], Form()] = None,
    notas: Annotated[Optional[str], Form()] = None,
    preferencias: Annotated[Optional[str], Form()] = None,
):
    conn = get_db()
    row = conn.execute("SELECT id FROM contactos WHERE id = ?", (contacto_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    updates, params = [], []
    for field, val in [("nombre", nombre), ("telefono", telefono), ("email", email), ("notas", notas), ("preferencias", preferencias)]:
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)
    if updates:
        params.append(contacto_id)
        conn.execute(f"UPDATE contactos SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return JSONResponse({"message": "Contacto actualizado"})


@app.delete("/api/contactos/{contacto_id}")
async def delete_contacto(contacto_id: int):
    conn = get_db()
    conn.execute("DELETE FROM contactos WHERE id = ?", (contacto_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"message": "Contacto eliminado"})


@app.get("/api/contactos/search/{query}")
async def search_contactos(query: str):
    """Fast autocomplete search for contactos by name."""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, nombre, telefono, email FROM contactos WHERE nombre LIKE ? ORDER BY nombre ASC LIMIT 8",
        (f"%{query}%",),
    ).fetchall()
    conn.close()
    return JSONResponse([dict(r) for r in rows])


# ── Matching: contacto preferences vs properties ──
@app.get("/api/contactos/{contacto_id}/matches")
async def get_matches(contacto_id: int):
    """Find active properties that match a contact's preferences."""
    conn = get_db()
    row = conn.execute("SELECT preferencias FROM contactos WHERE id = ?", (contacto_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    try:
        prefs = json.loads(row["preferencias"] or "{}")
    except (json.JSONDecodeError, TypeError):
        prefs = {}

    if not prefs:
        conn.close()
        return JSONResponse([])

    # Get all active properties
    props = conn.execute("SELECT * FROM propiedades WHERE estado = 'activo'").fetchall()
    conn.close()

    results = []
    for p in props:
        p_dict = row_to_dict(p)
        score, reasons = _calc_match(prefs, p_dict)
        if score > 0:
            results.append({
                "propiedad": p_dict,
                "score": score,
                "reasons": reasons,
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return JSONResponse(results[:20])


@app.get("/api/propiedades/{property_id}/matches")
async def get_property_matches(property_id: int):
    """Find contacts whose preferences match a given property."""
    conn = get_db()
    prop_row = conn.execute("SELECT * FROM propiedades WHERE id = ?", (property_id,)).fetchone()
    if not prop_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    p_dict = row_to_dict(prop_row)
    contactos = conn.execute("SELECT * FROM contactos").fetchall()
    conn.close()

    results = []
    for c in contactos:
        c_dict = dict(c)
        try:
            prefs = json.loads(c_dict.get("preferencias") or "{}")
        except (json.JSONDecodeError, TypeError):
            prefs = {}
        if not prefs:
            continue
        score, reasons = _calc_match(prefs, p_dict)
        if score > 0:
            results.append({
                "contacto": {k: v for k, v in c_dict.items() if k != "preferencias"},
                "preferencias": prefs,
                "score": score,
                "reasons": reasons,
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return JSONResponse(results[:20])


# ── Web pública: solo propiedades activas ─────────
@app.get("/api/web/propiedades")
async def web_list_properties(
    q: str = "",
    tipo_propiedad: str = "",
    operacion: str = "",
    precio_min: str = "",
    precio_max: str = "",
    habitaciones: str = "",
):
    conn = get_db()
    sql = "SELECT * FROM propiedades WHERE estado = 'activo'"
    params = []

    if q:
        sql += " AND (titulo LIKE ? OR ciudad LIKE ? OR direccion LIKE ? OR provincia LIKE ?)"
        params.extend([f"%{q}%"] * 4)
    if tipo_propiedad:
        sql += " AND tipo_propiedad = ?"
        params.append(tipo_propiedad)
    if operacion:
        sql += " AND operacion = ?"
        params.append(operacion)
    if precio_min:
        sql += " AND CAST(precio AS REAL) >= ?"
        params.append(float(precio_min))
    if precio_max:
        sql += " AND CAST(precio AS REAL) <= ?"
        params.append(float(precio_max))
    if habitaciones:
        sql += " AND CAST(habitaciones AS INTEGER) >= ?"
        params.append(int(habitaciones))

    sql += " ORDER BY created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    # Strip internal fields
    results = []
    for r in rows:
        d = row_to_dict(r)
        for key in ("descripcion_agente", "cliente_comprador_id", "amenidades"):
            d.pop(key, None)
        results.append(d)
    return JSONResponse(results)


@app.get("/api/web/propiedades/{property_id}")
async def web_get_property(property_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM propiedades WHERE id = ? AND estado = 'activo'", (property_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    d = row_to_dict(row)
    for key in ("descripcion_agente", "cliente_comprador_id", "amenidades"):
        d.pop(key, None)
    return JSONResponse(d)


def _calc_match(prefs: dict, prop: dict) -> tuple:
    """Calculate match score (0-100) between preferences and property."""
    score = 0
    total = 0
    reasons = []

    # Operacion (must match if specified)
    if prefs.get("operacion"):
        total += 25
        if prefs["operacion"].lower() == (prop.get("operacion") or "").lower():
            score += 25
            reasons.append("Operacion coincide")
        else:
            return 0, []  # Hard filter — wrong operation = no match

    # Tipo de propiedad
    if prefs.get("tipo_propiedad"):
        total += 15
        if prefs["tipo_propiedad"].lower() == (prop.get("tipo_propiedad") or "").lower():
            score += 15
            reasons.append("Tipo coincide")

    # Ciudad
    if prefs.get("ciudad"):
        total += 15
        if prefs["ciudad"].lower() in (prop.get("ciudad") or "").lower():
            score += 15
            reasons.append("Ciudad coincide")

    # Precio
    precio_prop = 0
    try:
        precio_prop = float(prop.get("precio") or 0)
    except (ValueError, TypeError):
        pass

    has_precio_filter = False
    if prefs.get("precio_min") or prefs.get("precio_max"):
        total += 20
        has_precio_filter = True
        pmin = float(prefs.get("precio_min") or 0)
        pmax = float(prefs.get("precio_max") or 999999999)
        # Hard ceiling: max +20% over budget — anything beyond is excluded
        hard_max = pmax * 1.20 if pmax < 999999999 else 999999999
        if precio_prop > hard_max or precio_prop < pmin:
            return 0, []  # Hard filter — too expensive or too cheap
        if pmin <= precio_prop <= pmax:
            score += 20
            reasons.append("Precio en rango")
        elif precio_prop <= hard_max:
            # Within 20% tolerance — partial score
            score += 8
            over_pct = round((precio_prop - pmax) / pmax * 100)
            reasons.append(f"Precio +{over_pct}% sobre máximo")

    # Habitaciones
    if prefs.get("habitaciones_min"):
        total += 10
        try:
            hab_prop = int(prop.get("habitaciones") or 0)
            hab_min = int(prefs["habitaciones_min"])
            if hab_prop >= hab_min:
                score += 10
                reasons.append(f"{hab_prop} hab. (min {hab_min})")
        except (ValueError, TypeError):
            pass

    # Banos
    if prefs.get("banos_min"):
        total += 10
        try:
            ban_prop = int(prop.get("banos") or 0)
            ban_min = int(prefs["banos_min"])
            if ban_prop >= ban_min:
                score += 10
                reasons.append(f"{ban_prop} banos (min {ban_min})")
        except (ValueError, TypeError):
            pass

    # Superficie
    if prefs.get("superficie_min"):
        total += 10
        try:
            sup_prop = float(prop.get("superficie_util") or 0)
            sup_min = float(prefs["superficie_min"])
            if sup_prop >= sup_min:
                score += 10
                reasons.append(f"{sup_prop} m2 (min {sup_min})")
        except (ValueError, TypeError):
            pass

    # Normalize to 0-100
    if total == 0:
        return 0, []
    normalized = round(score / total * 100)
    return normalized, reasons
