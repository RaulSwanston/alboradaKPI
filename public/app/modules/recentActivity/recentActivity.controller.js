import { getRecentActivities } from '../../models/Activities.js';
import { router } from '../../../router.js';

export default async function recentActivityController(contexto) {
  const feedContainer = document.getElementById('activity-feed');
  const noActivityMessage = document.getElementById('no-activity-message');
  const loadMoreContainer = document.getElementById('load-more-container');
  const btnLoadMore = document.getElementById('btn-load-more');
  const template = document.getElementById('activity-item-template');
  const user = contexto?.data?.user;
  const permissions = contexto?.data?.permissions;

  // Icono de ojo extraído del JSON (adaptado para usar color de fuente)
  const eyeSvg = `<svg class="activity-eye-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M0 0h48v48H0z" fill="none"/><g id="Shopicon"><circle cx="24" cy="24" r="4"/><path d="M24,38c12,0,20-14,20-14s-8-14-20-14S4,24,4,24S12,38,24,38z M24,16c4.418,0,8,3.582,8,8s-3.582,8-8,8s-8-3.582-8-8S19.582,16,24,16z"/></g></svg>`;

  // Clave de visibilidad según el rol (patrón de notificationsFeed)
  const visibilityKey = permissions?.isAdmin ? 'admin' : (user?.uid || null);

  let lastDocVisible = null;
  const PAGE_SIZE = 5;

  /**
   * Mapea el tipo técnico de actividad a una configuración visual amigable con SVGs.
   */
  const activityConfig = {
    'PAYMENT_REPORTED': { 
      label: 'Pago Reportado', 
      svg: '<svg class="activity-icon-svg" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>', 
      class: 'activity-type-income', 
      category: 'Transferencia' 
    },
    'SERVICE_REQUESTED': { 
      label: 'Servicio Solicitado', 
      svg: '<svg class="activity-icon-svg" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h11A1.5 1.5 0 0 1 15 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5zM2.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5z"/><path d="M4 4h8v2H4z"/></svg>', 
      class: 'activity-type-service', 
      category: 'Uso de servicio' 
    },
    'MONTHLY_FEE_GENERATED': { 
      label: 'Cuota Generada', 
      svg: '<svg class="activity-icon-svg" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2m0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/><path d="M4.5 5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5"/></svg>', 
      class: 'activity-type-expense', 
      category: 'Vencimiento' 
    },
    'DEFAULT': { 
      label: 'Actividad', 
      svg: '<svg class="activity-icon-svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2m.995-14.901a1 1 0 1 0-1.99 0A5 5 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901"/></svg>', 
      class: '', 
      category: 'General' 
    }
  };

  /**
   * Formatea un número como moneda USD.
   */
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  /**
   * Carga y renderiza un lote de actividades.
   */
  const loadActivities = async () => {
    try {
      if (!lastDocVisible) {
        feedContainer.innerHTML = ''; 
        feedContainer.innerHTML = '<div class="loading-message"><div class="spinner-small"></div><p>Cargando actividades...</p></div>';
      } else {
        btnLoadMore.disabled = true;
        btnLoadMore.querySelector('span:first-child').textContent = 'Cargando...';
      }

      const { activities, lastVisible } = await getRecentActivities(PAGE_SIZE, lastDocVisible, visibilityKey);

      const loadingEl = feedContainer.querySelector('.loading-message');
      if (loadingEl) loadingEl.remove();

      if (activities.length === 0 && !lastDocVisible) {
        noActivityMessage.style.display = 'flex';
        loadMoreContainer.style.display = 'none';
        return;
      }

      noActivityMessage.style.display = 'none';
      lastDocVisible = lastVisible;

      activities.forEach(activity => {
        const config = activityConfig[activity.type] || activityConfig['DEFAULT'];
        const clone = template.content.cloneNode(true);
        
        const card = clone.querySelector('.activity-card');
        const iconContainer = clone.querySelector('.activity-icon-container');
        const eyeContainer = clone.querySelector('.activity-eye-container');
        const mainText = clone.querySelector('.activity-main-text');
        const subText = clone.querySelector('.activity-sub-text');

        if (config.class) card.classList.add(config.class);
        
        iconContainer.innerHTML = config.svg;
        eyeContainer.innerHTML = eyeSvg;
        
        mainText.textContent = activity.description || config.label;
        
        const date = activity.timestamp ? activity.timestamp.toDate() : new Date();
        const formattedDate = date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
        
        // Construir subtexto: Fecha • Categoría [• Monto]
        let subTextContent = `${formattedDate} • ${config.category}`;
        if (activity.details && activity.details.amount) {
          const isPositive = config.class === 'activity-type-income';
          const sign = isPositive ? '+' : '-';
          const colorClass = isPositive ? 'amount-positive' : 'amount-negative';
          subTextContent += ` • <span class="${colorClass}">${sign}${formatCurrency(activity.details.amount)}</span>`;
        }
        subText.innerHTML = subTextContent;

        // Lógica de click para mantener el estado activo
        card.addEventListener('click', () => {
          // Remover activo de cualquier otra tarjeta en el feed
          feedContainer.querySelectorAll('.activity-card.is-active').forEach(c => c.classList.remove('is-active'));
          // Activar la actual
          card.classList.add('is-active');
          console.log(`Seleccionada: ${activity.id}`);
        });

        // Lógica de click en el ojo para ver detalles (Navegación Parcial)
        eyeContainer.addEventListener('click', (e) => {
          e.stopPropagation(); // Evita que el clic en el ojo dispare el evento del padre (selección de tarjeta)
          
          if (activity.target && activity.target.id) {
            const { type, id } = activity.target;

            switch (type) {
              case 'TRANSACTION':
                console.log(`Navegando al detalle de la transacción: ${id}`);
                router.navigate(`/dashboard/transactions/${id}`, 'dashboard');
                break;
              
              case 'PROPERTY':
                console.log(`Navegando al detalle de la propiedad: ${id}`);
                router.navigate(`/dashboard/properties/${id}`, 'dashboard');
                break;

              case 'SERVICEREQUEST':
                console.warn(`El detalle para solicitudes de servicio (ID: ${id}) aún no está implementado.`);
                // Aquí podrías redirigir a una vista de servicios si existiera el detalle
                break;

              default:
                console.warn(`El tipo de destino "${type}" no tiene una ruta de detalle definida.`);
            }
          } else {
            console.error('La actividad seleccionada no tiene un ID de destino válido.');
          }
        });

        feedContainer.appendChild(clone);
      });

      loadMoreContainer.style.display = activities.length === PAGE_SIZE ? 'flex' : 'none';

    } catch (error) {
      console.error('Error al cargar actividades:', error);
      if (!lastDocVisible) {
        feedContainer.innerHTML = '<p class="error-message" style="text-align:center; padding: 2rem; color: var(--color-error);">No se pudieron cargar las actividades.</p>';
      }
    } finally {
      btnLoadMore.disabled = false;
      const btnSpan = btnLoadMore.querySelector('span:first-child');
      if (btnSpan) btnSpan.textContent = 'Cargar más actividades';
      const finalLoadingEl = feedContainer.querySelector('.loading-message');
      if (finalLoadingEl) finalLoadingEl.remove();
    }
  };

  btnLoadMore.addEventListener('click', loadActivities);
  await loadActivities();
}