import { auth } from '../../core/firebase.js';
import ServiceRequest from '../../models/ServiceRequest.js';

export default async function serviceApprovalController(contexto) {
  const permissions = contexto.data.permissions;
  const container = document.getElementById('approval-list-svc');
  const emptyState = document.getElementById('approval-empty-svc');
  const pendingCount = document.getElementById('pending-count-svc');

  if (!permissions.isAdmin) {
    document.querySelector('.service-approval-wrapper')?.classList.add('hidden');
    return;
  }

  if (!container) return;

  const modal = document.getElementById('rejection-modal-svc');
  const reasonEl = document.getElementById('rejection-reason-svc');
  const btnCancel = document.getElementById('btn-reject-cancel-svc');
  const btnConfirmReject = document.getElementById('btn-reject-confirm-svc');
  let currentRejectId = null;

  const hideModal = () => {
    modal?.classList.add('hidden');
    reasonEl.value = '';
    currentRejectId = null;
  };

  btnCancel?.addEventListener('click', hideModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });

  btnConfirmReject?.addEventListener('click', async () => {
    if (!currentRejectId) return;
    const reason = reasonEl.value.trim();
    btnConfirmReject.disabled = true;
    btnConfirmReject.textContent = 'Rechazando...';
    try {
      await ServiceRequest.reject(currentRejectId, reason, {
        uid: auth.currentUser?.uid,
        name: auth.currentUser?.displayName || auth.currentUser?.email
      });
      hideModal();
      removeCard(currentRejectId);
      currentRejectId = null;
    } catch (error) {
      console.error("Error al rechazar:", error);
      alert('Error al rechazar la solicitud.');
    } finally {
      btnConfirmReject.disabled = false;
      btnConfirmReject.textContent = 'Confirmar Rechazo';
    }
  });

  const removeCard = (id) => {
    const card = container.querySelector(`[data-request-id="${id}"]`);
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      setTimeout(() => {
        card.remove();
        updateEmptyState();
      }, 300);
    }
    updateEmptyState();
  };

  const updateEmptyState = () => {
    const cards = container.querySelectorAll('.approval-card');
    if (cards.length === 0) {
      container.classList.add('hidden');
      emptyState?.classList.remove('hidden');
      if (pendingCount) pendingCount.textContent = '0 pendientes';
    }
  };

  const loadRequests = async () => {
    container.innerHTML = '<div class="loading-state"><p>Cargando solicitudes...</p></div>';
    try {
      const requests = await ServiceRequest.getPending();
      if (requests.length === 0) {
        container.classList.add('hidden');
        emptyState?.classList.remove('hidden');
        if (pendingCount) pendingCount.textContent = '0 pendientes';
        return;
      }

      container.classList.remove('hidden');
      emptyState?.classList.add('hidden');
      if (pendingCount) pendingCount.textContent = `${requests.length} pendiente(s)`;

      container.innerHTML = '';
      requests.forEach(data => {
        const card = document.createElement('div');
        card.className = 'approval-card';
        card.dataset.requestId = data.id;
        card.innerHTML = `
          <div class="approval-card-header">
            <div class="approval-user">
              <div class="approval-avatar">${(data.residentName || '?')[0]}</div>
              <div>
                <strong>${data.residentName || 'Residente'}</strong>
                <small>Unidad ${data.propertyId}</small>
              </div>
            </div>
            <span class="approval-status pending-label">Pendiente</span>
          </div>
          <div class="approval-card-body">
            <div class="field-row">
              <span class="field-label">Servicio:</span>
              <span class="field-value">${data.conceptName}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Monto:</span>
              <span class="field-value">$${(data.finalAmount || 0).toFixed(2)}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Solicitado:</span>
              <span class="field-value">${data.requestDate?.toDate?.()?.toLocaleString() || '—'}</span>
            </div>
            ${data.residentNotes ? `<div class="field-row notes-row"><span class="field-label">Notas:</span><span class="field-value">${data.residentNotes}</span></div>` : ''}
          </div>
          <div class="approval-card-actions">
            <button class="button button-accent btn-reject-svc" data-id="${data.id}">Rechazar</button>
            <button class="button button-primary btn-approve-svc" data-id="${data.id}">Aprobar</button>
          </div>
        `;
        container.appendChild(card);
      });

      // Bind events
      container.querySelectorAll('.btn-approve-svc').forEach(btn => {
        btn.addEventListener('click', () => handleApprove(btn.dataset.id, btn));
      });
      container.querySelectorAll('.btn-reject-svc').forEach(btn => {
        btn.addEventListener('click', () => {
          currentRejectId = btn.dataset.id;
          modal?.classList.remove('hidden');
        });
      });

    } catch (error) {
      console.error("Error al cargar solicitudes:", error);
      container.innerHTML = '<div class="empty-state">Error al cargar solicitudes.</div>';
    }
  };

  const handleApprove = async (id, btn) => {
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Aprobando...';
    try {
      const result = await ServiceRequest.approve(id, {
        uid: auth.currentUser?.uid,
        name: auth.currentUser?.displayName || auth.currentUser?.email,
        notes: ''
      });
      alert(`✅ Solicitud aprobada.\nRecibo: ${result.voucherNumber}`);
      removeCard(id);
    } catch (error) {
      console.error("Error al aprobar:", error);
      alert(`Error al aprobar: ${error.message}`);
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  };

  await loadRequests();
}
