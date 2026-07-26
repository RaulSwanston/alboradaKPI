import { t } from '../../core/i18n.js';
import { router } from '/router.js';

/**
 * Controlador para el módulo de Acciones Rápidas (quickActions).
 * Gestiona la interactividad y la renderización dinámica.
 */
export default async function quickActionsController(contexto) {
    const container = document.getElementById("qa-container");
    if (!container) return;

    const config = contexto.data.appConfig;
    const permissions = contexto.data.permissions;
    const userRole = permissions.role;

    /**
     * Inyecta los iconos SVG desde el repositorio central.
     */
    const handleIcons = async (parent) => {
        try {
            const response = await fetch('/src/img/icons.json');
            const data = await response.json();
            
            parent.querySelectorAll('[data-icon]').forEach(el => {
                const iconData = data.icons.find(i => i.name === el.dataset.icon);
                if (iconData) el.innerHTML = iconData.svg;
            });
        } catch (error) {
            console.error("Error al cargar icons.json en quickActions:", error);
        }
    };

    const renderActions = async () => {
        const actions = config.quickActions || [];
        let html = '';

        actions.forEach(action => {
            // Verificar permisos
            if (action.roles && !action.roles.includes(userRole) && !permissions.isAdmin) return;

            html += `
                <div class="qa-item" data-path="${action.path}">
                    <div class="qa-icon-wrapper" data-icon="${action.icon}"></div>
                    <span class="qa-label">${t(action.labelKey)}</span>
                </div>
            `;
        });

        if (html === '') {
            container.innerHTML = `<div class="qa-empty">No hay acciones disponibles</div>`;
            return;
        }

        container.innerHTML = html;
        await handleIcons(container);
        attachEvents();
    };

    const attachEvents = () => {
        container.querySelectorAll('.qa-item').forEach(item => {
            item.onclick = (e) => {
                const path = item.dataset.path;
                if (path) router.navigate(path, 'dashboard');
            };
        });
    };

    await renderActions();
}
