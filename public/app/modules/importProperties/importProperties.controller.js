import { auth, db, doc, writeBatch } from '/app/core/firebase.js';

export async function importProperties() {
  initImportProperties();
}

export default async function initImportProperties() {
    const jsonFileInput = document.getElementById('jsonFileInput');
    const importBtn = document.querySelector('#importBtn');
    const logOutput = document.querySelector('#logOutput');
    
    let propertiesToImport = [];

    /**
     * Muestra un mensaje en el área de registro de la página.
     * @param {string} message - El mensaje a mostrar.
     */
    function log(message) {
        console.log(message);
        logOutput.textContent += `> ${message}\n`;
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    /**
     * Habilita o deshabilita los controles de la interfaz.
     * @param {boolean} enabled - True para habilitar, false para deshabilitar.
     */
    function setControlsEnabled(enabled) {
        jsonFileInput.disabled = !enabled;
        if (!enabled) {
            importBtn.disabled = true;
        }
    }

    /**
     * Verifica los permisos del usuario actual.
     * @returns {Promise<boolean>} - True si el usuario es administrador, false en caso contrario.
     */
    async function checkAdminPermissions() {
        const user = auth.currentUser;
        if (!user) {
            log('Error: No hay un usuario autenticado. Por favor, inicia sesión.');
            setControlsEnabled(false);
            return false;
        }

        try {
            const idTokenResult = await user.getIdTokenResult();
            if (idTokenResult.claims.admin) {
                log(`Permisos de administrador verificados para ${user.email}.`);
                setControlsEnabled(true);
                return true;
            } else {
                log(`Error: El usuario ${user.email} no tiene permisos de administrador.`);
                setControlsEnabled(false);
                return false;
            }
        } catch (error) {
            log(`Error al verificar los permisos: ${error.message}`);
            setControlsEnabled(false);
            return false;
        }
    }

    // --- Event Listeners ---

    // Listener para el selector de archivos
    jsonFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        importBtn.disabled = true;
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                propertiesToImport = JSON.parse(e.target.result);
                if (Array.isArray(propertiesToImport) && propertiesToImport.length > 0) {
                    log(`Archivo "${file.name}" cargado. Se encontraron ${propertiesToImport.length} propiedades listas para importar.`);
                    importBtn.disabled = false;
                } else {
                    log('Error: El archivo JSON no es un array válido o está vacío.');
                    propertiesToImport = [];
                }
            } catch (error) {
                log(`Error al procesar el archivo JSON: ${error.message}`);
                propertiesToImport = [];
            }
        };
        
        reader.readAsText(file);
    });

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

        setControlsEnabled(false); // Deshabilitar controles durante la importación
        log('Iniciando importación en lotes...');

        // Firestore limita las escrituras en lote a 500 operaciones. Dividimos en trozos.
        const chunks = [];
        for (let i = 0; i < propertiesToImport.length; i += 450) {
            chunks.push(propertiesToImport.slice(i, i + 450));
        }

        let totalProcessed = 0;
        try {
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const batch = writeBatch(db);
                
                chunk.forEach(prop => {
                    const { id, ...data } = prop; // Separamos el ID del resto de los datos
                    if (id) {
                        const docRef = doc(db, 'properties', String(id)); // Aseguramos que el ID sea un string
                        batch.set(docRef, data);
                    }
                });

                await batch.commit();
                totalProcessed += chunk.length;
                log(`Lote ${i + 1}/${chunks.length} procesado. Total de propiedades importadas: ${totalProcessed}/${propertiesToImport.length}`);
            }
            log('¡Éxito! Todas las propiedades han sido importadas a Firestore.');

        } catch (error) {
            log(`Error crítico durante la importación: ${error.message}`);
            log('La importación ha sido detenida. Revisa los logs para más detalles.');
        } finally {
            // Vuelve a habilitar solo el selector de archivos, el botón de importar requiere nueva selección
             jsonFileInput.disabled = false;
        }
    });

    // --- Inicialización ---
    log('Controlador de importación inicializado.');
    await checkAdminPermissions();
}
