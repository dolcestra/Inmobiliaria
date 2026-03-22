# Inmobiliaria Reyna

CRM inmobiliario inteligente para el mercado español (Zamora) con generación de textos AI, matching automático de propiedades y contactos, y gestión de interesados.

**Stack:** FastAPI + SQLite + OpenAI GPT-4o-mini + Leaflet.js + Vanilla JS

## Features

- **Generador de propiedades** con IA: crea textos de marketing automáticos (títulos, descripciones, copy Instagram, mensajes WhatsApp)
- **CRM completo**: lista de propiedades, búsqueda, filtros, mapa interactivo
- **Matching inteligente**: busca propiedades para contactos según preferencias (±20% precio tolerance)
- **Gestión de interesados**: registra visitas, ofertas, historial de actualizaciones
- **Geocodificación**: Nominatim/OSM para direcciones con coordenadas
- **Catálogo público**: sitio web con filtros para clientes
- **Cartel A4**: genera flyers printables de propiedades
- **Diagrama del sistema**: visualización completa de arquitectura, BD y flujos

## Instalación local

```bash
# Clone repo
git clone https://github.com/dolcestra/Inmobiliaria.git
cd Inmobiliaria

# Crear .env con tu API key
cp .env.example .env
# Edita .env y añade tu OPENAI_API_KEY

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar servidor
uvicorn main:app --reload --port 8000
```

Visita: http://localhost:8000

## Deployment en Railway

### 1. Crear cuenta en Railway.app
- Visita https://railway.app
- Click en **"Start a New Project"**
- Selecciona **"Deploy from GitHub repo"**
- Autoriza Railway y selecciona tu repo `dolcestra/Inmobiliaria`

### 2. Configurar variables de entorno
En el dashboard de Railway:
1. Click en tu proyecto → **"Variables"**
2. Añade una nueva variable:
   - **Key:** `OPENAI_API_KEY`
   - **Value:** Tu clave de OpenAI (obtén en https://platform.openai.com/api-keys)
3. Click **"Deploy"**

### 3. Obtener URL pública
- El deploy toma ~2 minutos
- En la sección **"Deployments"** verás la URL pública
- ¡Listo! Tu CRM estará en vivo

## Estructura de proyecto

```
/Users/adm/Inmobiliaria/
├── main.py              # FastAPI backend (31 endpoints)
├── inmobiliaria.db      # SQLite database
├── requirements.txt     # Dependencias Python
├── Procfile            # Config para Railway/Heroku
├── static/
│   ├── index.html      # Generador de propiedades
│   ├── propiedades.html # CRM (lista + mapa + detalle)
│   ├── contactos.html  # Gestión de contactos
│   ├── web.html        # Catálogo público
│   ├── web-detalle.html # Detalle de propiedad (público)
│   ├── cartel.html     # Flyer A4 printable
│   ├── diagrama.html   # Diagrama del sistema
│   ├── app.js          # Lógica formulario + geocoding
│   ├── crm.js          # Lógica CRM + mapas
│   ├── contactos.js    # Gestión de contactos
│   ├── shared.js       # Datos comunes (zonas, tipos, etc)
│   ├── style.css       # Estilos globales
│   ├── logo.png & logo-hq.png
│   └── uploads/        # Fotos de propiedades
└── .claude/            # Config Claude Code
```

## API Endpoints

### Propiedades
- `POST /api/propiedades` — Crear propiedad
- `GET /api/propiedades` — Listar (con filtros)
- `GET /api/propiedades/{id}` — Detalle
- `PATCH /api/propiedades/{id}` — Editar
- `DELETE /api/propiedades/{id}` — Eliminar
- `PATCH /api/propiedades/{id}/estado` — Cambiar estado
- `POST /api/propiedades/{id}/regenerar` — Regenerar textos IA

### Generación IA
- `POST /api/generate` — Generar textos para nueva propiedad
- `POST /api/propiedades/{id}/generar-instagram` — Generar copy Instagram

### Contactos & Matching
- `GET /api/contactos` — Listar contactos
- `POST /api/contactos` — Crear contacto
- `GET /api/contactos/{id}/matches` — Propiedades para contacto
- `GET /api/propiedades/{id}/matches` — Contactos para propiedad

### Interesados
- `POST /api/propiedades/{id}/interesados` — Agregar interesado
- `GET /api/propiedades/{id}/interesados` — Listar interesados
- `PATCH /api/interesados/{id}` — Actualizar interesado
- `DELETE /api/interesados/{id}` — Eliminar interesado

### Web pública
- `GET /api/web/propiedades` — Listar activas (público)
- `GET /api/web/propiedades/{id}` — Detalle (público)

## Base de Datos

### Tablas
- **propiedades** (35 columnas) — Datos + textos IA + fotos + coords
- **contactos** (6 cols + preferencias JSON) — Leads + preferencias
- **interesados** (11 columnas) — Seguimiento por propiedad

### Características
- SQLite con WAL mode (mejor concurrencia)
- Referencias auto-generadas: `RI-YYYYMM-NNNN`
- Fotos en `/static/uploads/{property_id}/`
- Historial de actualizaciones en JSON

## Tecnologías

**Backend:**
- FastAPI 0.115.0
- Uvicorn 0.32.0
- OpenAI 1.54.0 (gpt-4o-mini)
- SQLite3 (built-in)
- python-multipart (file uploads)

**Frontend:**
- HTML5 + CSS3 + Vanilla JavaScript
- Leaflet.js 1.9.4 (mapas)
- Nominatim/OpenStreetMap (geocoding)
- Google Fonts: Inter + Playfair Display
- Responsive (mobile + desktop)

## Configuración & Datos

**Ciudades soportadas:** Zamora, Benavente, Toro, Puebla de Sanabria, Morales del Vino, Villalpando, Fermoselle, Corrales del Vino, Fuentesaúco, Bermillo de Sayago

**Tipos de propiedad:** Piso, Apartamento, Casa/Chalet, Ático, Dúplex, Estudio, Finca, Local comercial, Terreno

**Estados:** Activo, Retirado, Vendido, Alquilado

**Amenidades:** 20 tipos (Terraza, Balcón, Trastero, Piscina, AC, Calefacción, etc.)

**Zonas por ciudad:** 61 barrios totales distribuidos en 10 ciudades

## Motor de Matching

Scoring 0-100 por propiedad:
- Operación (Venta/Alquiler): 25pts (hard filter)
- Precio: 20pts (dentro rango, +1-20%: 8pts, >+20%: descartado)
- Tipo: 15pts
- Ciudad: 15pts
- Habitaciones, Baños, Superficie: 10pts cada uno

## Diagrama del Sistema

Visualización interactiva en `/static/diagrama.html`:
- **Arquitectura:** Frontend, Backend, DB, servicios externos
- **ERD:** Tablas y relaciones
- **Flujos:** Creación de propiedad, matching, interesados, geocoding

## Licencia

Privada — Uso interno Inmobiliaria Reyna

## Contacto

Zamora, España
