import { t, getInternalPath, getFriendlyPath } from '../../core/i18n.js';
import { router } from '/router.js';

/**
 * breadcrumbs.controller.js
 * Genera la ruta de navegación basada en la URL actual.
 */
export default async function breadcrumbsController(contexto) {
    const list = document.getElementById('breadcrumbs-list');
    if (!list) return;

    const render = async () => {
        const path = window.location.pathname;
        const internalPath = getInternalPath(path);
        const sidebarConfig = contexto.data.appConfig.navigation?.sidebar || [];

        /**
         * Crea un mapa de rutas a labelKeys escaneando recursivamente el sidebar
         */
        const createPathMap = (items) => {
            const map = {};
            items.forEach(item => {
                if (item.path) map[getInternalPath(item.path)] = item.labelKey;
                if (item.items) Object.assign(map, createPathMap(item.items));
            });
            return map;
        };

        const pathLabelMap = createPathMap(sidebarConfig);

        // Claves adicionales para rutas de detalle o fuera del sidebar
        const extraLabels = {
            '/': 'navigation.home',
            '/dashboard': 'navigation.dashboard',
            '/dashboard/properties': 'navigation.properties',
            '/dashboard/transactions': 'navigation.transactions',
            '/dashboard/payments/report': 'navigation.reportPayment'
        };

        const segments = internalPath.split('/').filter(s => s);
        let currentPath = '';
        
        let html = `
            <li class="breadcrumb-item">
                <a href="/" data-view="dashboard">
                    <span>${t('navigation.home') || 'Inicio'}</span>
                </a>
            </li>
        `;

        segments.forEach((segment, index) => {
            currentPath += `/${segment}`;
            const isLast = index === segments.length - 1;
            
            // 1. Buscar en el mapa dinámico del sidebar
            // 2. Buscar en el mapa de extras
            // 3. Fallback: Ver si es un detalle (/:id) basándose en la base
            let labelKey = pathLabelMap[currentPath] || extraLabels[currentPath];
            
            if (!labelKey) {
                if (currentPath.includes('/properties/')) labelKey = 'navigation.propertyDetail';
                if (currentPath.includes('/transactions/')) labelKey = 'navigation.transactionDetail';
                if (currentPath.includes('/payments/')) labelKey = 'navigation.reportPayment';
            }

            const label = labelKey ? t(labelKey) : segment.charAt(0).toUpperCase() + segment.slice(1);

            html += `
                <li class="breadcrumb-item ${isLast ? 'active' : ''}">
                    ${isLast ? `<span>${label}</span>` : `<a href="${getFriendlyPath(currentPath)}" data-view="dashboard">${label}</a>`}
                </li>
            `;
        });

        list.innerHTML = html;

        // Inyectar iconos
        const handleIcons = async (container) => {
            try {
                const response = await fetch('/src/img/icons.json');
                const data = await response.json();
                container.querySelectorAll('[data-icon]').forEach(el => {
                    const icon = data.icons.find(i => i.name === el.dataset.icon);
                    if (icon) el.innerHTML = icon.svg;
                });
            } catch (e) {}
        };

        await handleIcons(list);
    };

    // Ejecutar render inicial
    await render();

    // Suscribirse a cambios de ruta
    const onRouteChanged = () => render();
    window.addEventListener('app:route-changed', onRouteChanged);

    // Retornar función de limpieza
    return () => {
        window.removeEventListener('app:route-changed', onRouteChanged);
    };
}
