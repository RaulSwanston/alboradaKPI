import { db, collection, query, where, orderBy, getDocs, limit } from '../../core/firebase.js';
import { router } from '../../../router.js';

/**
 * notificationsFeed.controller.js
 * Gestiona la bandeja de entrada de notificaciones accionables.
 */
export default async function notificationsFeedController(contexto) {
  const container = document.getElementById('notifications-container');
  const emptyFeed = document.getElementById('no-notifications');
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
      route: '/dashboard/transactions' // Ajustar a vista de validación de pagos en el futuro
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
   * Carga las notificaciones según el rol.
   */
  const loadNotifications = async () => {
    try {
      let q;
      if (permissions.isAdmin) {
        // Admin: Ve todas las peticiones entrantes (pendientes)
        // Por ahora, buscamos en activities lo que es para admin
        q = query(
          collection(db, "activities"),
          where("visibility", "array-contains", "admin"),
          orderBy("timestamp", "desc"),
          limit(20)
        );
      } else {
        // Residente: Ve lo que el sistema le notifica directamente
        q = query(
          collection(db, "activities"),
          where("visibility", "array-contains", user.uid),
          orderBy("timestamp", "desc"),
          limit(20)
        );
      }

      const querySnap = await getDocs(q);

      container.innerHTML = '';
      
      if (querySnap.empty) {
        emptyFeed.classList.remove('hidden');
        return;
      }

      emptyFeed.classList.add('hidden');

      querySnap.forEach(snap => {
        const data = snap.data();
        // Filtro adicional: Solo mostramos lo que "requiere atención" o confirmación
        // (Ej: Solicitudes de membresía, aprobación de servicios, etc.)
        const activeTypes = ['MEMBERSHIP_REQUESTED', 'MEMBERSHIP_APPROVED', 'PAYMENT_REPORTED', 'SERVICE_REQUESTED'];
        if (!activeTypes.includes(data.type)) return;

        const config = configMap[data.type] || configMap['DEFAULT'];
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.notification-item');
        
        const iconWrapper = item.querySelector('.notification-icon-wrapper');
        iconWrapper.innerHTML = config.icon;
        iconWrapper.classList.add(config.class);

        item.querySelector('.notification-message').textContent = data.description;
        
        const time = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Recientemente';
        item.querySelector('.notification-time').textContent = time;

        // Botón de acción
        item.querySelector('.notification-action-btn').addEventListener('click', () => {
          router.navigate(config.route, 'dashboard');
        });

        // Click en toda la tarjeta también navega
        item.addEventListener('click', (e) => {
          if (!e.target.closest('button')) {
            router.navigate(config.route, 'dashboard');
          }
        });

        container.appendChild(clone);
      });

      // Si después del filtrado manual no quedó nada
      if (container.children.length === 0) {
        emptyFeed.classList.remove('hidden');
      }

    } catch (error) {
      console.error("Error al cargar notificaciones accionables:", error);
      container.innerHTML = '<div class="loading-state">Error al cargar la bandeja.</div>';
    }
  };

  await loadNotifications();
}
