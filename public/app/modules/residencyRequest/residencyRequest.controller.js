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
  let selectedProperties = new Map();
  let requestedPropertyIds = new Set();

  const btnSubmit = document.getElementById('btn-submit-residency');
  if (permissions.isAdmin) {
    btnSubmit.textContent = 'Vincularme';
  }

  // --- Helpers de animación para requestFormContainer ---
  const hideFormContainer = () => {
    requestFormContainer.classList.add('form-exit');
    requestFormContainer.addEventListener('transitionend', () => {
      requestFormContainer.classList.add('hidden');
      requestFormContainer.classList.remove('form-exit');
    }, { once: true });
  };

  const showFormContainer = () => {
    requestFormContainer.classList.remove('hidden');
  };

  // --- Lógica Inicial ---
  residencyCard.classList.remove('hidden');

  const checkStatus = async () => {
    // 1. Buscar solicitudes existentes del usuario mediante el modelo
    try {
      const requests = await MembershipRequest.getByUserId(user.uid);
      const visibleRequests = requests.filter(r => r.visibleToUser !== false);

      // Poblar Set de propiedades con solicitud activa
      requestedPropertyIds = new Set(visibleRequests.map(r => r.requestedPropertyId));

      if (visibleRequests.length > 0) {
        const statusMap = {
          'pending': { label: 'Pendiente', class: 'mc-badge-pending' },
          'approved': { label: 'Aprobada', class: 'mc-badge-approved' },
          'rejected': { label: 'Rechazada', class: 'mc-badge-rejected' }
        };

        requestStatusList.innerHTML = `<div class="membership-cards">${
          visibleRequests.map(data => {
            const status = statusMap[data.status] || { label: data.status, class: '' };
            const relLabel = data.relationship || 'Residente';
            const dateStr = data.createdAt?.toDate?.()?.toLocaleDateString() || '';
            const dismissBtn = data.status === 'rejected'
              ? `<button type="button" class="btn-dismiss-mc" data-id="${data.id}" data-property-id="${data.requestedPropertyId}">Descartar</button>`
              : '';
            return `
              <div class="mc-card" style="animation-delay:${visibleRequests.indexOf(data) * 0.06}s">
                <div class="mc-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div class="mc-info">
                  <span class="mc-title">${data.requestedPropertyName}</span>
                  <span class="mc-sub">${relLabel} · ${dateStr}</span>
                </div>
                <div class="mc-actions">
                  <span class="mc-badge ${status.class}">${status.label}</span>
                  ${dismissBtn}
                </div>
              </div>
            `;
          }).join('')
        }</div>`;
        
        requestStatusContainer.classList.remove('hidden');
        hideFormContainer();
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
      if (requestedPropertyIds.has(p.id)) return false;
      const idMatch = p.id ? p.id.toLowerCase().includes(term) : false;
      const nameMatch = p.name ? p.name.toLowerCase().includes(term) : false;
      const streetMatch = p.address?.street ? p.address.street.toLowerCase().includes(term) : false;
      return idMatch || nameMatch || streetMatch;
    }).slice(0, 5);

    if (filtered.length > 0) {
      suggestionsList.innerHTML = filtered.map(p => `
        <div class="suggestion-item" data-id="${p.id}" data-name="${p.name}">
          <div style="display:flex; flex-direction:column">
            <span class="unit-name">${p.name}</span>
            <span class="unit-street">${p.address?.street || 'Sin dirección'}</span>
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
      if (permissions.isAdmin) {
        await MembershipRequest.linkDirectly(user, selectedProperties);
        alert(`Vinculación directa completada para ${selectedProperties.size} unidad(es).`);
      } else {
        await MembershipRequest.createMany(user, selectedProperties);
        alert(`Se han enviado ${selectedProperties.size} solicitudes correctamente.`);
      }
      
      selectedProperties.clear();
      selectedList.innerHTML = '';
      updateUIState();
      
      await checkStatus(); 
      hideFormContainer();
    } catch (error) {
      console.error("Error al enviar solicitudes:", error);
      alert("Error al procesar las solicitudes.");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalText;
    }
  };

  // --- Dismiss de solicitudes rechazadas ---
  const handleDismiss = async (e) => {
    const btn = e.target.closest('.btn-dismiss-mc');
    if (!btn) return;

    const requestId = btn.dataset.id;
    const card = btn.closest('.mc-card');

    try {
      await MembershipRequest.dismiss(requestId, user.uid);
      // Remover propiedad del Set para permitir re-solicitud
      const propertyId = btn.dataset.propertyId;
      if (propertyId) requestedPropertyIds.delete(propertyId);

      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      card.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        card.remove();
        const cardsContainer = requestStatusList.querySelector('.membership-cards');
        if (!cardsContainer || cardsContainer.children.length === 0) {
          requestStatusContainer.classList.add('hidden');
          showFormContainer();
        }
      }, 300);
    } catch (error) {
      console.error("Error al descartar solicitud:", error);
    }
  };

  // --- Cancelar búsqueda ---
  const handleCancelSearch = () => {
    selectedProperties.clear();
    selectedList.innerHTML = '';
    searchInput.value = '';
    suggestionsList.classList.add('hidden');
    residencyForm.classList.add('hidden');
    if (requestStatusContainer.classList.contains('hidden')) {
      requestFormContainer.classList.remove('hidden');
    } else {
      hideFormContainer();
    }
  };

  // --- Listeners ---
  searchInput?.addEventListener('input', handleInput);
  suggestionsList?.addEventListener('click', handleSuggestionClick);
  selectedList?.addEventListener('click', handleChipRemove);
  residencyForm?.addEventListener('submit', handleSubmit);
  requestStatusList?.addEventListener('click', handleDismiss);
  document.getElementById('btn-cancel-search')?.addEventListener('click', handleCancelSearch);
  btnShowSearch?.addEventListener('click', () => {
    showFormContainer();
  });

  // --- Limpieza ---
  return () => {
    searchInput?.removeEventListener('input', handleInput);
    suggestionsList?.removeEventListener('click', handleSuggestionClick);
    selectedList?.removeEventListener('click', handleChipRemove);
    residencyForm?.removeEventListener('submit', handleSubmit);
    requestStatusList?.removeEventListener('click', handleDismiss);
    document.getElementById('btn-cancel-search')?.removeEventListener('click', handleCancelSearch);
  };
}
