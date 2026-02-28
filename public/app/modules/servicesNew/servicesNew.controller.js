import ChargeConcept from "../../models/ChargeConcept.js";
import Property from "../../models/Property.js";

/**
 * Controlador para la creación de un nuevo concepto de cargo con catálogo local de iconos.
 */
export default async function servicesNewController(context) {
    const LOCAL_ICONS_URL = 'src/img/icons.json';

    const form = document.getElementById('form-new-concept');
    const nameInput = document.getElementById('concept-name');
    const iconBtn = document.getElementById('btn-select-icon');
    const iconPanel = document.getElementById('icon-results-panel');
    const iconGrid = document.getElementById('icon-results-grid');
    const iconPreview = document.getElementById('selected-icon-preview');
    const iconUrlInput = document.getElementById('selected-icon-url');
    const colorInput = document.getElementById('icon-color');
    const closePanelBtn = document.getElementById('btn-close-icon-panel');
    const submitBtn = document.getElementById('btn-submit-concept');
    const statusText = document.getElementById('search-status-text');
    
    // Elementos para selección manual de propiedades e UI
    const applicableRadios = form.querySelectorAll('input[name="applicableTo"]');
    const manualSelector = document.getElementById('manual-properties-selector');
    const propertyGrid = document.getElementById('property-selection-grid');
    const modal = document.getElementById('modal-confirmation');
    const summaryContainer = document.getElementById('confirmation-summary');
    
    const btnEdit = document.getElementById('btn-edit-confirmation');
    const btnConfirmFinal = document.getElementById('btn-confirm-final');

    let fullCatalog = []; 
    let allProperties = [];
    let searchTimeout;
    let pendingConceptData = null; // Almacén temporal para el modal

    if (!form) return;

    /**
     * Carga las propiedades para el selector manual.
     */
    const loadProperties = async () => {
        try {
            allProperties = await Property.getAll();
            renderProperties();
        } catch (error) {
            console.error("Error cargando propiedades:", error);
            propertyGrid.innerHTML = '<div class="error">Error al cargar unidades.</div>';
        }
    };

    const renderProperties = () => {
        propertyGrid.innerHTML = '';
        if (allProperties.length === 0) {
            propertyGrid.innerHTML = '<div>No hay unidades registradas.</div>';
            return;
        }

        allProperties.forEach(prop => {
            const ownerName = prop.ownerInfo?.name || 'Sin nombre';
            const tag = document.createElement('label');
            tag.className = 'property-tag';
            tag.innerHTML = `
                <input type="checkbox" name="selectedProperties" value="${prop.id}">
                <div class="tag-content" title="${prop.id} - ${ownerName}">
                    <strong>${prop.id}</strong> - ${ownerName}
                </div>
            `;
            propertyGrid.appendChild(tag);
        });
    };

    const showConfirmationModal = (data) => {
        pendingConceptData = data; // Guardamos para el paso final
        const typeLabels = {
            ordinary: 'Cuota Ordinaria',
            extraordinary: 'Cuota Extraordinaria',
            fine: 'Multa',
            service: 'Servicio',
            reservation: 'Reserva de Amenidad'
        };

        let targetText = data.applicableTo === 'all' ? 'Todas las Unidades' : `${data.targetProperties.length} Unidades Seleccionadas`;
        let propertyChips = data.targetProperties.map(id => `<span class="prop-chip">${id}</span>`).join('');

        summaryContainer.innerHTML = `
            <div class="summary-icon-preview">
                <div class="icon-display">${data.icon}</div>
                <div class="summary-item">
                    <label>Nombre del Concepto</label>
                    <div class="value">${data.name}</div>
                </div>
            </div>

            <div class="summary-item">
                <label>Tipo de Cargo</label>
                <div class="value">${typeLabels[data.type] || data.type}</div>
            </div>

            <div class="summary-item">
                <label>Monto Predeterminado</label>
                <div class="value">$${data.defaultAmount.toFixed(2)}</div>
            </div>

            <div class="summary-item">
                <label>Recurrencia</label>
                <div class="value">${data.isRecurring ? 'Mensual (Automático)' : 'Pago Único'}</div>
            </div>

            <div class="summary-item">
                <label>Aplicable a</label>
                <div class="value">${targetText}</div>
                ${data.applicableTo === 'manual' ? `<div class="property-chips-summary">${propertyChips}</div>` : ''}
            </div>

            <div class="summary-item">
                <label>Descripción</label>
                <div class="value">${data.description || 'Sin descripción'}</div>
            </div>
        `;

        modal.classList.remove('hidden');
    };

    /**
     * Limpia un SVG de colores fijos para permitir su personalización mediante CSS.
     * @param {string} svgHtml - El código SVG original.
     * @returns {string} El SVG modificado con currentColor.
     */
    const cleanSvg = (svgHtml) => {
        if (!svgHtml) return '';
        // Reemplazamos fill y stroke fijos por currentColor para que hereden del contenedor
        return svgHtml
            .replace(/fill=['"]#[0-9a-fA-F]{3,6}['"]/g, 'fill="currentColor"')
            .replace(/stroke=['"]#[0-9a-fA-F]{3,6}['"]/g, 'stroke="currentColor"');
    };

    /**
     * Carga el catálogo local de iconos desde el archivo JSON.
     */
    const loadLocalCatalog = async () => {
        try {
            const response = await fetch(LOCAL_ICONS_URL);
            const data = await response.json();
            fullCatalog = (data.icons || []).map(icon => ({
                ...icon,
                title: icon.name,
                svg: cleanSvg(icon.svg) // Limpiamos al cargar
            }));
            console.log(`[IconSystem] Catálogo local cargado: ${fullCatalog.length} iconos.`);
            iconGrid.innerHTML = '<div class="loading-icons">Escribe el nombre del concepto para ver sugerencias...</div>';
        } catch (error) {
            console.error('[IconSystem] Error cargando catálogo local:', error);
            statusText.textContent = "Error al cargar librería de iconos.";
        }
    };

    const validateForm = () => {
        const isFormValid = form.checkValidity();
        const hasIcon = !!iconUrlInput.value;
        submitBtn.disabled = !(isFormValid && hasIcon);
    };

    const updatePreviewColor = () => {
        const color = colorInput.value;
        iconPreview.style.color = color;
    };

    const translateToEnglish = async (text) => {
        if (!text) return '';
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url);
            const data = await response.json();
            return data[0][0][0].toLowerCase(); 
        } catch (error) {
            return text.toLowerCase();
        }
    };

    /**
     * Filtra localmente el catálogo basándose en palabras clave.
     */
    const filterIconsLocally = async (query) => {
        if (!query || query.length < 2) {
            iconGrid.innerHTML = '<div class="loading-icons">Escribe el nombre del concepto para ver sugerencias...</div>';
            statusText.textContent = "Esperando búsqueda...";
            return;
        }

        statusText.textContent = `Buscando iconos para "${query}"...`;
        
        const englishQuery = await translateToEnglish(query);
        const keywords = [...query.toLowerCase().split(' '), ...englishQuery.toLowerCase().split(' ')]
            .filter(word => word.length > 2);

        const filtered = fullCatalog.filter(icon => {
            const name = (icon.name || '').toLowerCase();
            const tags = (icon.tags || []).join(' ').toLowerCase();
            const allMetadata = `${name} ${tags}`;
            return keywords.some(word => allMetadata.includes(word));
        });

        renderIconResults(filtered);
    };

    const renderIconResults = (icons) => {
        iconGrid.innerHTML = '';
        if (icons.length === 0) {
            statusText.textContent = "No hay coincidencias en la librería.";
            return;
        }

        statusText.textContent = `${icons.length} iconos encontrados.`;

        icons.forEach(icon => {
            const iconItem = document.createElement('div');
            iconItem.className = 'icon-item';
            iconItem.title = icon.name;
            iconItem.style.color = colorInput.value; // Aplicamos color actual al grid
            iconItem.innerHTML = icon.svg;
            
            iconItem.addEventListener('click', () => {
                selectIcon(icon);
            });
            iconGrid.appendChild(iconItem);
        });
    };

    const selectIcon = (icon) => {
        iconUrlInput.value = icon.svg;
        iconPreview.innerHTML = icon.svg;
        updatePreviewColor();
        document.querySelectorAll('.icon-item').forEach(el => el.classList.remove('selected'));
        validateForm();
        iconPanel.classList.add('hidden');
    };

    // --- Listeners ---
    nameInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => filterIconsLocally(e.target.value.trim()), 500);
        validateForm();
    });

    colorInput.addEventListener('input', () => {
        updatePreviewColor();
        // También actualizamos los iconos del grid si está visible
        document.querySelectorAll('.icon-item').forEach(el => {
            el.style.color = colorInput.value;
        });
    });

    iconBtn.addEventListener('click', () => {
        iconPanel.classList.toggle('hidden');
    });

    closePanelBtn.addEventListener('click', () => iconPanel.classList.add('hidden'));
    form.addEventListener('input', validateForm);

    // Listener para mostrar/ocultar selector de propiedades
    applicableRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'manual') {
                manualSelector.classList.remove('hidden');
                loadProperties();
            } else {
                manualSelector.classList.add('hidden');
            }
        });
    });

    btnEdit.addEventListener('click', () => modal.classList.add('hidden'));

    btnConfirmFinal.addEventListener('click', async () => {
        if (!pendingConceptData) return;
        
        btnConfirmFinal.disabled = true;
        btnConfirmFinal.textContent = 'Guardando...';

        try {
            const finalData = {
                ...pendingConceptData,
                billingFrequency: pendingConceptData.isRecurring ? 'monthly' : 'one-time',
                isRequestableByResident: (pendingConceptData.type === 'service' || pendingConceptData.type === 'reservation'),
                requiresApproval: true
            };

            await ChargeConcept.create(finalData);
            
            if (window.appRouter) window.appRouter.navigate('/dashboard/services');
            else window.history.back();
        } catch (error) {
            console.error("Error al crear concepto:", error);
            alert('Error crítico al guardar en la base de datos.');
            btnConfirmFinal.disabled = false;
            btnConfirmFinal.textContent = 'Confirmar y Crear';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const formData = new FormData(form);
            const isRecurring = form.querySelector('input[name="isRecurring"]').checked;
            const applicableTo = formData.get('applicableTo');
            const selectedColor = formData.get('iconColor');
            let finalSvg = formData.get('iconUrl');

            // Recolectar propiedades seleccionadas si es manual
            let targetProperties = [];
            if (applicableTo === 'manual') {
                const checkedProps = propertyGrid.querySelectorAll('input[name="selectedProperties"]:checked');
                targetProperties = Array.from(checkedProps).map(cb => cb.value);
            }

            // Inyectamos el color real en el SVG para que sea persistente
            if (finalSvg) {
                finalSvg = finalSvg.replace(/currentColor/g, selectedColor);
            }

            const conceptData = {
                name: formData.get('name').trim(),
                icon: finalSvg, // Campo único con el SVG coloreado
                type: formData.get('type'),
                defaultAmount: parseFloat(formData.get('defaultAmount')) || 0,
                isRecurring: isRecurring,
                billingFrequency: isRecurring ? 'monthly' : 'one-time',
                applicableTo: applicableTo,
                targetProperties: targetProperties,
                description: formData.get('description').trim()
            };

            // En lugar de guardar directamente, mostramos el modal de confirmación
            showConfirmationModal(conceptData);

        } catch (error) {
            alert('Error al procesar los datos.');
        }
    });

    loadLocalCatalog();
    updatePreviewColor();
    validateForm();
}

