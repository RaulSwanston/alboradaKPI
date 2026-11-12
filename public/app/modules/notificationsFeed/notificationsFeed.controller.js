import { db, collection, query, where, orderBy, getDocs, getCountFromServer, limit, startAfter } from '../../core/firebase.js';
import { router } from '../../../router.js';

/**
 * notificationsFeed.controller.js
 * Gestiona la bandeja de entrada de notificaciones accionables.
 *
 * La consulta filtra en Firestore por los tipos que realmente se muestran. Antes
 * se pedían las últimas 20 actividades y se filtraba en memoria: una ráfaga de
 * facturas o movimientos podía desplazar las notificaciones recientes y hacer
 * que la más nueva no apareciera. La paginación es de 8 en 8 y también se
 * resuelve en el servidor (limit + startAfter), para no leer todo el historial.
 */

const PER_PAGE = 8;

const NOTIFICATION_TYPES = [
  'MEMBERSHIP_REQUESTED',
  'MEMBERSHIP_APPROVED',
  'PAYMENT_REPORTED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'SERVICE_REQUESTED',
  'CREDIT_NOTE_ISSUED'
];

export default async function notificationsFeedController(contexto) {
  const container = document.getElementById('notifications-container');
  const emptyFeed = document.getElementById('no-notifications');
  const paginationContainer = document.getElementById('notifications-pagination');
  const template = document.getElementById('notification-item-template');
  const user = contexto.data.user;
  const permissions = contexto.data.permissions;

  if (!container || !user) return;

  /**
   * Mapeo de tipos de actividad a configuraciones visuales y de ruteo.
   */
  const configMap = {
    'MEMBERSHIP_REQUESTED': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
      class: 'notif-type-membership',
      route: '/dashboard/requests'
    },
    'MEMBERSHIP_APPROVED': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
      class: 'notif-type-membership',
      route: '/dashboard/profile'
    },
    'PAYMENT_REPORTED': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>`,
      class: 'notif-type-payment',
      route: () => '/dashboard/payments/pending'
    },
    'PAYMENT_APPROVED': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
      class: 'notif-type-payment',
      // El admin quiere el comprobante; el residente, el estado de su reporte.
      route: (data) => {
        const txId = data?.details?.transactionId;
        if (permissions.isAdmin && txId) return `/dashboard/transactions/${txId}`;
        return permissions.isAdmin ? '/dashboard/payments/pending' : '/dashboard/payments/history';
      }
    },
    'PAYMENT_REJECTED': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
      class: 'notif-type-payment',
      route: () => (permissions.isAdmin ? '/dashboard/payments/pending' : '/dashboard/payments/history')
    },
    'CREDIT_NOTE_ISSUED': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>`,
      class: 'notif-type-credit',
      route: (data) => {
        if (permissions.isAdmin) return '/dashboard/transactions';
        const propertyId = data?.target?.id;
        return propertyId ? `/dashboard/properties/${propertyId}` : '/dashboard/estado-cuenta';
      }
    },
    'SERVICE_REQUESTED': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`,
      class: 'notif-type-service',
      route: '/services'
    },
    'DEFAULT': {
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
      class: 'notif-type-info',
      route: '/dashboard/resumen'
    }
  };

  /**
   * Algunas rutas dependen del rol o del documento (ej. ver el recibo del pago
   * aprobado). `route` puede ser un string fijo o una función (data) => string.
   */
  const resolveRoute = (config, data) =>
    typeof config.route === 'function' ? config.route(data) : config.route;

  const visibilityKey = permissions.isAdmin ? 'admin' : user.uid;

  /**
   * Consulta base: solo actividades que forman parte de la bandeja. El filtro
   * por tipo va en Firestore para que el límite de página no se consuma con
   * facturas o movimientos ajenos al feed.
   */
  const buildBaseQuery = () => query(
    collection(db, 'activities'),
    where('visibility', 'array-contains', visibilityKey),
    where('type', 'in', NOTIFICATION_TYPES),
    orderBy('timestamp', 'desc')
  );

  let currentPage = 1;
  let totalItems = 0;
  let loading = false;

  // El SDK web no expone `offset`. La paginación se resuelve con `startAfter`
  // y una caché de cursores: cada página se pide una sola vez y volver atrás
  // no vuelve a leer Firestore.
  const pageCache = new Map();   // página -> DocumentSnapshot[]
  const pageCursors = new Map(); // página -> último DocumentSnapshot

  const fetchPage = async (page) => {
    if (pageCache.has(page)) return pageCache.get(page);

    // Para saltar a una página lejana hacen falta los cursores intermedios.
    if (page > 1 && !pageCursors.has(page - 1)) {
      await fetchPage(page - 1);
    }

    const constraints = [limit(PER_PAGE)];
    if (page > 1) {
      const cursor = pageCursors.get(page - 1);
      if (!cursor) return [];
      constraints.unshift(startAfter(cursor));
    }

    const snapshot = await getDocs(query(buildBaseQuery(), ...constraints));
    pageCache.set(page, snapshot.docs);
    if (snapshot.docs.length > 0) {
      pageCursors.set(page, snapshot.docs[snapshot.docs.length - 1]);
    }
    return snapshot.docs;
  };

  const renderNotification = (data) => {
    const config = configMap[data.type] || configMap['DEFAULT'];
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector('.notification-item');

    const iconWrapper = item.querySelector('.notification-icon-wrapper');
    iconWrapper.innerHTML = config.icon;
    iconWrapper.classList.add(config.class);

    item.querySelector('.notification-message').textContent = data.description;

    const time = data.timestamp?.toDate
      ? data.timestamp.toDate().toLocaleString()
      : 'Recientemente';
    item.querySelector('.notification-time').textContent = time;

    // Botón de acción
    item.querySelector('.notification-action-btn').addEventListener('click', () => {
      router.navigate(resolveRoute(config, data), 'dashboard');
    });

    // Click en toda la tarjeta también navega
    item.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        router.navigate(resolveRoute(config, data), 'dashboard');
      }
    });

    container.appendChild(clone);
  };

  const renderPagination = () => {
    if (!paginationContainer) return;

    const totalPages = Math.ceil(totalItems / PER_PAGE);
    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    let html = `
      <button type="button" class="nf-btn-pagination ${prevDisabled}" data-page="${currentPage - 1}" ${prevDisabled ? 'disabled' : ''} aria-label="Página anterior">
        <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"/></svg>
      </button>
      <button type="button" class="nf-btn-pagination ${currentPage === 1 ? 'active' : ''}" data-page="1" ${currentPage === 1 ? 'aria-current="page"' : ''}>1</button>
    `;

    if (currentPage > 3) {
      html += `<span class="nf-pagination-ellipsis">...</span>`;
    }

    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      html += `<button type="button" class="nf-btn-pagination ${i === currentPage ? 'active' : ''}" data-page="${i}" ${i === currentPage ? 'aria-current="page"' : ''}>${i}</button>`;
    }

    if (currentPage < totalPages - 2) {
      html += `<span class="nf-pagination-ellipsis">...</span>`;
    }

    if (totalPages > 1) {
      html += `<button type="button" class="nf-btn-pagination ${currentPage === totalPages ? 'active' : ''}" data-page="${totalPages}" ${currentPage === totalPages ? 'aria-current="page"' : ''}>${totalPages}</button>`;
    }

    html += `
      <button type="button" class="nf-btn-pagination ${nextDisabled}" data-page="${currentPage + 1}" ${nextDisabled ? 'disabled' : ''} aria-label="Página siguiente">
        <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"/></svg>
      </button>
    `;

    paginationContainer.innerHTML = html;
  };

  const loadPage = async (page) => {
    if (loading) return;
    loading = true;
    currentPage = page;
    container.innerHTML = '<div class="loading-state">Consultando notificaciones...</div>';
    if (paginationContainer) paginationContainer.innerHTML = '';

    try {
      const docs = await fetchPage(page);

      container.innerHTML = '';
      if (docs.length === 0) {
        emptyFeed.classList.remove('hidden');
      } else {
        emptyFeed.classList.add('hidden');
        docs.forEach((docSnap) => renderNotification(docSnap.data()));
      }

      renderPagination();
      document.querySelector('.notifications-feed-module')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('Error al cargar notificaciones accionables:', error);
      container.innerHTML = '<div class="loading-state">Error al cargar la bandeja.</div>';
      if (paginationContainer) paginationContainer.innerHTML = '';
    } finally {
      loading = false;
    }
  };

  if (paginationContainer) {
    paginationContainer.addEventListener('click', (event) => {
      const button = event.target.closest('.nf-btn-pagination');
      if (!button || button.disabled) return;
      const page = Number(button.dataset.page);
      if (!Number.isInteger(page) || page < 1 || page === currentPage) return;
      loadPage(page);
    });
  }

  try {
    const countSnapshot = await getCountFromServer(buildBaseQuery());
    totalItems = countSnapshot.data().count;

    if (totalItems === 0) {
      container.innerHTML = '';
      emptyFeed.classList.remove('hidden');
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    await loadPage(1);
  } catch (error) {
    console.error('Error al contar notificaciones accionables:', error);
    container.innerHTML = '<div class="loading-state">Error al cargar la bandeja.</div>';
    if (paginationContainer) paginationContainer.innerHTML = '';
  }
}
