import ChargeConcept from "../../models/ChargeConcept.js";
import { auth, storage, ref, uploadBytes, getDownloadURL } from "../../core/firebase.js";
import { createActivity } from "../../models/Activities.js";

const LOCAL_ICONS_URL = '/src/img/icons.json';

function loadTinyMCE() {
  return new Promise((resolve) => {
    if (window.tinymce) return resolve(window.tinymce);
    const script = document.createElement('script');
    script.src = '/src/libs/tinymce/tinymce.min.js';
    script.onload = () => {
      if (window.tinymce) resolve(window.tinymce);
    };
    document.head.appendChild(script);
  });
}

function cleanSvg(svgHtml) {
  if (!svgHtml) return '';
  return svgHtml
    .replace(/fill=['"]#[0-9a-fA-F]{3,6}['"]/g, 'fill="currentColor"')
    .replace(/stroke=['"]#[0-9a-fA-F]{3,6}['"]/g, 'stroke="currentColor"');
}

export default async function servicesDetailController(contexto) {
  const slug = contexto?.params?.id;
  if (!slug) {
    document.getElementById('detail-name').textContent = 'ID no válido';
    return;
  }

  const getEl = (id) => document.getElementById(id);
  let editorInstance = null;
  let selectedIconSvg = null;
  let fullCatalog = [];

  try {
    let concept = await ChargeConcept.getBySlug(slug);
    if (!concept) {
      concept = await ChargeConcept.getById(slug);
    }
    if (!concept) {
      getEl('detail-name').textContent = 'Concepto no encontrado';
      return;
    }

    const appConfig = contexto.data?.appConfig || {};
    const chargeTypes = appConfig.chargeTypes || {};

    const showEl = (id, val) => { const el = getEl(id); if (el) el.textContent = val; };
    const setVal = (id, val) => { const el = getEl(id); if (el) el.value = val; };
    const setChecked = (id, val) => { const el = getEl(id); if (el) el.checked = val; };
    const updateCounter = (el, counterId, max) => {
      const len = el.textContent.length;
      const counter = getEl(counterId);
      counter.textContent = len;
      counter.parentElement.classList.toggle('limit', len > max);
    };

    showEl('detail-name', concept.name);
    const iconEl = getEl('detail-icon');
    if (iconEl) iconEl.innerHTML = concept.icon || '📦';

    // Poblar select de tipos desde appConfig
    const typeSelect = getEl('detail-type-select');
    typeSelect.innerHTML = '';
    Object.entries(chargeTypes).forEach(([value, cfg]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = cfg.label;
      typeSelect.appendChild(opt);
    });
    typeSelect.value = chargeTypes[concept.type] ? concept.type : 'service';
    // Sincronizar con el select oculto del formulario
    getEl('edit-type').innerHTML = typeSelect.innerHTML;
    getEl('edit-type').value = typeSelect.value;
    const typeDesc = getEl('type-description');
    if (typeDesc) typeDesc.textContent = chargeTypes[typeSelect.value]?.label || 'Selecciona el tipo del servicio';
    typeSelect.addEventListener('change', function () {
      getEl('edit-type').value = this.value;
      if (typeDesc) typeDesc.textContent = chargeTypes[this.value]?.label || 'Selecciona el tipo del servicio';
    });

    setVal('edit-name', concept.name);
    getEl('detail-name').textContent = concept.name;
    updateCounter(getEl('detail-name'), 'name-counter', 80);
    setVal('edit-descriptionShort', concept.descriptionShort || concept.description || '');
    getEl('detail-descriptionShort').textContent = concept.descriptionShort || concept.description || '';
    updateCounter(getEl('detail-descriptionShort'), 'desc-counter', 200);
    setVal('edit-descriptionLong', concept.descriptionLong || '');
    setVal('edit-amount', concept.defaultAmount || 0);
    getEl('detail-amount').textContent = '$' + (concept.defaultAmount || 0).toFixed(2);
    setVal('edit-type', concept.type || 'service');
    setChecked('edit-recurring', concept.isRecurring === true);
    const toggleBtn = getEl('btn-toggle-recurring');
    const toggleSwitch = getEl('toggle-switch');
    if (concept.isRecurring === true) {
      toggleSwitch.classList.add('active');
    }
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const checkbox = getEl('edit-recurring');
        checkbox.checked = !checkbox.checked;
        toggleSwitch.classList.toggle('active');
      });
    }
    setChecked('edit-requestable', concept.isRequestableByResident === true);
    const headerCheck = getEl('edit-requestable-header');
    if (headerCheck) headerCheck.checked = getEl('edit-requestable').checked;

    // Sincronizar contenteditable → inputs ocultos + contadores
    getEl('detail-name').addEventListener('input', function () {
      if (this.textContent.length > 80) {
        this.textContent = this.textContent.slice(0, 80);
        // Colocar cursor al final
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(this);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      getEl('edit-name').value = this.textContent;
      updateCounter(this, 'name-counter', 80);
    });
    if (headerCheck) {
      headerCheck.addEventListener('change', function () {
        getEl('edit-requestable').checked = this.checked;
      });
    }

    getEl('detail-amount').addEventListener('input', function () {
      const raw = this.textContent.replace(/[^0-9.]/g, '');
      getEl('edit-amount').value = parseFloat(raw) || 0;
    });

    getEl('detail-amount').addEventListener('blur', function () {
      const val = parseFloat(getEl('edit-amount').value) || 0;
      this.textContent = '$' + val.toFixed(2);
    });

    getEl('detail-descriptionShort').addEventListener('input', function () {
      if (this.textContent.length > 200) {
        this.textContent = this.textContent.slice(0, 200);
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(this);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      getEl('edit-descriptionShort').value = this.textContent;
      updateCounter(this, 'desc-counter', 200);
    });

    // --- Icon Selector ---
    const loadLocalCatalog = async () => {
      try {
        const response = await fetch(LOCAL_ICONS_URL);
        const data = await response.json();
        fullCatalog = (data.icons || []).map(icon => ({
          ...icon,
          title: icon.name,
          svg: cleanSvg(icon.svg)
        }));
      } catch (error) {
        console.error('[servicesDetail] Error cargando catálogo de iconos:', error);
      }
    };

    const translateToEnglish = async (text) => {
      if (!text) return '';
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        return data[0][0][0].toLowerCase();
      } catch {
        return text.toLowerCase();
      }
    };

    const renderIconResults = (icons) => {
      const grid = getEl('icon-results-grid');
      grid.innerHTML = '';
      if (icons.length === 0) {
        getEl('search-status-text').textContent = 'No hay coincidencias en la librería.';
        return;
      }
      getEl('search-status-text').textContent = `${icons.length} iconos encontrados.`;
      const color = getEl('icon-color').value;
      icons.forEach(icon => {
        const item = document.createElement('div');
        item.className = 'icon-item';
        item.title = icon.name;
        item.style.color = color;
        item.innerHTML = icon.svg;
        item.addEventListener('click', () => {
          selectedIconSvg = icon.svg;
          getEl('selected-icon-preview').innerHTML = icon.svg;
          getEl('selected-icon-preview').style.color = color;
          document.querySelectorAll('#icon-results-grid .icon-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          getEl('btn-apply-icon').disabled = false;
        });
        grid.appendChild(item);
      });
    };

    const filterIconsLocally = async (query) => {
      if (!query || query.length < 2) {
        getEl('icon-results-grid').innerHTML = '<div class="loading-icons">Escribe el nombre del concepto para ver sugerencias...</div>';
        getEl('search-status-text').textContent = 'Esperando búsqueda...';
        return;
      }
      getEl('search-status-text').textContent = `Buscando iconos para "${query}"...`;
      const englishQuery = await translateToEnglish(query);
      const keywords = [...query.toLowerCase().split(' '), ...englishQuery.toLowerCase().split(' ')]
        .filter(word => word.length > 2);
      const filtered = fullCatalog.filter(icon => {
        const name = (icon.name || '').toLowerCase();
        const tags = (icon.tags || []).join(' ').toLowerCase();
        return keywords.some(word => (name + ' ' + tags).includes(word));
      });
      renderIconResults(filtered);
    };

    const openIconModal = () => {
      selectedIconSvg = null;
      getEl('selected-icon-preview').innerHTML = '<span>?</span>';
      getEl('selected-icon-preview').style.color = '';
      getEl('btn-apply-icon').disabled = true;
      getEl('icon-search-input').value = '';
      getEl('icon-color').value = '#28bf63';
      getEl('icon-results-grid').innerHTML = '<div class="loading-icons">Escribe el nombre del concepto para ver sugerencias...</div>';
      getEl('search-status-text').textContent = 'Escribe para buscar iconos...';
      document.querySelectorAll('#icon-results-grid .icon-item').forEach(el => el.classList.remove('selected'));
      getEl('icon-modal-overlay').classList.remove('hidden');
      getEl('icon-search-input').focus();
    };

    const closeIconModal = () => {
      getEl('icon-modal-overlay').classList.add('hidden');
    };

    // --- Cargar catálogo y configurar eventos del modal ---
    await loadLocalCatalog();

    getEl('detail-icon-trigger').addEventListener('click', openIconModal);
    getEl('btn-select-icon').addEventListener('click', openIconModal);
    getEl('btn-close-icon-panel').addEventListener('click', closeIconModal);
    getEl('btn-cancel-icon').addEventListener('click', closeIconModal);
    getEl('icon-modal-overlay').addEventListener('click', (e) => {
      if (e.target === getEl('icon-modal-overlay')) closeIconModal();
    });

    let searchTimeout;
    getEl('icon-search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => filterIconsLocally(e.target.value.trim()), 500);
    });

    getEl('icon-color').addEventListener('input', () => {
      const color = getEl('icon-color').value;
      getEl('selected-icon-preview').style.color = color;
      document.querySelectorAll('#icon-results-grid .icon-item').forEach(el => {
        el.style.color = color;
      });
    });

    getEl('btn-apply-icon').addEventListener('click', () => {
      if (!selectedIconSvg) return;
      const color = getEl('icon-color').value;
      const coloredSvg = selectedIconSvg.replace(/fill="currentColor"/g, `fill="${color}"`).replace(/stroke="currentColor"/g, `stroke="${color}"`);
      concept.icon = coloredSvg;
      getEl('detail-icon').innerHTML = coloredSvg;
      closeIconModal();
    });

    // --- TinyMCE ---
    const tinymceLib = await loadTinyMCE();
    tinymceLib.init({
      selector: '#edit-descriptionLong',
      base_url: '/src/libs/tinymce',
      height: 300,
      menubar: false,
      promotion: false,
      branding: false,
      placeholder: 'Descripción detallada del servicio',
      plugins: 'lists link image code table advlist fullscreen searchreplace',
      toolbar: 'undo redo | blocks | bold italic underline | forecolor backcolor | bullist numlist | alignleft aligncenter alignright alignjustify | image | link | table | searchreplace | fullscreen | code | removeformat',
      skin: 'oxide',
      content_css: 'default',
      content_style: `
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #333; padding: 14px 20px; margin: 0; }
        p { margin: 0 0 0.5em; }
        .mce-content-body:not([dir=rtl])[data-mce-placeholder]:not(.mce-visualblocks)::before { left: 20px; top: 14px; }
      `,
      images_upload_handler: (blobInfo) => new Promise((resolve, reject) => {
        const file = blobInfo.blob();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `services/${slug}/images/${Date.now()}_${safeName}`;
        const storageRef = ref(storage, path);
        uploadBytes(storageRef, file).then((snapshot) => getDownloadURL(snapshot.ref)).then(resolve).catch(reject);
      }),
      setup: (editor) => { editorInstance = editor; }
    });

    // --- Form Save ---
    const form = getEl('form-edit-concept');
    const btnSave = getEl('btn-save');
    const btnDelete = getEl('btn-delete');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btnSave.disabled = true;
      btnSave.textContent = 'Guardando...';

      const longDesc = editorInstance ? editorInstance.getContent() : getEl('edit-descriptionLong').value;

      try {
        const newName = getEl('edit-name').value.trim();
        const newSlug = ChargeConcept.slugify(newName);
        const updateData = {
          name: newName,
          slug: newSlug,
          icon: concept.icon,
          descriptionShort: getEl('edit-descriptionShort').value.trim(),
          descriptionLong: longDesc,
          defaultAmount: parseFloat(getEl('edit-amount').value) || 0,
          type: getEl('edit-type').value,
          isRecurring: getEl('edit-recurring').checked,
          isRequestableByResident: getEl('edit-requestable').checked
        };

        await ChargeConcept.update(concept.id, updateData);

        const currentUser = auth.currentUser;
        await createActivity({
          type: 'CONCEPT_UPDATED',
          description: `Se actualizó el concepto: ${newName}`,
          initiator: {
            type: 'USER',
            id: currentUser ? currentUser.uid : 'system',
            name: currentUser ? (currentUser.displayName || currentUser.email) : 'Administrador'
          },
          target: { type: 'CHARGECONCEPT', id: concept.id, name: newName },
          visibility: ['admin']
        });

        alert('Concepto actualizado correctamente.');
        if (window.router) window.router.navigate(`/services/${newSlug}`);
      } catch (err) {
        console.error('Error al guardar:', err);
        alert('Error al guardar los cambios.');
        btnSave.disabled = false;
        btnSave.textContent = 'Guardar Cambios';
      }
    });

    btnDelete.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar el concepto "${concept.name}" definitivamente?`)) return;
      if (!confirm('Esta acción no se puede deshacer. ¿Continuar?')) return;

      btnDelete.disabled = true;
      btnDelete.textContent = 'Eliminando...';

      try {
        await ChargeConcept.delete(concept.id);

        const currentUser = auth.currentUser;
        await createActivity({
          type: 'CONCEPT_DELETED',
          description: `Se eliminó el concepto: ${concept.name}`,
          initiator: {
            type: 'USER',
            id: currentUser ? currentUser.uid : 'system',
            name: currentUser ? (currentUser.displayName || currentUser.email) : 'Administrador'
          },
          target: { type: 'CHARGECONCEPT', id: concept.id, name: concept.name },
          visibility: ['admin']
        });

        if (window.router) window.router.navigate('/services');
      } catch (err) {
        console.error('Error al eliminar:', err);
        alert('Error al eliminar el concepto.');
        btnDelete.disabled = false;
        btnDelete.textContent = 'Eliminar Concepto';
      }
    });

  } catch (error) {
    console.error('Error al cargar concepto:', error);
    getEl('detail-name').textContent = 'Error al cargar';
  }

  return () => {
    if (editorInstance) {
      tinymce.remove(editorInstance);
      editorInstance = null;
    }
  };
}
