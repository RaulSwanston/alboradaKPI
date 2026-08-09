import { db, collection, query, where, getDocs, orderBy } from "../../core/firebase.js";

/**
 * providers.controller.js
 *
 * Controlador autosuficiente para el listado de proveedores.
 * Carga desde Firestore los usuarios con rol 'provider' y gestiona la búsqueda.
 */
export default async function providersController(contexto) {
  const listContainer = document.getElementById('providers-list-container');
  const countEl = document.getElementById('providers-count');

  if (!listContainer) return;

  let allProviders = [];
  let currentSearchQuery = '';

  /**
   * Iniciales para el avatar cuando no hay foto.
   */
  const getInitials = (name, email) => {
    const source = name || email || '?';
    const parts = source.trim().split(/\s+/);
    return (parts[0]?.[0] || '?') + (parts[1]?.[0] || '').toUpperCase();
  };

  /**
   * Formatea el teléfono o retorna un placeholder.
   */
  const formatPhone = (phone) => {
    return phone || '—';
  };

  /**
   * Renderiza las tarjetas aplicando la búsqueda.
   */
  const renderProviders = () => {
    let filtered = allProviders;

    if (currentSearchQuery) {
      const q = currentSearchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        (p.displayName || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-services" style="grid-column: 1/-1; width: 100%;">
            <p>No se encontraron proveedores.</p>
        </div>`;
      if (countEl) countEl.textContent = '0';
      return;
    }

    const html = filtered.map(p => {
      const initials = getInitials(p.displayName, p.email);
      const photo = p.photoUrl
        ? `<img src="${p.photoUrl}" alt="${p.displayName || 'Proveedor'}">`
        : initials;

      return `
        <div class="provider-card" data-id="${p.id}">
          <div class="provider-avatar">${photo}</div>
          <div class="provider-info">
            <h3>${p.displayName || p.email || 'Proveedor'}</h3>
            <p class="provider-email">${p.email || ''}</p>
            <div class="provider-meta">
              <span class="provider-phone">${formatPhone(p.phone)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = html;
    if (countEl) countEl.textContent = filtered.length;
  };

  /**
   * Carga inicial de datos desde Firestore
   */
  const loadData = async () => {
    try {
      listContainer.innerHTML = '<div class="loading-text" style="grid-column: 1/-1;">Cargando proveedores...</div>';

      const usersRef = collection(db, "users");
      const q = query(usersRef, where("role", "==", "provider"), orderBy("email"));
      const snapshot = await getDocs(q);

      allProviders = [];
      snapshot.forEach(doc => {
        allProviders.push({ id: doc.id, ...doc.data() });
      });

      renderProviders();
    } catch (error) {
      console.error("[ProvidersController] Error:", error);
      listContainer.innerHTML = '<div class="error" style="grid-column: 1/-1;">Error al cargar los proveedores.</div>';
    }
  };

  // Escuchamos el evento 'app:search' que emite el módulo search
  document.addEventListener('app:search', (e) => {
    currentSearchQuery = e.detail.query;
    renderProviders();
  });

  // Ejecutar carga
  await loadData();

  // Limpieza al salir de la vista
  return () => {
    console.log("Saliendo del módulo de proveedores.");
  };
}
