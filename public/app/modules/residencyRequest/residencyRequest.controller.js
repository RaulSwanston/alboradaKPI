import { db, doc, collection, getDocs, setDoc, getDoc, serverTimestamp, query, limit, where, orderBy, writeBatch } from '../../core/firebase.js';
import Property from '../../models/Property.js';
import MembershipRequest from '../../models/MembershipRequest.js';

/**
 * Controlador para el módulo de Solicitud de Residencia.
 * Gestiona el buscador de propiedades y el envío de múltiples peticiones.
 */
export default async function residencyRequestController(contexto) {
  const user = contexto.data.user;
  const permissions = contexto.data.permissions;

  if (!user) return;

  // Solo ocultar si el usuario es administrador total.
  // Los residentes pueden querer agregar más propiedades.
  if (permissions.isAdmin) {
    document.getElementById('residency-request-card')?.classList.add('hidden');
    return;
  }

  // --- Referencias al DOM ---
  const residencyCard = document.getElementById('residency-request-card');
  const residencyForm = document.getElementById('residency-form');
  const searchInput = document.getElementById('property-search-input');
  const suggestionsList = document.getElementById('property-suggestions');
  const selectedContainer = document.getElementById('selected-properties-container');
  const selectedList = document.getElementById('selected-properties-list');
  const requestFormContainer = document.getElementById('request-form-container');
  const requestStatusContainer = document.getElementById('request-status-container');
  const requestStatusList = document.getElementById('request-status-list');
  const btnShowSearch = document.getElementById('btn-show-search');

  let allProperties = [];
  let selectedProperties = new Map(); // Usamos Map para evitar duplicados [id -> {name, relationship}]

  // --- Lógica Inicial ---
  residencyCard.classList.remove('hidden');

  const checkStatus = async () => {
    // 1. Buscar solicitudes existentes del usuario mediante el modelo
    try {
      const requests = await MembershipRequest.getByUserId(user.uid);

      if (requests.length > 0) {
        requestStatusList.innerHTML = requests.map(data => {
          const statusMap = {
            'pending': '⏳ Pendiente de revisión',
            'approved': '✅ Aprobada',
            'rejected': '❌ Rechazada'
          };
          const relLabel = data.relationship || 'Residente';
          return `<div><strong>${data.requestedPropertyName}</strong> (${relLabel}): ${statusMap[data.status] || data.status}</div>`;
        }).join('');
        
        requestStatusContainer.classList.remove('hidden');
      }
    } catch (error) {
      console.warn("⚠️ Error al verificar solicitudes previas:", error.message);
    }

    // 2. Carga segura de catálogo mediante el modelo Property
    try {
      console.log("📂 Cargando catálogo completo de unidades...");
      allProperties = await Property.getAll('name');
      console.log(`✨ ${allProperties.length} unidades cargadas para búsqueda.`);
    } catch (error) {
      console.error("❌ Error al cargar propiedades:", error);
    }
  };

  await checkStatus();

  // --- Gestión de Chips (Manipulación Quirúrgica) ---
  const updateUIState = () => {
    const hasSelection = selectedProperties.size > 0;
    residencyForm.classList.toggle('hidden', !hasSelection);
  };

  const addPropertyChip = (id, name) => {
    if (selectedList.querySelector(`[data-id="${id}"]`)) return;

    const chip = document.createElement('div');
    chip.className = 'property-selection-chip';
    chip.dataset.id = id;
    chip.innerHTML = `
      <div class="chip-content">
        <span class="chip-unit-name">${name}</span>
        <select class="relationship-select" data-id="${id}">
          <option value="Propietario">Propietario</option>
          <option value="Inquilino">Inquilino</option>
          <option value="Familiar">Familiar</option>
          <option value="Administrador">Admin. Externo</option>
        </select>
      </div>
      <button type="button" class="btn-remove-chip" data-id="${id}">×</button>
    `;
    
    // Escuchar cambios en el selector de relación
    const select = chip.querySelector('.relationship-select');
    select.addEventListener('change', (e) => {
      const current = selectedProperties.get(id);
      selectedProperties.set(id, { ...current, relationship: e.target.value });
    });

    selectedList.appendChild(chip);
    updateUIState();
  };

  const removePropertyChip = (id) => {
    const chip = selectedList.querySelector(`[data-id="${id}"]`);
    if (chip) {
      chip.classList.add('fade-out');
      
      chip.addEventListener('transitionend', () => {
        chip.remove();
        selectedProperties.delete(id);
        updateUIState();
      }, { once: true });
    }
  };

  // --- Eventos ---
  
  const handleInput = (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (term.length < 1) {
      suggestionsList.classList.add('hidden');
      return;
    }

    const filtered = allProperties.filter(p => {
      if (selectedProperties.has(p.id)) return false; 
      const idMatch = p.id ? p.id.toLowerCase().includes(term) : false;
      const nameMatch = p.name ? p.name.toLowerCase().includes(term) : false;
      const streetMatch = p.street ? p.street.toLowerCase().includes(term) : false;
      return idMatch || nameMatch || streetMatch;
    }).slice(0, 5);

    if (filtered.length > 0) {
      suggestionsList.innerHTML = filtered.map(p => `
        <div class="suggestion-item" data-id="${p.id}" data-name="${p.name}">
          <div style="display:flex; flex-direction:column">
            <span class="unit-name">${p.name}</span>
            <span class="unit-street">${p.street || 'Sin dirección'}</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </div>
      `).join('');
      suggestionsList.classList.remove('hidden');
    } else {
      suggestionsList.innerHTML = '<div class="suggestion-item">No se encontraron más unidades</div>';
      suggestionsList.classList.remove('hidden');
    }
  };

  const handleSuggestionClick = (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item || !item.dataset.id) return;

    const { id, name } = item.dataset;
    selectedProperties.set(id, { name, relationship: 'Propietario' });
    searchInput.value = '';
    suggestionsList.classList.add('hidden');
    addPropertyChip(id, name);
    searchInput.focus();
  };

  const handleChipRemove = (e) => {
    const btn = e.target.closest('.btn-remove-chip');
    if (!btn) return;
    removePropertyChip(btn.dataset.id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedProperties.size === 0) return;

    const btnSubmit = document.getElementById('btn-submit-residency');
    const originalText = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enviando...';

    try {
      // Uso del modelo para envío atómico
      await MembershipRequest.createMany(user, selectedProperties);
      
      alert(`Se han enviado ${selectedProperties.size} solicitudes correctamente.`);
      
      selectedProperties.clear();
      selectedList.innerHTML = '';
      updateUIState();
      
      await checkStatus(); 
      requestFormContainer.classList.add('hidden');
    } catch (error) {
      console.error("Error al enviar solicitudes:", error);
      alert("Error al procesar las solicitudes.");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalText;
    }
  };

  // --- Listeners ---
  searchInput?.addEventListener('input', handleInput);
  suggestionsList?.addEventListener('click', handleSuggestionClick);
  selectedList?.addEventListener('click', handleChipRemove);
  residencyForm?.addEventListener('submit', handleSubmit);
  btnShowSearch?.addEventListener('click', () => {
    requestFormContainer.classList.remove('hidden');
  });

  // --- Limpieza ---
  return () => {
    searchInput?.removeEventListener('input', handleInput);
    suggestionsList?.removeEventListener('click', handleSuggestionClick);
    selectedList?.removeEventListener('click', handleChipRemove);
    residencyForm?.removeEventListener('submit', handleSubmit);
  };
}
