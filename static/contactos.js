/* ── Inmobiliaria Reyna · contactos.js ── */

document.addEventListener('DOMContentLoaded', () => {

  const grid      = document.getElementById('contactosGrid');
  const emptyMsg  = document.getElementById('contactosEmpty');
  const countEl   = document.getElementById('contactosCount');
  const modal     = document.getElementById('contactoModal');
  const modalBody = document.getElementById('contactoModalContent');
  const toast     = document.getElementById('toast');

  const RESULTADOS = {
    pendiente:  { label: 'Pendiente',  color: '#f39c12' },
    compra:     { label: 'Compra',     color: '#27ae60' },
    descartado: { label: 'Descartado', color: '#95a5a6' },
  };

  const PREF_LABELS = {
    operacion:       'Operación',
    tipo_propiedad:  'Tipo',
    ciudad:          'Ciudad',
    precio_min:      'Precio mín.',
    precio_max:      'Precio máx.',
    habitaciones_min:'Habitaciones mín.',
    banos_min:       'Baños mín.',
    superficie_min:  'Superficie mín.',
  };

  loadContactos();

  // ── Search ─────────────────────────────────────────
  let debounce;
  document.getElementById('searchContactos').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(loadContactos, 300);
  });

  // ── New contacto ───────────────────────────────────
  document.getElementById('btnNewContacto').addEventListener('click', () => {
    openContactoForm();
  });

  function openContactoForm(contacto) {
    const isEdit = !!contacto;
    document.getElementById('nc-modal-title').textContent = isEdit ? 'Editar Contacto' : 'Nuevo Contacto';
    document.getElementById('nc-edit-id').value = isEdit ? contacto.id : '';
    document.getElementById('nc-nombre').value = contacto?.nombre || '';
    document.getElementById('nc-telefono').value = contacto?.telefono || '';
    document.getElementById('nc-email').value = contacto?.email || '';
    document.getElementById('nc-notas').value = contacto?.notas || '';

    let prefs = {};
    if (contacto?.preferencias) {
      try { prefs = typeof contacto.preferencias === 'string' ? JSON.parse(contacto.preferencias) : contacto.preferencias; } catch {}
    }
    document.getElementById('nc-pref-operacion').value = prefs.operacion || '';
    document.getElementById('nc-pref-tipo').value = prefs.tipo_propiedad || '';
    document.getElementById('nc-pref-ciudad').value = prefs.ciudad || '';
    document.getElementById('nc-pref-precio-min').value = prefs.precio_min || '';
    document.getElementById('nc-pref-precio-max').value = prefs.precio_max || '';
    document.getElementById('nc-pref-hab').value = prefs.habitaciones_min || '';
    document.getElementById('nc-pref-banos').value = prefs.banos_min || '';
    document.getElementById('nc-pref-sup').value = prefs.superficie_min || '';

    document.getElementById('newContactoModal').style.display = 'flex';
  }

  document.getElementById('nc-save').addEventListener('click', async () => {
    const nombre = document.getElementById('nc-nombre').value.trim();
    if (!nombre) { alert('El nombre es obligatorio'); return; }

    const prefs = {};
    const op = document.getElementById('nc-pref-operacion').value;
    const tipo = document.getElementById('nc-pref-tipo').value;
    const ciudad = document.getElementById('nc-pref-ciudad').value.trim();
    const pmin = document.getElementById('nc-pref-precio-min').value;
    const pmax = document.getElementById('nc-pref-precio-max').value;
    const hab = document.getElementById('nc-pref-hab').value;
    const ban = document.getElementById('nc-pref-banos').value;
    const sup = document.getElementById('nc-pref-sup').value;

    if (op) prefs.operacion = op;
    if (tipo) prefs.tipo_propiedad = tipo;
    if (ciudad) prefs.ciudad = ciudad;
    if (pmin) prefs.precio_min = pmin;
    if (pmax) prefs.precio_max = pmax;
    if (hab) prefs.habitaciones_min = hab;
    if (ban) prefs.banos_min = ban;
    if (sup) prefs.superficie_min = sup;

    const fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('telefono', document.getElementById('nc-telefono').value.trim());
    fd.append('email', document.getElementById('nc-email').value.trim());
    fd.append('notas', document.getElementById('nc-notas').value.trim());
    fd.append('preferencias', JSON.stringify(prefs));

    const editId = document.getElementById('nc-edit-id').value;

    try {
      const url = editId ? `/api/contactos/${editId}` : '/api/contactos';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, body: fd });
      if (!res.ok) throw new Error('Error');
      showToast(editId ? 'Contacto actualizado' : 'Contacto creado');
      document.getElementById('newContactoModal').style.display = 'none';
      loadContactos();
      if (editId) viewContacto(parseInt(editId));
    } catch { alert('Error al guardar contacto'); }
  });

  // ── Fetch & render ─────────────────────────────────
  async function loadContactos() {
    const q = document.getElementById('searchContactos').value.trim();
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    try {
      const res = await fetch(`/api/contactos${params}`);
      const data = await res.json();
      renderGrid(data);
    } catch {
      grid.innerHTML = '<p style="color:var(--red)">Error al cargar contactos</p>';
    }
  }

  function renderGrid(contactos) {
    if (!contactos.length) {
      grid.innerHTML = '';
      emptyMsg.style.display = 'block';
      countEl.textContent = '';
      return;
    }

    emptyMsg.style.display = 'none';
    countEl.textContent = `${contactos.length} contacto${contactos.length !== 1 ? 's' : ''}`;

    grid.innerHTML = contactos.map(c => {
      let prefs = {};
      try { prefs = JSON.parse(c.preferencias || '{}'); } catch {}
      const prefTags = buildPrefTags(prefs);

      return `
      <div class="contacto-card" onclick="viewContacto(${c.id})">
        <div class="contacto-avatar">${getInitials(c.nombre)}</div>
        <div class="contacto-card-body">
          <div class="contacto-name">${esc(c.nombre)}</div>
          <div class="contacto-details">
            ${c.telefono ? `<span>📞 ${esc(c.telefono)}</span>` : ''}
            ${c.email ? `<span>✉️ ${esc(c.email)}</span>` : ''}
          </div>
          ${prefTags ? `<div class="pref-tags">${prefTags}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function buildPrefTags(prefs) {
    const tags = [];
    if (prefs.operacion) tags.push(prefs.operacion);
    if (prefs.tipo_propiedad) tags.push(prefs.tipo_propiedad);
    if (prefs.ciudad) tags.push(prefs.ciudad);
    if (prefs.precio_min || prefs.precio_max) {
      const min = prefs.precio_min ? formatPrice(prefs.precio_min) : '0';
      const max = prefs.precio_max ? formatPrice(prefs.precio_max) : '∞';
      tags.push(`${min} - ${max} €`);
    }
    if (prefs.habitaciones_min) tags.push(`${prefs.habitaciones_min}+ hab.`);
    if (prefs.banos_min) tags.push(`${prefs.banos_min}+ baños`);
    if (prefs.superficie_min) tags.push(`${prefs.superficie_min}+ m²`);
    return tags.map(t => `<span class="pref-tag">${esc(t)}</span>`).join('');
  }

  // ── View detail ────────────────────────────────────
  window.viewContacto = async function(id) {
    try {
      const [contactoRes, matchesRes] = await Promise.all([
        fetch(`/api/contactos/${id}`),
        fetch(`/api/contactos/${id}/matches`),
      ]);
      const c = await contactoRes.json();
      const matches = await matchesRes.json();
      const interesados = c.interesados || [];

      let prefs = {};
      try { prefs = typeof c.preferencias === 'string' ? JSON.parse(c.preferencias || '{}') : (c.preferencias || {}); } catch {}

      // Preferences display
      const prefEntries = Object.entries(prefs).filter(([,v]) => v);
      const prefsHTML = prefEntries.length
        ? `<div class="pref-grid">${prefEntries.map(([k, v]) => {
            let display = v;
            if (k === 'precio_min' || k === 'precio_max') display = formatPrice(v) + ' €';
            if (k === 'superficie_min') display = v + ' m²';
            if (k === 'habitaciones_min' || k === 'banos_min') display = v + '+';
            return `<div class="pref-item"><span class="pref-label">${PREF_LABELS[k] || k}</span><span class="pref-value">${esc(String(display))}</span></div>`;
          }).join('')}</div>`
        : '<p style="color:var(--text-muted);font-size:13px">Sin preferencias definidas. Edita el contacto para añadir lo que busca.</p>';

      // Matches display
      const matchesHTML = matches.length
        ? matches.map(m => {
            const p = m.propiedad;
            const foto = (p.fotos && p.fotos.length) ? p.fotos[0] : '';
            return `
            <div class="match-card">
              <div class="match-score-wrap">
                <div class="match-score" style="--score-color:${m.score >= 80 ? '#27ae60' : m.score >= 50 ? '#f39c12' : '#e67e22'}">${m.score}%</div>
              </div>
              <div class="match-info">
                <strong>${esc(p.titulo || (p.tipo_propiedad + ' en ' + p.ciudad))}</strong>
                <span class="match-meta">${esc(p.operacion)} · ${formatPrice(p.precio)} € · ${esc(p.superficie_util)} m² · ${esc(p.habitaciones)} hab.</span>
                <div class="match-reasons">${m.reasons.map(r => `<span class="match-reason-chip">${esc(r)}</span>`).join('')}</div>
              </div>
              ${foto ? `<img class="match-photo" src="${foto}" alt="">` : ''}
            </div>`;
          }).join('')
        : '<p style="color:var(--text-muted);font-size:13px">No hay propiedades activas que coincidan con las preferencias.</p>';

      // Linked properties
      const propsHTML = interesados.length ? interesados.map(i => {
        const res_info = RESULTADOS[i.resultado] || RESULTADOS.pendiente;
        return `
          <div class="contacto-prop-row">
            <div class="contacto-prop-info">
              <strong>${esc(i.titulo || (i.tipo_propiedad + ' en ' + i.ciudad))}</strong>
              <span class="contacto-prop-meta">${esc(i.operacion)} · ${formatPrice(i.precio)} €</span>
            </div>
            <div class="contacto-prop-status">
              ${i.oferta ? `<span style="font-size:12px;color:var(--text-secondary)">Oferta: ${esc(i.oferta)} €</span>` : ''}
              <span class="resultado-badge resultado-${i.resultado || 'pendiente'}">${res_info.label}</span>
            </div>
          </div>
        `;
      }).join('') : '<p style="color:var(--text-muted);font-size:13px">No vinculado a ninguna propiedad aún.</p>';

      modalBody.innerHTML = `
        <button class="modal-close" onclick="document.getElementById('contactoModal').style.display='none'">&times;</button>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
          <div class="contacto-avatar-lg">${getInitials(c.nombre)}</div>
          <div style="flex:1">
            <h2 class="modal-title" style="margin:0;padding:0">${esc(c.nombre)}</h2>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">
              ${c.telefono ? `📞 ${esc(c.telefono)}` : ''} ${c.email ? `· ✉️ ${esc(c.email)}` : ''}
            </div>
          </div>
          <button class="btn-estado" style="flex-shrink:0" onclick="editContacto(${c.id})">✏️ Editar</button>
        </div>

        ${c.notas ? `<div class="modal-section"><div class="modal-section-title">Notas</div><div class="modal-section-content">${esc(c.notas)}</div></div>` : ''}

        <div class="modal-section">
          <div class="modal-section-title">🔍 Lo que busca</div>
          ${prefsHTML}
        </div>

        <div class="modal-section">
          <div class="modal-section-title" style="display:flex;align-items:center;gap:8px">
            ⚡ Propiedades recomendadas
            ${matches.length ? `<span class="estado-badge" style="background:#27ae60">${matches.length} match${matches.length > 1 ? 'es' : ''}</span>` : ''}
          </div>
          <div class="matches-list">${matchesHTML}</div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">Propiedades vinculadas (${interesados.length})</div>
          <div class="contacto-props-list">${propsHTML}</div>
        </div>

        <div class="modal-actions">
          <button class="btn-mini btn-mini-del" style="padding:8px 16px;font-size:13px" onclick="deleteContacto(${c.id})">Eliminar contacto</button>
          <button class="btn-regenerate" onclick="document.getElementById('contactoModal').style.display='none'">Cerrar</button>
        </div>
      `;

      modal.style.display = 'flex';
    } catch (err) {
      console.error(err);
      alert('Error al cargar contacto');
    }
  };

  window.editContacto = async function(id) {
    try {
      const res = await fetch(`/api/contactos/${id}`);
      const c = await res.json();
      modal.style.display = 'none';
      openContactoForm(c);
    } catch { alert('Error'); }
  };

  window.deleteContacto = async function(id) {
    if (!confirm('¿Eliminar este contacto?')) return;
    try {
      await fetch(`/api/contactos/${id}`, { method: 'DELETE' });
      showToast('Contacto eliminado');
      modal.style.display = 'none';
      loadContactos();
    } catch { alert('Error al eliminar'); }
  };

  // Close modals
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
  });

  // ── Helpers (esc, formatPrice, showToast delegados a shared.js) ──
  const esc         = window.esc;
  const formatPrice = window.formatPrice;

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function showToast(msg) {
    window.showToast(msg, toast);
  }

});
