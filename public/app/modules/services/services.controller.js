import ChargeConcept from "../../models/ChargeConcept.js";
import { auth } from "../../core/firebase.js";

/**
 * Controlador para la vista de servicios disponibles para los residentes.
 */
export default async function services(context) {
    const listContainer = document.getElementById('services-list-container');
    const fabAdmin = document.querySelector('.fab-button[admin]');

    if (!listContainer) return;

    /**
     * Verifica si el usuario actual tiene rol de administrador.
     */
    const checkIsAdmin = async () => {
        const user = auth.currentUser;
        console.log("[AuthDebug] Usuario actual en Auth:", user ? user.email : "No autenticado");
        
        if (!user) return false;
        
        const idTokenResult = await user.getIdTokenResult();
        console.log("[AuthDebug] Custom Claims encontrados:", idTokenResult.claims);
        
        const isAdmin = idTokenResult.claims.admin === true;
        console.log("[AuthDebug] ¿Es Administrador según Claims?:", isAdmin);
        
        return isAdmin;
    };

    const isAdmin = await checkIsAdmin();

    // Gestionar visibilidad del FAB
    if (fabAdmin && isAdmin) {
        fabAdmin.classList.add('is-admin');
    }

    /**
     * Carga y renderiza los servicios disponibles.
     */
    const loadServices = async () => {
        try {
            listContainer.innerHTML = '<div class="loading-text">Cargando catálogo...</div>';
            
            const concepts = await ChargeConcept.getAll();
            
            let displayConcepts = [];
            
            if (isAdmin) {
                // El administrador ve TODO el catálogo para gestión
                displayConcepts = concepts;
                console.log("[Services] Administrador detectado: Mostrando catálogo completo.");
            } else {
                // El residente solo ve lo que puede solicitar
                displayConcepts = concepts.filter(c => c.isRequestableByResident === true);
            }

            renderServices(displayConcepts, isAdmin);
        } catch (error) {
            console.error("Error cargando servicios:", error);
            listContainer.innerHTML = '<div class="error">Error al conectar con la base de datos.</div>';
        }
    };

    /**
     * Genera el HTML para cada tarjeta de servicio.
     */
    const renderServices = (services, isAdmin) => {
        if (!services || services.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-services">
                    <p>${isAdmin ? 'No has creado ningún concepto de cargo aún.' : 'No hay servicios adicionales configurados en este momento.'}</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        services.forEach(service => {
            const card = document.createElement('div');
            card.className = 'service-card';
            
            // Mapeo de etiquetas legibles
            const typeLabels = {
                service: 'Servicio',
                reservation: 'Reserva',
                ordinary: 'Cuota Ord.',
                extraordinary: 'Cuota Ext.',
                fine: 'Multa'
            };

            const isRequestable = service.isRequestableByResident === true;
            
            card.innerHTML = `
                <div class="service-header">
                    <div class="service-icon-box">
                        ${service.icon || '📦'}
                    </div>
                    <div class="badge-group">
                        <span class="service-badge badge-${service.type}">
                            ${typeLabels[service.type] || service.type}
                        </span>
                        ${isAdmin && !isRequestable ? '<span class="service-badge badge-admin">Privado</span>' : ''}
                    </div>
                </div>
                <div class="service-info">
                    <h3>${service.name}</h3>
                    <p class="service-description">${service.description || 'Sin descripción disponible.'}</p>
                </div>
                <div class="service-footer">
                    <div class="service-price">
                        <span class="price-label">Monto predeterminado</span>
                        <span class="price-value">$${service.defaultAmount.toFixed(2)}</span>
                    </div>
                    ${isRequestable ? '<button class="btn-request">Solicitar</button>' : (isAdmin ? '<button class="btn-request secondary">Gestionar</button>' : '')}
                </div>
            `;

            listContainer.appendChild(card);
        });
    };

    // Iniciar carga
    await loadServices();
}
