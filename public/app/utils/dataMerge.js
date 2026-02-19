// public/app/core/dataMerge.js

/**
 * Normaliza un nombre para usarlo como clave de fusión, eliminando espacios y convirtiendo a minúsculas.
 * @param {string} name - El nombre del propietario.
 * @returns {string} El nombre normalizado.
 */
function normalizeName(name) {
    if (typeof name !== 'string') return '';
    return name.toLowerCase().replace(/\s+/g, '').trim();
}

/**
 * Consolida un array de objetos de entidad, fusionando duplicados basados en propertyId u ownerName.
 * Prioriza propertyId como identificador único. Si no está presente, usa ownerName normalizado.
 * @param {Array<Object>} entitiesArray - Array de objetos de entidad extraídos de diferentes fuentes (IA).
 * @returns {Array<Object>} Un array de objetos de entidad únicos y consolidados.
 */
export function consolidateEntities(entitiesArray) {
    const consolidatedMap = new Map(); // Usaremos un Map para almacenar entidades únicas

    for (const entity of entitiesArray) {
        const propertyId = entity.propertyId;
        const ownerName = entity.ownerName;

        let identifier = null;

        // Priorizar propertyId como identificador único
        if (propertyId) {
            identifier = `prop-${propertyId}`;
        } else if (ownerName) {
            // Si no hay propertyId, usar ownerName normalizado como identificador secundario
            identifier = `name-${normalizeName(ownerName)}`;
        }

        if (!identifier) {
            // Si no podemos identificar la entidad, la ignoramos o la tratamos como un error.
            // Para propósitos de este módulo, simplemente la saltamos.
            console.warn("Entidad sin identificador clave (propertyId o ownerName), se omite:", entity);
            continue;
        }

        if (consolidatedMap.has(identifier)) {
            // Si la entidad ya existe, fusionar la información
            const existingEntity = consolidatedMap.get(identifier);
            // Fusionar campos: los nuevos campos complementan a los existentes.
            // Si hay un campo existente y el nuevo tiene un valor, el nuevo sobrescribe.
            // Esto es una estrategia simple; se puede hacer más compleja si se necesitan reglas específicas.
            Object.assign(existingEntity, entity);
        } else {
            // Si es una entidad nueva, añadirla al mapa
            consolidatedMap.set(identifier, { ...entity }); // Clonar para evitar mutaciones directas
        }
    }

    return Array.from(consolidatedMap.values()); // Convertir el Map de nuevo a un array de objetos
}
