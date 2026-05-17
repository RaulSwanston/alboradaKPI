/**
 * Controlador para el módulo de Acciones Rápidas (quickActions).
 * Gestiona la interactividad y la inyección de iconos.
 * 
 * @param {Object} context - El contexto de la navegación.
 */
export default async function quickActionsController(context) {
    console.log('Módulo quickActions inicializado');

    /**
     * Inyecta los iconos SVG desde el repositorio central.
     */
    const handleIcons = async (container = document) => {
        try {
            const response = await fetch('/src/img/icons.json');
            const data = await response.json();
            const iconRepo = data.icons;

            const inject = (c, iconName) => {
                const iconData = iconRepo.find(i => i.name === iconName);
                if (iconData && c) {
                    c.innerHTML = iconData.svg;
                }
            };

            container.querySelectorAll('[data-icon]').forEach(el => {
                inject(el, el.dataset.icon);
            });
        } catch (error) {
            console.error("Error al cargar icons.json en quickActions:", error);
        }
    };

    // Ejecutar inyección de iconos
    await handleIcons();
}
