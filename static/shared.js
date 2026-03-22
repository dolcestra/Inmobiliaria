/* ── Inmobiliaria Reyna · shared.js ─────────────────────────────────
 *  Datos y utilidades compartidas entre todas las páginas.
 *  Este fichero debe cargarse ANTES de app.js, crm.js y contactos.js.
 * ─────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Zonas por ciudad (provincia de Zamora) ────────────────────────
  const ZONAS_POR_CIUDAD = {
    'Zamora': [
      'Centro', 'San Lázaro', 'San José Obrero', 'Los Bloques', 'Pinilla',
      'Candelaria', 'Las Viñas', 'Cabañales', 'Olivares', 'La Horta',
      'San Frontis', 'Espíritu Santo', 'Pantoja', 'Obelisco', 'San Isidro',
      'Barriada de Asturias', 'Ciudad Jardín', 'Tres Árboles',
      'Puente de Hierro', 'La Lana', 'Valorio', 'El Sepulcro',
      'San Ramón', 'Peña de Francia', 'La Marina', 'Casco Antiguo',
      'Santa Clara', 'La Vega', 'Bosque de Valorio'
    ],
    'Benavente': [
      'Centro', 'La Rosaleda', 'San Isidro', 'Las Eras',
      'La Mota', 'Los Salados', 'El Pinar', 'Santa Clara'
    ],
    'Toro': [
      'Centro', 'Casco Histórico', 'San Julián', 'Santa Marina',
      'El Arrabal', 'La Vega'
    ],
    'Puebla de Sanabria': [
      'Centro', 'Casco Antiguo', 'San Cayetano', 'El Puente'
    ],
    'Morales del Vino': ['Centro', 'Las Bodegas', 'El Prado'],
    'Villalpando': ['Centro', 'San Andrés', 'Afueras'],
    'Fermoselle': ['Centro', 'Casco Antiguo', 'Las Arribes'],
    'Corrales del Vino': ['Centro', 'Las Bodegas'],
    'Fuentesaúco': ['Centro', 'Las Eras'],
    'Bermillo de Sayago': ['Centro', 'Afueras'],
  };

  // ── Ciudades disponibles ──────────────────────────────────────────
  const CIUDADES = Object.keys(ZONAS_POR_CIUDAD);

  // ── Tipos de propiedad ────────────────────────────────────────────
  const TIPOS_PROPIEDAD = [
    'Piso', 'Apartamento', 'Casa / Chalet', 'Ático', 'Dúplex',
    'Estudio', 'Finca', 'Local comercial', 'Terreno'
  ];

  // ── Estados de una propiedad (con etiqueta y color) ───────────────
  const ESTADOS = {
    activo:    { label: 'Activo',    color: '#27ae60' },
    retirado:  { label: 'Retirado',  color: '#95a5a6' },
    vendido:   { label: 'Vendido',   color: '#1a6b5a' },
    alquilado: { label: 'Alquilado', color: '#2980b9' },
  };

  // ── esc(str) — Escapa HTML para prevenir XSS ─────────────────────
  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── formatPrice(price) — Formatea precio con locale es-ES ────────
  function formatPrice(price) {
    const num = parseInt(price);
    if (isNaN(num)) return price || '\u2014';
    return num.toLocaleString('es-ES');
  }

  // ── showToast(msg, toastEl) — Notificación tipo toast ─────────────
  //    Si no se pasa toastEl, busca el elemento con id="toast".
  let _toastTimer;
  function showToast(msg, toastEl) {
    const el = toastEl || document.getElementById('toast');
    if (!el) return;
    el.textContent = msg || 'Hecho';
    clearTimeout(_toastTimer);
    el.classList.add('show');
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
  }

  // ── copyToClipboard(text) — Copia texto al portapapeles ───────────
  //    Usa la API moderna con fallback a execCommand para
  //    navegadores antiguos.
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  // ── Exportar como objeto Shared y como globales individuales ──────
  const Shared = {
    ZONAS_POR_CIUDAD,
    CIUDADES,
    TIPOS_PROPIEDAD,
    ESTADOS,
    esc,
    formatPrice,
    showToast,
    copyToClipboard,
  };

  // Objeto agrupado
  window.Shared = Shared;

  // Globales individuales (compatibilidad retroactiva)
  window.ZONAS_POR_CIUDAD = ZONAS_POR_CIUDAD;
  window.CIUDADES          = CIUDADES;
  window.TIPOS_PROPIEDAD   = TIPOS_PROPIEDAD;
  window.ESTADOS           = ESTADOS;
  window.esc               = esc;
  window.formatPrice       = formatPrice;
  window.showToast         = showToast;
  window.copyToClipboard   = copyToClipboard;

})();
