import { db, collection, getDocs, doc, updateDoc, query, where, arrayUnion, writeBatch, serverTimestamp } from '../../core/firebase.js';

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
      const q = query(collection(db, "membershipRequests"), where("status", "==", "pending"));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        container.innerHTML = '<div class="empty-state">No hay solicitudes pendientes de revisión.</div>';
        return;
      }

      container.innerHTML = '';
      const template = document.getElementById('request-card-template');

      querySnap.forEach(snap => {
        const data = snap.data();
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.request-card');
        
        card.querySelector('.user-name').textContent = data.userName;
        card.querySelector('.user-email').textContent = data.userEmail;
        card.querySelector('.property-name').textContent = data.requestedPropertyName;
        card.querySelector('.request-date').textContent = data.createdAt?.toDate().toLocaleString() || 'Fecha no disponible';

        // Botones de acción
        const btnApprove = card.querySelector('.btn-approve');
        const btnReject = card.querySelector('.btn-reject');

        btnApprove.addEventListener('click', () => handleAction(snap.id, data, 'approved', btnApprove));
        btnReject.addEventListener('click', () => handleAction(snap.id, data, 'rejected', btnReject));

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
      const batch = writeBatch(db);

      // 1. Actualizar estado de la solicitud
      const requestRef = doc(db, "membershipRequests", requestId);
      batch.update(requestRef, { 
        status: newStatus,
        processedAt: serverTimestamp()
      });

      if (newStatus === 'approved') {
        // 2. Vincular propiedad al usuario
        const userRef = doc(db, "users", requestData.userId);
        batch.update(userRef, {
          role: 'resident', // Elevamos el rol a residente
          propertyIds: arrayUnion(requestData.requestedPropertyId)
        });

        // 3. Vincular usuario a la propiedad
        const propertyRef = doc(db, "properties", requestData.requestedPropertyId);
        batch.update(propertyRef, {
          residentUids: arrayUnion(requestData.userId)
        });

        // 4. Registrar actividad de sistema (Notificación de éxito)
        const activityRef = doc(collection(db, "activities"));
        batch.set(activityRef, {
          type: 'MEMBERSHIP_APPROVED',
          timestamp: serverTimestamp(),
          description: `Solicitud de ${requestData.userName} para ${requestData.requestedPropertyName} aprobada.`,
          initiator: { type: 'SYSTEM', name: 'Administración' },
          target: { type: 'PROPERTY', id: requestData.requestedPropertyId, name: requestData.requestedPropertyName },
          visibility: ['admin', requestData.userId]
        });
      }

      await batch.commit();
      
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
