import { auth } from '/app/core/firebase.js';
import Property from '../../models/Property.js';

export async function importProperties() {
  initImportProperties();
}

export default async function initImportProperties() {
    const jsonFileInput = document.getElementById('jsonFileInput');
    const importBtn = document.querySelector('#importBtn');
    const logOutput = document.querySelector('#logOutput');
    
    let propertiesToImport = [];

    // ... (log y setControlsEnabled igual)

    // Listener para el botón de importación
    importBtn.addEventListener('click', async () => {
        if (propertiesToImport.length === 0) {
            log('No hay propiedades para importar. Por favor, selecciona un archivo válido.');
            return;
        }

        const isAdmin = await checkAdminPermissions();
        if (!isAdmin) {
            log('La operación fue cancelada por falta de permisos.');
            return;
        }

        setControlsEnabled(false);
        log('Iniciando importación masiva mediante el modelo...');

        try {
            // Uso del modelo Property para la importación por lotes
            const result = await Property.importMany(propertiesToImport, (current, total, processed) => {
                log(`Lote ${current}/${total} procesado. Total importado: ${processed}/${propertiesToImport.length}`);
            });

            if (result.success) {
                log(`¡Éxito! Se han importado ${result.total} propiedades correctamente.`);
            }
        } catch (error) {
            log(`Error crítico durante la importación: ${error.message}`);
        } finally {
             jsonFileInput.disabled = false;
        }
    });

    // --- Inicialización ---
    log('Controlador de importación inicializado.');
    await checkAdminPermissions();
}

