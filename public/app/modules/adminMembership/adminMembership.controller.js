import { db, collection, getDocs, doc, updateDoc, query, where, arrayUnion, writeBatch, serverTimestamp } from '../../core/firebase.js';
import MembershipRequest from '../../models/MembershipRequest.js';

/**
 * Controlador para la gestión administrativa de membresías.
 * Permite aprobar o rechazar solicitudes de vinculación de residentes.
 */
export default async function adminMembershipController(contexto) {
  const permissions = contexto.data.permissions;
  const container = document.getElementById('requests-list-container');
  
  // Seguridad: Solo mostrar si es admin
  if (!permissions.isAdmin) {
    document.querySelector('.admin-membership-module')?.classList.add('hidden');
    return;
  }

  if (!container) return;

  /**
   * Carga las solicitudes pendientes desde Firestore
   */
  const loadRequests = async () => {
    container.innerHTML = '<div class="loading-state">Cargando solicitudes...</div>';
    
    try {
      const requests = await MembershipRequest.getByStatus('pending');

      if (requests.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay solicitudes pendientes de revisión.</div>';
        return;
      }

      container.innerHTML = '';
      const template = document.getElementById('request-card-template');

      requests.forEach(data => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.request-card');
        
        card.querySelector('.user-name').textContent = data.userName;
        card.querySelector('.user-email').textContent = data.userEmail;
        card.querySelector('.property-name').textContent = data.requestedPropertyName;
        card.querySelector('.request-date').textContent = data.createdAt?.toDate().toLocaleString() || 'Fecha no disponible';

        // Botones de acción
        const btnApprove = card.querySelector('.btn-approve');
        const btnReject = card.querySelector('.btn-reject');

        btnApprove.addEventListener('click', () => handleAction(data.id, data, 'approved', btnApprove));
        btnReject.addEventListener('click', () => handleAction(data.id, data, 'rejected', btnReject));

        container.appendChild(clone);
      });

    } catch (error) {
      console.error("Error al cargar solicitudes:", error);
      container.innerHTML = '<div class="empty-state">Error al cargar los datos.</div>';
    }
  };

  /**
   * Procesa la aprobación o rechazo de una solicitud
   */
  const handleAction = async (requestId, requestData, newStatus, btnElement) => {
    const originalText = btnElement.textContent;
    btnElement.disabled = true;
    btnElement.textContent = 'Procesando...';

    try {
      // Uso del modelo para procesamiento atómico
      await MembershipRequest.process(requestId, requestData, newStatus);
      
      // Remover la tarjeta de la UI con una pequeña animación
      const card = btnElement.closest('.request-card');
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => {
        card.remove();
        if (container.children.length === 0) {
          container.innerHTML = '<div class="empty-state">No hay solicitudes pendientes de revisión.</div>';
        }
      }, 300);

    } catch (error) {
      console.error(`Error al procesar ${newStatus}:`, error);
      alert(`No se pudo procesar la solicitud: ${error.message}`);
      btnElement.disabled = false;
      btnElement.textContent = originalText;
    }
  };

  await loadRequests();
}
