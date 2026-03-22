/* ── Inmobiliaria Reyna · app.js ── */

document.addEventListener('DOMContentLoaded', () => {

  const form        = document.getElementById('propertyForm');
  const submitBtn   = document.getElementById('submitBtn');
  const saveOnlyBtn = document.getElementById('saveOnlyBtn');
  const loading     = document.getElementById('loading');
  const results     = document.getElementById('results');
  const toast       = document.getElementById('toast');

  // State for saving
  let lastGeneratedData = null;
  let allFiles = [];
  let savedPropId = null;

  // Zonas por ciudad: usa datos de shared.js (window.ZONAS_POR_CIUDAD)

  const ciudadSelect = document.getElementById('ciudadSelect');
  const zonaSelect = document.getElementById('zonaSelect');
  const provField = document.querySelector('input[name="provincia"]');

  function updateZonas(ciudad) {
    if (!zonaSelect) return;
    const zonas = window.ZONAS_POR_CIUDAD[ciudad] || [];
    zonaSelect.innerHTML = '<option value="">Seleccionar zona...</option>' +
      zonas.map(z => `<option value="${z}">${z}</option>`).join('');
  }

  if (ciudadSelect) {
    ciudadSelect.addEventListener('change', () => {
      updateZonas(ciudadSelect.value);
      // Auto-set provincia to Zamora for all cities in the list
      if (provField) provField.value = 'Zamora';
    });
    // Initialize on load
    updateZonas(ciudadSelect.value);
  }

  // ── Guardar solo (sin IA) ──────────────────────────
  saveOnlyBtn.addEventListener('click', async () => {
    if (!form.reportValidity()) return;

    saveOnlyBtn.disabled = true;
    saveOnlyBtn.textContent = 'Guardando…';

    try {
      const saveData = new FormData(form);
      saveData.delete('fotos');
      allFiles.forEach(f => saveData.append('fotos', f));

      const res = await fetch('/api/propiedades', { method: 'POST', body: saveData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      const result = await res.json();
      showToast('Propiedad guardada en el CRM');

      // Show cartel button in results area? No — just redirect to CRM or stay
      setTimeout(() => {
        if (confirm('Propiedad guardada correctamente.\n\n¿Quieres ir al CRM para verla?')) {
          window.location.href = '/propiedades';
        }
      }, 300);
    } catch (err) {
      alert('Error al guardar:\n\n' + err.message);
    } finally {
      saveOnlyBtn.disabled = false;
      saveOnlyBtn.textContent = 'Guardar';
    }
  });

  // ── Operación: hint precio ───────────────────────────
  document.querySelectorAll('input[name="operacion"]').forEach(r => {
    r.addEventListener('change', () => {
      const hint = document.getElementById('precio-hint');
      if (hint) hint.textContent = r.value === 'Alquiler' ? 'Precio mensual de alquiler' : 'Precio de venta';
    });
  });

  // ── Toggle garaje incluido ──────────────────────────
  const garajeSelect = document.getElementById('garajeSelect');
  const garajeField = document.getElementById('garajeIncluidoField');
  if (garajeSelect && garajeField) {
    garajeSelect.addEventListener('change', () => {
      garajeField.style.display = garajeSelect.value === 'Sí' ? '' : 'none';
    });
  }

  // ── Autocompletado de dirección (Nominatim / OSM) ──
  const dirInput  = document.getElementById('direccionInput');
  const dirDrop   = document.getElementById('direccionDropdown');
  const dirBadge  = document.getElementById('direccion-verified');
  let dirDebounce, dirActive = -1;

  if (dirInput && dirDrop) {
    dirInput.addEventListener('input', () => {
      clearTimeout(dirDebounce);
      dirBadge.style.display = 'none';
      dirActive = -1;
      const q = dirInput.value.trim();
      if (q.length < 3) { dirDrop.classList.remove('open'); return; }
      dirDrop.innerHTML = '<div class="autocomplete-loading">Buscando…</div>';
      dirDrop.classList.add('open');
      dirDebounce = setTimeout(() => searchAddress(q), 350);
    });

    dirInput.addEventListener('keydown', (e) => {
      const items = dirDrop.querySelectorAll('.autocomplete-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        dirActive = Math.min(dirActive + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('active', i === dirActive));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dirActive = Math.max(dirActive - 1, 0);
        items.forEach((el, i) => el.classList.toggle('active', i === dirActive));
      } else if (e.key === 'Enter' && dirActive >= 0) {
        e.preventDefault();
        items[dirActive].click();
      } else if (e.key === 'Escape') {
        dirDrop.classList.remove('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-wrap')) dirDrop.classList.remove('open');
    });
  }

  async function searchAddress(query) {
    try {
      const ciudad = ciudadSelect ? ciudadSelect.value : '';
      const cityStr = ciudad ? `, ${ciudad}` : '';
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + cityStr + ', Zamora, España')}&addressdetails=1&limit=6&countrycodes=es&accept-language=es`;
      const res = await fetch(url, { headers: { 'User-Agent': 'InmobiliariaReyna/1.0' } });
      const data = await res.json();
      if (!data.length) {
        dirDrop.innerHTML = '<div class="autocomplete-loading">Sin resultados</div>';
        return;
      }
      dirDrop.innerHTML = data.map((item, i) => {
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
      dirDrop.classList.add('open');

      dirDrop.querySelectorAll('.autocomplete-item').forEach(el => {
        el.addEventListener('click', () => selectAddress(el));
      });
    } catch {
      dirDrop.innerHTML = '<div class="autocomplete-loading">Error de conexión</div>';
    }
  }

  function selectAddress(el) {
    const road = el.dataset.road;
    const number = el.dataset.number;
    const city = el.dataset.city;
    const province = el.dataset.province;
    const postcode = el.dataset.postcode;

    dirInput.value = [road, number].filter(Boolean).join(', ') || el.dataset.display.split(',')[0];

    const ciudadField = document.querySelector('[name="ciudad"]');
    const provField   = document.querySelector('[name="provincia"]');
    const cpField     = document.querySelector('[name="codigo_postal"]');

    if (ciudadField && city) {
      ciudadField.value = city;
      ciudadField.dispatchEvent(new Event('change'));
    }
    if (provField && province) provField.value = province;
    if (cpField && postcode) cpField.value = postcode;

    // Save coordinates in hidden fields
    const latField = document.querySelector('input[name="latitud"]');
    const lonField = document.querySelector('input[name="longitud"]');
    if (latField && el.dataset.lat) latField.value = el.dataset.lat;
    if (lonField && el.dataset.lon) lonField.value = el.dataset.lon;

    dirDrop.classList.remove('open');
    dirBadge.style.display = 'inline-block';
  }

  // esc() — usa shared.js (window.esc)
  const esc = window.esc;

  // ── Upload de fotos ──────────────────────────────────
  const uploadArea  = document.getElementById('uploadArea');
  const fotosInput  = document.getElementById('fotosInput');
  const previewGrid = document.getElementById('previewGrid');

  if (uploadArea && fotosInput && previewGrid) {
    uploadArea.addEventListener('click', () => fotosInput.click());

    uploadArea.addEventListener('dragover', e => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      addFiles(Array.from(e.dataTransfer.files));
    });

    fotosInput.addEventListener('change', () => {
      addFiles(Array.from(fotosInput.files));
      fotosInput.value = '';
    });
  }

  function addFiles(files) {
    const images = files.filter(f => f.type.startsWith('image/'));
    allFiles = [...allFiles, ...images];
    if (previewGrid) renderPreviews();
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';
    allFiles.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      const img = document.createElement('img');
      img.src = url;
      img.className = 'preview-img' + (i === 0 ? ' portada' : '');
      img.title = file.name;
      if (i === 0) {
        const badge = document.createElement('div');
        badge.className = 'portada-badge';
        badge.textContent = '★ Portada';
        wrap.appendChild(img);
        wrap.appendChild(badge);
      } else {
        wrap.appendChild(img);
      }
      previewGrid.appendChild(wrap);
    });
  }

  // ── Envío del formulario ─────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    // Amenidades (si las hubiera)
    formData.delete('amenidad');
    const amenidades = Array.from(
      document.querySelectorAll('.amenidad-item input:checked')
    ).map(cb => cb.value);
    formData.set('amenidades', JSON.stringify(amenidades));

    // Fotos
    formData.delete('fotos');
    allFiles.forEach(f => formData.append('fotos', f));

    // UI: loading
    loading.style.display = 'flex';
    submitBtn.disabled = true;
    saveOnlyBtn.disabled = true;
    results.style.display = 'none';

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const data = await res.json();
      lastGeneratedData = data;
      displayResults(data);

      // Auto-save to CRM
      await autoSave(data);

    } catch (err) {
      alert('Error al generar:\n\n' + err.message);
    } finally {
      loading.style.display = 'none';
      submitBtn.disabled = false;
      saveOnlyBtn.disabled = false;
    }
  });

  // ── Mostrar resultados ─────────────────────────────
  function displayResults(data) {
    setResult('titulo-content',  'titulo-chars',  data.titulo            || '');
    setResult('corta-content',   'corta-chars',   data.descripcion_corta || '');
    setResult('larga-content',   'larga-chars',   data.descripcion_larga || '');
    setResult('ig-content',      'ig-chars',      data.copy_instagram    || '');
    setResult('wa-content',      'wa-chars',      data.mensaje_whatsapp  || '');

    form.style.display = 'none';
    results.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setResult(contentId, charsId, text) {
    const el = document.getElementById(contentId);
    el.value = text;
    document.getElementById(charsId).textContent = `${text.length} caracteres`;
    // Auto-resize textarea
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  // Live char count on edit
  document.querySelectorAll('.result-editable').forEach(ta => {
    ta.addEventListener('input', () => {
      const charsEl = ta.parentElement.querySelector('.char-count');
      if (charsEl) charsEl.textContent = `${ta.value.length} caracteres`;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  });

  // ── Auto-save after generating ─────────────────────
  async function autoSave(data) {
    const saveData = new FormData(form);

    saveData.delete('fotos');
    allFiles.forEach(f => saveData.append('fotos', f));

    saveData.append('titulo', data.titulo || '');
    saveData.append('descripcion_corta', data.descripcion_corta || '');
    saveData.append('descripcion_larga', data.descripcion_larga || '');
    saveData.append('copy_instagram', data.copy_instagram || '');
    saveData.append('mensaje_whatsapp', data.mensaje_whatsapp || '');

    try {
      const res = await fetch('/api/propiedades', { method: 'POST', body: saveData });
      if (!res.ok) return;
      const result = await res.json();
      savedPropId = result.id;

      // Show cartel button
      const cartelBtn = document.getElementById('btn-cartel');
      cartelBtn.href = `/cartel/${result.id}`;
      cartelBtn.style.display = 'inline-flex';

      showToast('Guardada en propiedades');
    } catch {
      // Silent fail on auto-save
    }
  }

  // ── Copiar ─────────────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const el = document.getElementById(btn.dataset.target);
      const text = el.value !== undefined ? el.value : el.textContent;
      await copyText(text);
      flashBtn(btn);
    });
  });

  document.getElementById('copy-all').addEventListener('click', async () => {
    const parts = [
      ['TÍTULO', 'titulo-content'],
      ['DESCRIPCIÓN CORTA (Idealista / Fotocasa)', 'corta-content'],
      ['DESCRIPCIÓN LARGA (Web / Lujo)', 'larga-content'],
      ['COPY INSTAGRAM', 'ig-content'],
      ['MENSAJE WHATSAPP', 'wa-content'],
    ];
    const text = parts
      .map(([label, id]) => {
        const el = document.getElementById(id);
        return `── ${label} ──\n${el.value !== undefined ? el.value : el.textContent}`;
      })
      .join('\n\n');
    await copyText(text);
    flashBtn(document.getElementById('copy-all'), 'Todo copiado');
  });

  // ── Guardar ediciones del texto ─────────────────────
  document.getElementById('saveEditedBtn').addEventListener('click', async () => {
    if (!savedPropId) {
      alert('No hay propiedad guardada aún. Genera primero los anuncios.');
      return;
    }
    const btn = document.getElementById('saveEditedBtn');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const fd = new FormData();
      fd.append('titulo', document.getElementById('titulo-content').value);
      fd.append('descripcion_corta', document.getElementById('corta-content').value);
      fd.append('descripcion_larga', document.getElementById('larga-content').value);
      fd.append('copy_instagram', document.getElementById('ig-content').value);
      fd.append('mensaje_whatsapp', document.getElementById('wa-content').value);
      const res = await fetch(`/api/propiedades/${savedPropId}/textos`, { method: 'PATCH', body: fd });
      if (!res.ok) throw new Error('Error al guardar');
      showToast('Textos actualizados');
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  });

  // ── Volver al formulario ───────────────────────────
  document.getElementById('btn-regenerate').addEventListener('click', () => {
    results.style.display = 'none';
    form.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Helpers ────────────────────────────────────────
  async function copyText(text) {
    await window.copyToClipboard(text);
    showToast('Copiado al portapapeles');
  }

  function flashBtn(btn, label = 'Copiado') {
    const original = btn.textContent;
    btn.textContent = label;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 2200);
  }

  // showToast — delegado a shared.js
  function showToast(msg) {
    window.showToast(msg || 'Copiado al portapapeles', toast);
  }

});
