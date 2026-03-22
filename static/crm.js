/* ── Inmobiliaria Reyna · crm.js ── */

document.addEventListener('DOMContentLoaded', () => {

  const grid      = document.getElementById('crmGrid');
  const emptyMsg  = document.getElementById('crmEmpty');
  const countEl   = document.getElementById('crmCount');
  const modal     = document.getElementById('detailModal');
  const modalBody = document.getElementById('detailContent');
  const toast     = document.getElementById('toast');

  // Datos compartidos: usa shared.js (window.ZONAS_POR_CIUDAD, window.ESTADOS, etc.)
  const ZONAS_POR_CIUDAD = window.ZONAS_POR_CIUDAD;
  const ESTADOS          = window.ESTADOS;
  const esc              = window.esc;
  const formatPrice      = window.formatPrice;

  // Returns filtered estados based on operacion (Venta can't be "Alquilado", Alquiler can't be "Vendido")
  function getEstadosForOperacion(operacion) {
    return Object.entries(ESTADOS).filter(([key]) => {
      if (operacion === 'Alquiler' && key === 'vendido') return false;
      if (operacion !== 'Alquiler' && key === 'alquilado') return false;
      return true;
    });
  }

  loadProperties();

  // ── Search ─────────────────────────────────────────
  let debounce;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(loadProperties, 300);
  });

  ['filterTipo', 'filterOperacion', 'filterEstado', 'precioMin', 'precioMax'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadProperties);
  });

  // ── Fetch & render ─────────────────────────────────
  async function loadProperties() {
    grid.innerHTML = '<div class="crm-loading"><div class="spinner"></div><p>Cargando propiedades...</p></div>';

    const params = new URLSearchParams();
    const q    = document.getElementById('searchInput').value.trim();
    const tipo = document.getElementById('filterTipo').value;
    const op   = document.getElementById('filterOperacion').value;
    const est  = document.getElementById('filterEstado').value;
    const pmin = document.getElementById('precioMin').value;
    const pmax = document.getElementById('precioMax').value;

    if (q)    params.set('q', q);
    if (tipo) params.set('tipo_propiedad', tipo);
    if (op)   params.set('operacion', op);
    if (est)  params.set('estado', est);
    if (pmin) params.set('precio_min', pmin);
    if (pmax) params.set('precio_max', pmax);

    try {
      const res = await fetch(`/api/propiedades?${params}`);
      const data = await res.json();
      allProperties = data;
      renderGrid(data);
      if (mapVisible && crmMap) updateMapMarkers();
    } catch {
      grid.innerHTML = '<p style="color:var(--red)">Error al cargar propiedades</p>';
    }
  }

  // ── Map state ───────────────────────────────────────
  let allProperties = [];
  let crmMap = null;
  let mapVisible = false;
  let mapMarkers = [];

  window.toggleMapView = function() {
    const wrap = document.getElementById('crmMapWrap');
    const btn = document.getElementById('toggleMapBtn');
    mapVisible = !mapVisible;

    if (mapVisible) {
      wrap.style.display = 'block';
      btn.textContent = '📋 Ver lista';
      if (!crmMap) {
        crmMap = L.map('crmMap').setView([41.5034, -5.7467], 14); // Zamora center
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19
        }).addTo(crmMap);
      }
      setTimeout(() => { crmMap.invalidateSize(); updateMapMarkers(); }, 100);
    } else {
      wrap.style.display = 'none';
      btn.textContent = '🗺️ Ver mapa';
    }
  };

  function updateMapMarkers() {
    if (!crmMap) return;
    mapMarkers.forEach(m => crmMap.removeLayer(m));
    mapMarkers = [];

    const bounds = [];
    allProperties.forEach(p => {
      if (p.latitud && p.longitud) {
        const lat = parseFloat(p.latitud);
        const lng = parseFloat(p.longitud);
        if (isNaN(lat) || isNaN(lng)) return;
        bounds.push([lat, lng]);

        const price = formatPrice(p.precio);
        const priceSuffix = p.operacion === 'Alquiler' ? '/mes' : '';
        const marker = L.marker([lat, lng]).addTo(crmMap);
        marker.bindPopup(`
          <div style="min-width:180px">
            <strong style="font-size:13px">${esc(p.tipo_propiedad)} · ${esc(p.habitaciones)} hab.</strong><br>
            <span style="font-size:15px;font-weight:700;color:#1a6b5a">${price} €${priceSuffix}</span><br>
            <span style="font-size:12px;color:#666">${esc(p.direccion || p.ciudad)}</span><br>
            <span style="font-size:11px">${esc(p.superficie_util)} m² · ${esc(p.banos)} baños</span><br>
            <a href="#" onclick="event.preventDefault();viewDetail(${p.id})" style="font-size:12px;color:#c8a455;font-weight:600">Ver detalle →</a>
          </div>
        `);
        mapMarkers.push(marker);
      }
    });

    if (bounds.length > 0) {
      crmMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }

  function renderGrid(properties) {
    if (!properties.length) {
      grid.innerHTML = '';
      emptyMsg.style.display = 'block';
      countEl.textContent = '';
      return;
    }

    emptyMsg.style.display = 'none';
    countEl.textContent = `${properties.length} propiedad${properties.length !== 1 ? 'es' : ''}`;

    grid.innerHTML = properties.map(p => {
      const fotos = p.fotos || [];
      const foto = fotos.length > 0 ? fotos[0] : '';
      const photoStyle = foto ? `background-image:url('${foto}')` : '';
      const photoClass = foto ? 'crm-card-photo' : 'crm-card-photo no-photo';
      const price = formatPrice(p.precio);
      const calle = p.direccion && p.direccion !== 'Sin especificar' ? p.direccion : p.ciudad;
      const title = `${p.tipo_propiedad} · ${calle} · ${p.habitaciones} hab.`;
      const est = ESTADOS[p.estado] || ESTADOS.activo;

      const hasTexts = !!(p.titulo);
      const priceSuffix = p.operacion === 'Alquiler' ? '/mes' : '';

      return `
      <div class="crm-card" onclick="viewDetail(${p.id})" style="cursor:pointer">
        <div class="${photoClass}" style="${photoStyle}">
          ${!foto ? '🏠' : ''}
          <span class="crm-card-badge">${esc(p.operacion)}</span>
          ${!hasTexts ? '<span class="crm-card-no-texts">Sin textos IA</span>' : ''}
          <span class="crm-card-price">${price} €${priceSuffix}</span>
        </div>
        <div class="crm-card-body">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <h3 class="crm-card-title" style="margin:0">${esc(title)}</h3>
            <span class="estado-badge" style="background:${est.color}">${est.label}</span>
          </div>
          <p class="crm-card-location">${p.referencia ? `<span style="color:var(--accent);font-weight:600;font-size:11px">${esc(p.referencia)}</span> · ` : ''}${p.zona ? esc(p.zona) + ' · ' : ''}${esc(p.ciudad)}, ${esc(p.provincia)}</p>
          <div class="crm-card-stats">
            <span>${esc(p.superficie_util)} m²</span>
            <span>${esc(p.habitaciones)} hab.</span>
            <span>${esc(p.banos)} baños</span>
          </div>
          <div class="crm-card-actions">
            <button class="btn-edit-prop" onclick="event.stopPropagation(); openEditModal(${p.id})">✏️ Editar</button>
            <a class="btn-cartel-sm" href="/cartel/${p.id}" target="_blank" onclick="event.stopPropagation()">Cartel A4</a>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── View detail modal ──────────────────────────────
  window.viewDetail = async function(id) {
    try {
      const [propRes, intRes] = await Promise.all([
        fetch(`/api/propiedades/${id}`),
        fetch(`/api/propiedades/${id}/interesados`),
      ]);
      const p = await propRes.json();
      const interesados = await intRes.json();

      const fotos = p.fotos || [];
      const fotosHTML = fotos.length
        ? `<div class="modal-photos">${fotos.map(f => `<img src="${f}" alt="Foto">`).join('')}</div>`
        : '';

      const est = ESTADOS[p.estado] || ESTADOS.activo;

      const interesadosHTML = interesados.map(i => {
        // Parse visit dates (comma-separated)
        const visitas = (i.visita_fecha || '').split(',').map(d => d.trim()).filter(Boolean);
        const visitasChips = visitas.map(d => `<span class="visita-chip">${esc(d)}</span>`).join('');

        // Parse actualizaciones log (JSON array)
        let actualizaciones = [];
        try { actualizaciones = JSON.parse(i.actualizaciones || '[]'); } catch {}
        const actualizacionesHTML = actualizaciones.map(a =>
          `<div class="actualizacion-entry"><span class="actualizacion-fecha">${esc(a.fecha)}</span> ${esc(a.texto)}</div>`
        ).join('');

        return `
        <div class="interesado-row">
          <div class="interesado-left">
            <div class="interesado-info">
              <strong>${esc(i.nombre)}</strong>
              ${i.telefono ? `<span>${esc(i.telefono)}</span>` : ''}
              ${i.email ? `<span>${esc(i.email)}</span>` : ''}
            </div>
            <div class="interesado-meta">
              ${i.oferta ? `<span>Oferta: ${esc(i.oferta)} €</span>` : ''}
              <span class="resultado-badge resultado-${i.resultado || 'pendiente'}">${esc(i.resultado || 'pendiente')}</span>
            </div>
            ${visitas.length ? `<div class="interesado-visitas">${visitasChips}</div>` : ''}
            <div class="add-visita-form">
              <input type="date" id="add-visita-${i.id}">
              <button onclick="addVisita(${i.id}, ${p.id})">+ Visita</button>
            </div>
            ${i.notas ? `<div class="interesado-notas">${esc(i.notas)}</div>` : ''}
            <div class="interesado-actions">
              <button onclick="updateInteresado(${i.id}, 'compra')" class="btn-mini btn-mini-ok">Compra</button>
              <button onclick="updateInteresado(${i.id}, 'descartado')" class="btn-mini btn-mini-no">Descartar</button>
              <button onclick="deleteInteresado(${i.id}, ${p.id})" class="btn-mini btn-mini-del">Borrar</button>
            </div>
          </div>
          <div class="interesado-right">
            <div class="actualizaciones-title">Actualizaciones</div>
            <div class="actualizaciones-list">
              ${actualizacionesHTML || '<span style="font-size:12px;color:var(--text-muted)">Sin actualizaciones</span>'}
            </div>
            <div class="actualizacion-form">
              <input type="text" id="act-text-${i.id}" placeholder="Escribir actualización…">
              <button onclick="addActualizacion(${i.id}, ${p.id})">Añadir</button>
            </div>
          </div>
        </div>`;
      }).join('');

      const modalTitle = p.tipo_propiedad + (p.direccion && p.direccion !== 'Sin especificar' ? ' · ' + p.direccion : ' · ' + p.ciudad) + ' · ' + p.habitaciones + ' hab.';

      modalBody.innerHTML = `
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <h2 class="modal-title">${esc(modalTitle)}</h2>
        ${p.titulo ? `<p style="font-family:var(--font-heading);font-size:16px;color:var(--accent);margin-bottom:4px">${esc(p.titulo)}</p>` : ''}
        <p class="modal-meta">${esc(p.operacion)} · ${esc(p.ciudad)}, ${esc(p.provincia)} · ${esc(p.direccion || '')}${p.zona ? ' · Zona: ' + esc(p.zona) : ''}</p>

        <!-- Acciones rápidas -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
          <button class="btn-estado" onclick="openEditModal(${p.id})" style="background:var(--accent);color:#fff">✏️ Editar datos</button>
          ${!p.titulo
            ? `<button class="btn-regen-highlight" onclick="regenerarTextos(${p.id})" id="btn-regen-${p.id}">🤖 Generar textos con IA</button>`
            : `<button class="btn-estado" onclick="regenerarTextos(${p.id})" id="btn-regen-${p.id}">🤖 Regenerar textos</button>`
          }

          <!-- Estado dropdown -->
          <select class="estado-dropdown" onchange="changeEstado(${p.id}, this.value)"
            style="border-color:${est.color};color:${est.color}">
            ${getEstadosForOperacion(p.operacion).map(([key, val]) => `
              <option value="${key}" ${p.estado === key ? 'selected' : ''}>${val.label}</option>
            `).join('')}
          </select>
        </div>

        <!-- Tabs -->
        <div class="modal-tabs">
          <button class="modal-tab active" onclick="switchTab(this, 'tab-general-${p.id}')">General</button>
          <button class="modal-tab" onclick="switchTab(this, 'tab-fotos-${p.id}')">Fotos</button>
          <button class="modal-tab" onclick="switchTab(this, 'tab-descripciones-${p.id}')">Descripciones</button>
          <button class="modal-tab" onclick="switchTab(this, 'tab-cartel-${p.id}')">Cartel</button>
        </div>

        <!-- TAB: General -->
        <div class="modal-tab-content active" id="tab-general-${p.id}">
          ${fotosHTML}

          ${p.referencia ? `<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Ref: ${esc(p.referencia)}${p.ref_catastral ? ' · Cat: ' + esc(p.ref_catastral) : ''}</p>` : ''}

          <div class="modal-data-grid">
            <div class="modal-data-item">
              <span class="modal-data-value">${formatPrice(p.precio)} €${p.operacion === 'Alquiler' ? '/mes' : ''}</span>
              <span class="modal-data-label">Precio</span>
            </div>
            <div class="modal-data-item">
              <span class="modal-data-value">${esc(p.superficie_util)} m²</span>
              <span class="modal-data-label">Sup. útil</span>
            </div>
            ${p.superficie_construida && p.superficie_construida !== '0' ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.superficie_construida)} m²</span><span class="modal-data-label">Sup. construida</span></div>` : ''}
            <div class="modal-data-item">
              <span class="modal-data-value">${esc(p.habitaciones)}</span>
              <span class="modal-data-label">Habitaciones</span>
            </div>
            <div class="modal-data-item">
              <span class="modal-data-value">${esc(p.banos)}</span>
              <span class="modal-data-label">Baños</span>
            </div>
            ${p.planta ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.planta)}</span><span class="modal-data-label">Planta</span></div>` : ''}
            ${p.ascensor && p.ascensor !== 'No' ? `<div class="modal-data-item"><span class="modal-data-value">Sí</span><span class="modal-data-label">Ascensor</span></div>` : ''}
            ${p.garaje && p.garaje !== 'No' ? `<div class="modal-data-item"><span class="modal-data-value">Sí</span><span class="modal-data-label">Garaje</span></div>` : ''}
            ${p.estado_vivienda ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.estado_vivienda)}</span><span class="modal-data-label">Estado</span></div>` : ''}
            ${p.anio_construccion ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.anio_construccion)}</span><span class="modal-data-label">Año</span></div>` : ''}
            ${p.eficiencia_energetica ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.eficiencia_energetica)}</span><span class="modal-data-label">Energía</span></div>` : ''}
            ${p.orientacion ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.orientacion)}</span><span class="modal-data-label">Orientación</span></div>` : ''}
            ${p.exterior_interior ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.exterior_interior)}</span><span class="modal-data-label">Tipo</span></div>` : ''}
            ${p.gastos_comunidad ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.gastos_comunidad)} €</span><span class="modal-data-label">Comunidad/mes</span></div>` : ''}
            ${p.ibi ? `<div class="modal-data-item"><span class="modal-data-value">${esc(p.ibi)} €</span><span class="modal-data-label">IBI/año</span></div>` : ''}
          </div>

          ${p.descripcion_agente ? `<div class="modal-section"><div class="modal-section-title">Notas del agente</div><div class="modal-section-content" style="font-size:13px;color:var(--text-muted);font-style:italic">${esc(p.descripcion_agente)}</div></div>` : ''}

          <!-- Interesados -->
          <div class="modal-section">
            <div class="modal-section-title">Interesados (${interesados.length})</div>

            <div id="interesados-list">
              ${interesadosHTML || '<p style="color:var(--text-muted);font-size:13px">Ningún interesado registrado</p>'}
            </div>

            <div class="add-interesado-form" style="margin-top:12px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="int-autocomplete-wrap">
                  <input type="text" id="int-nombre" placeholder="Nombre *" style="font-size:13px;padding:8px" autocomplete="off">
                  <input type="hidden" id="int-contacto-id" value="">
                  <div class="int-autocomplete-dropdown" id="int-nombre-dropdown"></div>
                </div>
                <input type="text" id="int-telefono" placeholder="Teléfono" style="font-size:13px;padding:8px">
                <input type="email" id="int-email" placeholder="Email" style="font-size:13px;padding:8px">
                <input type="text" id="int-oferta" placeholder="Oferta (€)" style="font-size:13px;padding:8px">
                <input type="date" id="int-visita" style="font-size:13px;padding:8px">
                <input type="text" id="int-notas" placeholder="Notas" style="font-size:13px;padding:8px">
              </div>
              <button class="btn-gold" style="margin-top:8px;padding:8px 16px;font-size:13px" onclick="addInteresado(${p.id})">Registrar interesado</button>
            </div>
          </div>

          ${p.latitud && p.longitud ? `<div class="modal-section"><div class="modal-section-title">Ubicación</div><div id="detail-map-${p.id}" style="height:200px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border-light)"></div></div>` : ''}
        </div>

        <!-- TAB: Fotos -->
        <div class="modal-tab-content" id="tab-fotos-${p.id}">
          <div class="modal-section">
            <div class="modal-section-title">Fotos de la propiedad (${fotos.length})</div>
            <div class="detail-photos-grid" id="detail-photos-grid-${p.id}">
              ${fotos.length
                ? fotos.map((f, i) => `
                  <div class="detail-photo-item" id="detail-photo-${p.id}-${i}">
                    <img src="${f}" alt="Foto ${i+1}">
                    <button type="button" class="edit-photo-delete" onclick="deleteDetailPhoto(${p.id}, '${f}', ${i})" title="Eliminar foto">&times;</button>
                    ${i === 0 ? '<span class="portada-badge-sm">★ Portada</span>' : ''}
                  </div>
                `).join('')
                : '<p style="color:var(--text-muted);font-size:13px">Sin fotos</p>'
              }
            </div>
          </div>
          <div class="modal-section">
            <div class="modal-section-title">Subir nuevas fotos</div>
            <div class="upload-area-mini" onclick="document.getElementById('detail-fotos-input-${p.id}').click()">
              <input type="file" id="detail-fotos-input-${p.id}" accept="image/*" multiple style="display:none">
              <span>📷 Arrastra o haz clic para añadir fotos</span>
            </div>
            <div class="edit-photos-grid" id="detail-new-photos-preview-${p.id}" style="margin-top:8px"></div>
            <button type="button" class="btn-gold" id="detail-upload-btn-${p.id}" style="margin-top:10px;padding:8px 20px;font-size:13px;display:none" onclick="uploadDetailPhotos(${p.id})">Subir fotos</button>
          </div>
        </div>

        <!-- TAB: Descripciones -->
        <div class="modal-tab-content" id="tab-descripciones-${p.id}">

          <!-- Título -->
          <div class="desc-edit-section">
            <div class="desc-edit-header">
              <label class="desc-edit-label">Título del anuncio</label>
              <button class="desc-copy-btn" onclick="copyField('edit-titulo-${p.id}', this)">Copiar</button>
            </div>
            <input type="text" class="desc-edit-input" id="edit-titulo-${p.id}" value="${esc(p.titulo || '')}" placeholder="Título del anuncio...">
          </div>

          <!-- Descripción corta -->
          <div class="desc-edit-section">
            <div class="desc-edit-header">
              <label class="desc-edit-label">Descripción corta <small>Idealista / Fotocasa</small></label>
              <button class="desc-copy-btn" onclick="copyField('edit-corta-${p.id}', this)">Copiar</button>
            </div>
            <textarea class="desc-edit-textarea" id="edit-corta-${p.id}" rows="5" placeholder="Descripción corta del anuncio...">${esc(p.descripcion_corta || '')}</textarea>
          </div>

          <!-- Descripción larga -->
          <div class="desc-edit-section">
            <div class="desc-edit-header">
              <label class="desc-edit-label">Descripción larga <small>Web / Lujo</small></label>
              <button class="desc-copy-btn" onclick="copyField('edit-larga-${p.id}', this)">Copiar</button>
            </div>
            <textarea class="desc-edit-textarea" id="edit-larga-${p.id}" rows="8" placeholder="Descripción larga del anuncio...">${esc(p.descripcion_larga || '')}</textarea>
          </div>

          <!-- Copy Instagram -->
          <div class="desc-edit-section">
            <div class="desc-edit-header">
              <label class="desc-edit-label">Copy Instagram + Hashtags</label>
              <div style="display:flex;gap:6px">
                ${p.copy_instagram
                  ? `<button class="desc-copy-btn" onclick="copyField('edit-ig-${p.id}', this)">Copiar</button>
                     <button class="desc-regen-btn" onclick="generarInstagram(${p.id})" id="btn-ig-${p.id}">Regenerar</button>`
                  : `<button class="desc-regen-btn btn-regen-highlight" onclick="generarInstagram(${p.id})" id="btn-ig-${p.id}" style="font-size:12px">📸 Generar</button>`
                }
              </div>
            </div>
            <textarea class="desc-edit-textarea" id="edit-ig-${p.id}" rows="5" placeholder="Copy para Instagram (se genera por separado)...">${esc(p.copy_instagram || '')}</textarea>
          </div>

          <!-- Mensaje WhatsApp -->
          <div class="desc-edit-section">
            <div class="desc-edit-header">
              <label class="desc-edit-label">Mensaje WhatsApp</label>
              <button class="desc-copy-btn" onclick="copyField('edit-wa-${p.id}', this)">Copiar</button>
            </div>
            <textarea class="desc-edit-textarea" id="edit-wa-${p.id}" rows="3" placeholder="Mensaje para WhatsApp...">${esc(p.mensaje_whatsapp || '')}</textarea>
          </div>

          <!-- Acciones -->
          <div class="desc-edit-actions">
            <button class="btn-gold" onclick="saveTextos(${p.id})" id="btn-save-textos-${p.id}" style="padding:10px 24px;font-size:13px">Guardar textos</button>
            <button class="desc-copy-btn" onclick="copyAllTextos(${p.id})" style="padding:8px 16px">Copiar todo</button>
          </div>
        </div>

        <!-- TAB: Cartel -->
        <div class="modal-tab-content" id="tab-cartel-${p.id}">
          <div style="text-align:center;padding:32px 16px">
            <p style="font-size:15px;color:var(--text-secondary);margin-bottom:16px">Genera un cartel A4 profesional listo para imprimir o guardar como PDF.</p>
            <a class="btn-gold" href="/cartel/${p.id}" target="_blank" style="font-size:16px;padding:14px 32px">🖨️ Ver Cartel A4</a>
          </div>
        </div>

        <div class="modal-actions" style="margin-top:16px">
          <button class="btn-regenerate" onclick="closeModal()">Cerrar</button>
          <button class="btn-delete-prop" onclick="deleteProp(${p.id})" style="margin-left:auto">🗑️ Eliminar propiedad</button>
        </div>
      `;

      modal.style.display = 'flex';

      // Initialize mini map in detail view
      if (p.latitud && p.longitud) {
        setTimeout(() => {
          const mapEl = document.getElementById(`detail-map-${p.id}`);
          if (mapEl) {
            const lat = parseFloat(p.latitud);
            const lng = parseFloat(p.longitud);
            const miniMap = L.map(mapEl, { scrollWheelZoom: false }).setView([lat, lng], 16);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OSM', maxZoom: 19
            }).addTo(miniMap);
            L.marker([lat, lng]).addTo(miniMap);
            setTimeout(() => miniMap.invalidateSize(), 200);
          }
        }, 150);
      }

      // Setup photo upload in Fotos tab
      const detailFotosInput = document.getElementById(`detail-fotos-input-${p.id}`);
      const detailPreview = document.getElementById(`detail-new-photos-preview-${p.id}`);
      const detailUploadBtn = document.getElementById(`detail-upload-btn-${p.id}`);
      if (detailFotosInput && detailPreview) {
        detailFotosInput.addEventListener('change', () => {
          detailPreview.innerHTML = '';
          if (detailFotosInput.files.length > 0) {
            detailUploadBtn.style.display = 'inline-flex';
            Array.from(detailFotosInput.files).forEach(file => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'edit-photo-thumb';
                div.innerHTML = `<img src="${e.target.result}" alt="${esc(file.name)}">`;
                detailPreview.appendChild(div);
              };
              reader.readAsDataURL(file);
            });
          } else {
            detailUploadBtn.style.display = 'none';
          }
        });
      }

      // Setup autocomplete for interesado name
      if (typeof setupContactoAutocomplete === 'function') setupContactoAutocomplete();
    } catch (err) {
      alert('Error al cargar detalle');
    }
  };

  // ── Estado ─────────────────────────────────────────
  window.changeEstado = async function(propId, estado) {
    const formData = new FormData();
    formData.append('estado', estado);
    try {
      await fetch(`/api/propiedades/${propId}/estado`, { method: 'PATCH', body: formData });
      showToast(`Estado: ${ESTADOS[estado]?.label || estado}`);
      viewDetail(propId);
      loadProperties();
    } catch { alert('Error al cambiar estado'); }
  };

  // ── Interesados ────────────────────────────────────
  window.addInteresado = async function(propId) {
    const nombre = document.getElementById('int-nombre').value.trim();
    if (!nombre) { alert('El nombre es obligatorio'); return; }

    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('telefono', document.getElementById('int-telefono').value.trim());
    formData.append('email', document.getElementById('int-email').value.trim());
    formData.append('oferta', document.getElementById('int-oferta').value.trim());
    formData.append('visita_fecha', document.getElementById('int-visita').value);
    formData.append('notas', document.getElementById('int-notas').value.trim());

    const contactoId = document.getElementById('int-contacto-id').value;
    if (contactoId) formData.append('contacto_id', contactoId);

    try {
      await fetch(`/api/propiedades/${propId}/interesados`, { method: 'POST', body: formData });
      showToast('Interesado registrado');
      viewDetail(propId);
    } catch { alert('Error al registrar'); }
  };

  // ── Autocomplete contactos for interesado name ────
  window.setupContactoAutocomplete = function() {
    const input = document.getElementById('int-nombre');
    const dropdown = document.getElementById('int-nombre-dropdown');
    const hiddenId = document.getElementById('int-contacto-id');
    if (!input || !dropdown) return;

    let acDebounce;

    input.addEventListener('input', () => {
      clearTimeout(acDebounce);
      hiddenId.value = '';
      const q = input.value.trim();
      if (q.length < 2) { dropdown.classList.remove('open'); return; }
      acDebounce = setTimeout(() => searchContactos(q), 250);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dropdown.classList.remove('open');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.int-autocomplete-wrap')) dropdown.classList.remove('open');
    });

    async function searchContactos(q) {
      try {
        const res = await fetch(`/api/contactos/search/${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!data.length) {
          dropdown.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">Nuevo contacto — se creará automáticamente</div>';
          dropdown.classList.add('open');
          return;
        }
        dropdown.innerHTML = data.map(c => `
          <div class="int-autocomplete-item" data-id="${c.id}" data-nombre="${esc(c.nombre)}" data-telefono="${esc(c.telefono || '')}" data-email="${esc(c.email || '')}">
            ${esc(c.nombre)}<small>${[c.telefono, c.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small>
          </div>
        `).join('');
        dropdown.classList.add('open');

        dropdown.querySelectorAll('.int-autocomplete-item').forEach(el => {
          el.addEventListener('click', () => {
            input.value = el.dataset.nombre;
            hiddenId.value = el.dataset.id;
            const telField = document.getElementById('int-telefono');
            const emailField = document.getElementById('int-email');
            if (telField && el.dataset.telefono && !telField.value) telField.value = el.dataset.telefono;
            if (emailField && el.dataset.email && !emailField.value) emailField.value = el.dataset.email;
            dropdown.classList.remove('open');
          });
        });
      } catch {
        dropdown.classList.remove('open');
      }
    }
  };

  window.updateInteresado = async function(intId, resultado) {
    const formData = new FormData();
    formData.append('resultado', resultado);
    try {
      await fetch(`/api/interesados/${intId}`, { method: 'PATCH', body: formData });
      showToast(`Resultado: ${resultado}`);
      // Refresh the modal — get propId from URL in modal content
      const propLink = modalBody.querySelector('a[href^="/cartel/"]');
      if (propLink) {
        const propId = propLink.href.split('/').pop();
        viewDetail(parseInt(propId));
      }
    } catch { alert('Error'); }
  };

  window.addVisita = async function(intId, propId) {
    const dateInput = document.getElementById(`add-visita-${intId}`);
    if (!dateInput || !dateInput.value) { alert('Selecciona una fecha'); return; }
    const formData = new FormData();
    formData.append('add_visita', dateInput.value);
    try {
      await fetch(`/api/interesados/${intId}`, { method: 'PATCH', body: formData });
      showToast('Visita añadida');
      viewDetail(propId);
    } catch { alert('Error'); }
  };

  window.addActualizacion = async function(intId, propId) {
    const textInput = document.getElementById(`act-text-${intId}`);
    if (!textInput || !textInput.value.trim()) { alert('Escribe una actualización'); return; }
    const formData = new FormData();
    formData.append('actualizacion', textInput.value.trim());
    try {
      await fetch(`/api/interesados/${intId}`, { method: 'PATCH', body: formData });
      showToast('Actualización añadida');
      viewDetail(propId);
    } catch { alert('Error'); }
  };

  window.deleteInteresado = async function(intId, propId) {
    if (!confirm('¿Eliminar este interesado?')) return;
    try {
      await fetch(`/api/interesados/${intId}`, { method: 'DELETE' });
      showToast('Interesado eliminado');
      viewDetail(propId);
    } catch { alert('Error'); }
  };

  // ── Regenerar textos con IA ───────────────────────
  window.regenerarTextos = async function(propId) {
    const btn = document.getElementById(`btn-regen-${propId}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
    try {
      const res = await fetch(`/api/propiedades/${propId}/regenerar`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Error' }));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      showToast('Textos generados con IA');
      viewDetail(propId);
      loadProperties();
    } catch (err) {
      alert('Error al generar textos:\n\n' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 Generar textos con IA'; }
    }
  };

  // ── Generar copy Instagram por separado ──────────
  window.generarInstagram = async function(propId) {
    const btn = document.getElementById(`btn-ig-${propId}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando…'; }
    try {
      const res = await fetch(`/api/propiedades/${propId}/generar-instagram`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Error' }));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      showToast('Copy Instagram generado');
      viewDetail(propId);
    } catch (err) {
      alert('Error al generar Instagram:\n\n' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📸 Generar copy Instagram'; }
    }
  };

  // ── Textos: save, copy, copy all ────────────────
  window.saveTextos = async function(propId) {
    const btn = document.getElementById(`btn-save-textos-${propId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      const fd = new FormData();
      fd.append('titulo', document.getElementById(`edit-titulo-${propId}`).value);
      fd.append('descripcion_corta', document.getElementById(`edit-corta-${propId}`).value);
      fd.append('descripcion_larga', document.getElementById(`edit-larga-${propId}`).value);
      fd.append('copy_instagram', document.getElementById(`edit-ig-${propId}`).value);
      fd.append('mensaje_whatsapp', document.getElementById(`edit-wa-${propId}`).value);
      const res = await fetch(`/api/propiedades/${propId}/textos`, { method: 'PATCH', body: fd });
      if (!res.ok) throw new Error('Error al guardar');
      showToast('Textos guardados');
      loadProperties();
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar textos'; }
    }
  };

  window.copyField = async function(fieldId, btn) {
    const el = document.getElementById(fieldId);
    const text = el.value !== undefined ? el.value : el.textContent;
    if (!text.trim()) { showToast('Campo vacío'); return; }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copiado';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    }
    showToast('Copiado al portapapeles');
  };

  window.copyAllTextos = async function(propId) {
    const parts = [
      ['TÍTULO', `edit-titulo-${propId}`],
      ['DESCRIPCIÓN CORTA', `edit-corta-${propId}`],
      ['DESCRIPCIÓN LARGA', `edit-larga-${propId}`],
      ['COPY INSTAGRAM', `edit-ig-${propId}`],
      ['MENSAJE WHATSAPP', `edit-wa-${propId}`],
    ];
    const text = parts.map(([label, id]) => {
      const el = document.getElementById(id);
      const val = el ? (el.value || '') : '';
      return val ? `── ${label} ──\n${val}` : '';
    }).filter(Boolean).join('\n\n');
    if (!text.trim()) { showToast('No hay textos'); return; }
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('Todo copiado al portapapeles');
  };

  // ── Detail photo management ─────────────────────
  window.deleteDetailPhoto = async function(propId, photoSrc, index) {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      const fd = new FormData();
      fd.append('fotos_eliminar', JSON.stringify([photoSrc]));
      const res = await fetch(`/api/propiedades/${propId}`, { method: 'PATCH', body: fd });
      if (!res.ok) throw new Error('Error al eliminar foto');
      showToast('Foto eliminada');
      viewDetail(propId);
      loadProperties();
    } catch (err) { alert(err.message); }
  };

  window.uploadDetailPhotos = async function(propId) {
    const input = document.getElementById(`detail-fotos-input-${propId}`);
    if (!input || !input.files.length) return;
    const btn = document.getElementById(`detail-upload-btn-${propId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
    try {
      const fd = new FormData();
      Array.from(input.files).forEach(f => fd.append('fotos_nuevas', f));
      const res = await fetch(`/api/propiedades/${propId}`, { method: 'PATCH', body: fd });
      if (!res.ok) throw new Error('Error al subir fotos');
      showToast('Fotos subidas');
      viewDetail(propId);
      loadProperties();
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Subir fotos'; }
    }
  };

  // ── Modal de edición de propiedad ────────────────
  window.openEditModal = async function(propId) {
    try {
      const res = await fetch(`/api/propiedades/${propId}`);
      const p = await res.json();

      const TIPOS = window.TIPOS_PROPIEDAD;
      const ENERGIAS = ['','A','B','C','D','E','F','G','En trámite'];
      const ORIENTACIONES = ['','Norte','Sur','Este','Oeste','Noreste','Noroeste','Sureste','Suroeste'];
      const CIUDADES = window.CIUDADES;
      const zonasCiudad = ZONAS_POR_CIUDAD[p.ciudad] || [];
      const zonasOptions = '<option value="">—</option>' + zonasCiudad.map(z => `<option ${p.zona===z?'selected':''}>${z}</option>`).join('');

      modalBody.innerHTML = `
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <h2 class="modal-title">Editar propiedad</h2>
        <p class="modal-meta">Ref: ${esc(p.referencia || '—')}</p>

        <form id="editPropForm" style="display:grid;gap:12px;margin-top:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field">
              <label>Tipo *</label>
              <select name="tipo_propiedad">${TIPOS.map(t => `<option ${p.tipo_propiedad===t?'selected':''}>${t}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label>Operación *</label>
              <select name="operacion">
                <option ${p.operacion==='Venta'?'selected':''}>Venta</option>
                <option ${p.operacion==='Alquiler'?'selected':''}>Alquiler</option>
              </select>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px">
            <div class="field">
              <label>Dirección * <span class="verified-badge" id="edit-dir-verified" style="display:${p.latitud ? 'inline-block' : 'none'}">Verificada</span></label>
              <div class="autocomplete-wrap">
                <input type="text" name="direccion" id="edit-direccion-input" value="${esc(p.direccion || '')}" placeholder="Escribe una dirección..." autocomplete="off" required>
                <div class="autocomplete-dropdown" id="edit-direccion-dropdown"></div>
              </div>
              <input type="hidden" name="latitud" id="edit-latitud" value="${p.latitud || ''}">
              <input type="hidden" name="longitud" id="edit-longitud" value="${p.longitud || ''}">
            </div>
            <div class="field">
              <label>Ciudad *</label>
              <select name="ciudad" id="edit-ciudad-select">
                ${CIUDADES.map(c => `<option ${p.ciudad===c?'selected':''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Provincia *</label>
              <input type="text" name="provincia" value="${esc(p.provincia || '')}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field">
              <label>Zona / Barrio</label>
              <select name="zona" id="edit-zona-select">${zonasOptions}</select>
            </div>
            <div class="field">
              <label>C.P.</label>
              <input type="text" name="codigo_postal" value="${esc(p.codigo_postal || '')}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
            <div class="field">
              <label>Precio (€) *</label>
              <input type="number" name="precio" value="${p.precio || ''}">
            </div>
            <div class="field">
              <label>Sup. construida (m²)</label>
              <input type="number" name="superficie_construida" value="${p.superficie_construida || ''}">
            </div>
            <div class="field">
              <label>Sup. útil (m²) *</label>
              <input type="number" name="superficie_util" value="${p.superficie_util || ''}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
            <div class="field">
              <label>Habitaciones *</label>
              <input type="number" name="habitaciones" value="${p.habitaciones || ''}">
            </div>
            <div class="field">
              <label>Baños *</label>
              <input type="number" name="banos" value="${p.banos || ''}">
            </div>
            <div class="field">
              <label>Planta</label>
              <input type="text" name="planta" value="${esc(p.planta || '')}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
            <div class="field">
              <label>Ascensor</label>
              <select name="ascensor">
                <option ${p.ascensor==='No'?'selected':''}>No</option>
                <option ${p.ascensor==='Sí'?'selected':''}>Sí</option>
              </select>
            </div>
            <div class="field">
              <label>Garaje</label>
              <select name="garaje">
                <option ${p.garaje==='No'?'selected':''}>No</option>
                <option ${p.garaje==='Sí'?'selected':''}>Sí</option>
              </select>
            </div>
            <div class="field">
              <label>Estado vivienda</label>
              <select name="estado_vivienda">
                <option value="">—</option>
                <option ${p.estado_vivienda==='Obra nueva'?'selected':''}>Obra nueva</option>
                <option ${p.estado_vivienda==='Buen estado'?'selected':''}>Buen estado</option>
                <option ${p.estado_vivienda==='Reformado recientemente'?'selected':''}>Reformado recientemente</option>
                <option ${p.estado_vivienda==='A reformar'?'selected':''}>A reformar</option>
              </select>
            </div>
            <div class="field">
              <label>Año construcción</label>
              <input type="number" name="anio_construccion" value="${p.anio_construccion || ''}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
            <div class="field">
              <label>Energía</label>
              <select name="eficiencia_energetica">${ENERGIAS.map(e => `<option ${p.eficiencia_energetica===e?'selected':''}>${e || '—'}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label>Orientación</label>
              <select name="orientacion">${ORIENTACIONES.map(o => `<option ${p.orientacion===o?'selected':''}>${o || '—'}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label>Comunidad (€/mes)</label>
              <input type="number" name="gastos_comunidad" value="${p.gastos_comunidad || ''}">
            </div>
            <div class="field">
              <label>IBI (€/año)</label>
              <input type="number" name="ibi" value="${p.ibi || ''}">
            </div>
          </div>

          <div class="field">
            <label>Notas internas del agente</label>
            <textarea name="descripcion_agente" rows="2">${esc(p.descripcion_agente || '')}</textarea>
          </div>

          <div class="field">
            <label>Ref. catastral</label>
            <input type="text" name="ref_catastral" value="${esc(p.ref_catastral || '')}">
          </div>

          <!-- Gestión de fotos -->
          <div class="field">
            <label>Fotos actuales</label>
            <input type="hidden" name="fotos_eliminar" id="fotos-eliminar" value="[]">
            <div class="edit-photos-grid" id="edit-photos-grid">
              ${(p.fotos || []).map((f, i) => `
                <div class="edit-photo-thumb" data-src="${f}" id="edit-photo-${i}">
                  <img src="${f}" alt="Foto ${i+1}">
                  <button type="button" class="edit-photo-delete" onclick="markPhotoDelete(${i}, '${f}')" title="Eliminar foto">&times;</button>
                </div>
              `).join('') || '<span style="color:var(--text-muted);font-size:13px">Sin fotos</span>'}
            </div>
          </div>
          <div class="field">
            <label>Añadir nuevas fotos</label>
            <input type="file" name="fotos_nuevas" multiple accept="image/*" style="font-size:13px" id="edit-new-photos-input">
            <div class="edit-photos-grid" id="edit-new-photos-preview" style="margin-top:6px"></div>
          </div>

          <div style="display:flex;gap:10px;margin-top:8px">
            <button type="submit" class="btn-gold" style="flex:1;border:none;cursor:pointer;font-family:inherit;padding:12px;font-size:14px;font-weight:700;border-radius:var(--radius)">Guardar cambios</button>
            <button type="button" class="btn-regenerate" onclick="viewDetail(${propId})" style="flex:0">Cancelar</button>
          </div>
        </form>
      `;

      // City → Zona dependency in edit modal
      const editCiudadSel = document.getElementById('edit-ciudad-select');
      const editZonaSel = document.getElementById('edit-zona-select');
      if (editCiudadSel && editZonaSel) {
        editCiudadSel.addEventListener('change', () => {
          const zonas = ZONAS_POR_CIUDAD[editCiudadSel.value] || [];
          editZonaSel.innerHTML = '<option value="">—</option>' + zonas.map(z => `<option>${z}</option>`).join('');
        });
      }

      // Address autocomplete in edit modal
      setupEditDireccion();

      // Photo upload preview
      const newPhotosInput = document.getElementById('edit-new-photos-input');
      const newPhotosPreview = document.getElementById('edit-new-photos-preview');
      if (newPhotosInput && newPhotosPreview) {
        newPhotosInput.addEventListener('change', () => {
          newPhotosPreview.innerHTML = '';
          Array.from(newPhotosInput.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const div = document.createElement('div');
              div.className = 'edit-photo-thumb';
              div.innerHTML = `<img src="${e.target.result}" alt="${file.name}">`;
              newPhotosPreview.appendChild(div);
            };
            reader.readAsDataURL(file);
          });
        });
      }

      // Photo delete tracking
      window.markPhotoDelete = function(index, src) {
        const el = document.getElementById(`edit-photo-${index}`);
        if (el) el.remove();
        const hiddenField = document.getElementById('fotos-eliminar');
        const current = JSON.parse(hiddenField.value || '[]');
        current.push(src);
        hiddenField.value = JSON.stringify(current);
      };

      document.getElementById('editPropForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        // Fix "—" selects back to empty
        for (const [key, val] of fd.entries()) {
          if (val === '—') fd.set(key, '');
        }
        try {
          const r = await fetch('/api/propiedades/' + propId, { method: 'PATCH', body: fd });
          if (!r.ok) throw new Error('Error al guardar');
          showToast('Propiedad actualizada');
          viewDetail(propId);
          loadProperties();
        } catch (err) {
          alert(err.message);
        }
      });

      modal.style.display = 'flex';
    } catch { alert('Error al cargar datos'); }
  };

  // ── Address autocomplete for edit modal ──────────
  function setupEditDireccion() {
    const input = document.getElementById('edit-direccion-input');
    const drop = document.getElementById('edit-direccion-dropdown');
    const badge = document.getElementById('edit-dir-verified');
    if (!input || !drop) return;

    let debounceTimer, activeIdx = -1;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      if (badge) badge.style.display = 'none';
      activeIdx = -1;
      const q = input.value.trim();
      if (q.length < 3) { drop.classList.remove('open'); return; }
      drop.innerHTML = '<div class="autocomplete-loading">Buscando…</div>';
      drop.classList.add('open');
      debounceTimer = setTimeout(() => searchEditAddress(q), 350);
    });

    input.addEventListener('keydown', (e) => {
      const items = drop.querySelectorAll('.autocomplete-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        items[activeIdx].click();
      } else if (e.key === 'Escape') {
        drop.classList.remove('open');
      }
    });

    drop.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-wrap')) drop.classList.remove('open');
    });

    async function searchEditAddress(query) {
      try {
        const ciudadSel = document.getElementById('edit-ciudad-select');
        const ciudad = ciudadSel ? ciudadSel.value : '';
        const cityStr = ciudad ? `, ${ciudad}` : '';
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + cityStr + ', Zamora, España')}&addressdetails=1&limit=6&countrycodes=es&accept-language=es`;
        const res = await fetch(url, { headers: { 'User-Agent': 'InmobiliariaReyna/1.0' } });
        const data = await res.json();
        if (!data.length) {
          drop.innerHTML = '<div class="autocomplete-loading">Sin resultados</div>';
          return;
        }
        drop.innerHTML = data.map((item, i) => {
          const addr = item.address || {};
          const road = addr.road || '';
          const number = addr.house_number || '';
          const city = addr.city || addr.town || addr.village || addr.municipality || '';
          const province = addr.province || addr.state || addr.county || '';
          const postcode = addr.postcode || '';
          const mainLine = [road, number].filter(Boolean).join(', ') || item.display_name.split(',')[0];
          const subLine = [city, province, postcode].filter(Boolean).join(' · ');
          return `<div class="autocomplete-item" data-idx="${i}"
            data-road="${esc(road)}" data-number="${esc(number)}"
            data-city="${esc(city)}" data-province="${esc(province)}"
            data-postcode="${esc(postcode)}" data-display="${esc(item.display_name)}"
            data-lat="${item.lat || ''}" data-lon="${item.lon || ''}">
            ${esc(mainLine)}<small>${esc(subLine)}</small>
          </div>`;
        }).join('');
        drop.classList.add('open');

        drop.querySelectorAll('.autocomplete-item').forEach(el => {
          el.addEventListener('click', () => {
            const road = el.dataset.road;
            const number = el.dataset.number;
            input.value = [road, number].filter(Boolean).join(', ') || el.dataset.display.split(',')[0];

            // Update city, province, postal code
            const ciudadSel = document.getElementById('edit-ciudad-select');
            const provField = modalBody.querySelector('input[name="provincia"]');
            const cpField = modalBody.querySelector('input[name="codigo_postal"]');
            if (ciudadSel && el.dataset.city) {
              // Try to match city in dropdown
              const opts = Array.from(ciudadSel.options);
              const match = opts.find(o => o.value.toLowerCase() === el.dataset.city.toLowerCase());
              if (match) {
                ciudadSel.value = match.value;
                ciudadSel.dispatchEvent(new Event('change'));
              }
            }
            if (provField && el.dataset.province) provField.value = el.dataset.province;
            if (cpField && el.dataset.postcode) cpField.value = el.dataset.postcode;

            // Save coordinates
            const latField = document.getElementById('edit-latitud');
            const lonField = document.getElementById('edit-longitud');
            if (latField && el.dataset.lat) latField.value = el.dataset.lat;
            if (lonField && el.dataset.lon) lonField.value = el.dataset.lon;

            drop.classList.remove('open');
            if (badge) badge.style.display = 'inline-block';
          });
        });
      } catch {
        drop.innerHTML = '<div class="autocomplete-loading">Error de conexión</div>';
      }
    }
  }

  // ── Switch tabs in detail modal ───────────────────
  window.switchTab = function(btn, tabId) {
    // Deactivate all tabs and content
    btn.closest('.modal-tabs').querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    const parent = btn.closest('.modal-content') || modalBody;
    parent.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
    // Activate clicked tab and content
    btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
  };

  // ── Close modal ────────────────────────────────────
  window.closeModal = function() { modal.style.display = 'none'; };
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // ── Delete property ────────────────────────────────
  window.deleteProp = async function(id) {
    if (!confirm('¿Eliminar esta propiedad? Se borrarán también las fotos.')) return;
    try {
      await fetch(`/api/propiedades/${id}`, { method: 'DELETE' });
      showToast('Propiedad eliminada');
      loadProperties();
    } catch { alert('Error al eliminar'); }
  };

  // ── Helpers (delegados a shared.js) ────────────────
  function showToast(msg) {
    window.showToast(msg, toast);
  }

});
