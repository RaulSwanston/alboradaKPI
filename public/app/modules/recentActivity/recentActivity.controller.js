import { getRecentActivities } from '../../models/Activities.js';

export default async function recentActivityController() {
  const feedContainer = document.getElementById('activity-feed');
  const noActivityMessage = document.getElementById('no-activity-message');
  const loadingMessage = feedContainer.querySelector('.loading-message');

  try {
    const activities = await getRecentActivities(15); // Pedimos las últimas 15 actividades

    // Ocultamos el mensaje de "cargando"
    if (loadingMessage) {
      loadingMessage.style.display = 'none';
    }

    if (activities.length === 0) {
      // Si no hay actividades, mostramos el mensaje de estado vacío
      noActivityMessage.style.display = 'block';
    } else {
      // Si hay actividades, las renderizamos
      const template = document.getElementById('activity-item-template');
      
      activities.forEach(activity => {
        const clone = template.content.cloneNode(true);
        const descriptionEl = clone.querySelector('.activity-description');
        const timestampEl = clone.querySelector('.activity-timestamp');

        descriptionEl.textContent = activity.description || 'Actividad sin descripción';
        
        // Formateamos el timestamp para que sea legible
        if (activity.timestamp) {
          const date = activity.timestamp.toDate();
          timestampEl.textContent = date.toLocaleString('es-VE', { 
            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
          });
        }

        feedContainer.appendChild(clone);
      });
    }

  } catch (error) {
    console.error('Error al cargar el feed de actividad:', error);
    // En caso de error, mostramos un mensaje amigable
    feedContainer.innerHTML = '<p>Ocurrió un error al cargar las actividades.</p>';
  }
}