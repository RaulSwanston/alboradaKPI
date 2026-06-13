import { t, getInternalPath } from '../../core/i18n.js';
import { router } from '/router.js';

/**
 * breadcrumbs.controller.js
 * Genera la ruta de navegación basada en la URL actual.
 */
export default async function breadcrumbsController(contexto) {
    const list = document.getElementById('breadcrumbs-list');
    if (!list) return;

    const path = window.location.pathname;
    const internalPath = getInternalPath(path);
    const config = contexto.data.appConfig;

    // Mapa extendido para rutas que no están en el sidebar
    const pathLabelMap = {
        '/': 'navigation.home',
        '/dashboard/resumen': 'navigation.resumen',
        '/dashboard/transactions': 'navigation.transactions',
        '/dashboard/properties': 'navigation.properties',
        '/residents': 'navigation.residents',
        '/services': 'navigation.catalog',
        '/dashboard/requests': 'navigation.requests',
        '/dashboard/profile': 'navigation.profile',
        '/dashboard/config': 'navigation.systemSettings',
        '/notifications': 'navigation.notifications',
        '/dashboard/payments/report': 'navigation.reportPayment',
        '/dashboard/payments/pending': 'navigation.approvePayments'
    };

    // Agregar rutas dinámicas (detalles)
    if (internalPath.startsWith('/dashboard/properties/')) pathLabelMap[internalPath] = 'navigation.propertyDetail';
    if (internalPath.startsWith('/dashboard/transactions/')) pathLabelMap[internalPath] = 'navigation.transactionDetail';

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
        
        // Intentar encontrar label en el mapa o usar el segmento capitalizado
        let labelKey = pathLabelMap[currentPath];
        
        // Si es una ruta de detalle con ID, buscamos la base
        if (!labelKey) {
            if (currentPath.includes('/properties/')) labelKey = 'navigation.properties';
            if (currentPath.includes('/transactions/')) labelKey = 'navigation.transactions';
            if (currentPath.includes('/payments/')) labelKey = 'navigation.reportPayment';
        }

        const label = labelKey ? t(labelKey) : segment.charAt(0).toUpperCase() + segment.slice(1);

        html += `
            <li class="breadcrumb-item ${isLast ? 'active' : ''}">
                ${isLast ? `<span>${label}</span>` : `<a href="${currentPath}" data-view="dashboard">${label}</a>`}
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
}
