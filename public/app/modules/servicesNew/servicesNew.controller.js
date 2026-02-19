import ChargeConcept from "../../models/ChargeConcept.js";

/**
 * Controlador para la creación de un nuevo concepto de cargo con selector de iconos Lordicon.
 */
export default async function servicesNewController(context) {
    const LORDICON_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBJZCI6Mjk2LCJzZWNyZXQiOiJQcFRTa1Z6RDV5RmtxRlJpcDQwS1h0QVpKTEVRZmMwZCIsImlhdCI6MTc3MTQ4ODkyN30.jp1MLWxpxBhYFFzLmeX8fNsEL_rdVF2R63JQzHKZeEE';
    const LORDICON_API_URL = 'https://api.lordicon.com/v1/icons';

    const form = document.getElementById('form-new-concept');
    const nameInput = document.getElementById('concept-name');
    const iconBtn = document.getElementById('btn-select-icon');
    const iconPanel = document.getElementById('icon-results-panel');
    const iconGrid = document.getElementById('icon-results-grid');
    const iconPreview = document.getElementById('selected-icon-preview');
    const iconUrlInput = document.getElementById('selected-icon-url');
    const closePanelBtn = document.getElementById('btn-close-icon-panel');
    const submitBtn = document.getElementById('btn-submit-concept');
    const statusText = document.getElementById('search-status-text');

    let searchTimeout;

    if (!form) return;

    /**
     * Valida si el formulario está completo para habilitar el botón de envío.
     */
    const validateForm = () => {
        const isFormValid = form.checkValidity();
        const hasIcon = !!iconUrlInput.value;
        submitBtn.disabled = !(isFormValid && hasIcon);
    };

    /**
     * Traduce el texto al inglés para mejorar los resultados en Lordicon.
     */
    const translateToEnglish = async (text) => {
        if (!text) return '';
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url);
            const data = await response.json();
            return data[0][0][0]; 
        } catch (error) {
            return text;
        }
    };

    /**
     * Busca iconos en Lordicon basados en una palabra clave traducida.
     */
    const searchIcons = async (query) => {
        if (!query || query.length < 3) {
            statusText.textContent = "Escribe al menos 3 letras para buscar...";
            return;
        }

        statusText.textContent = `Analizando "${query}"...`;
        iconGrid.innerHTML = '<div class="loading-icons">Buscando iconos...</div>';

        try {
            const translatedQuery = await translateToEnglish(query);
            const cleanQuery = translatedQuery.split(' ').filter(w => w.length > 2).join(' ');

            const response = await fetch(`${LORDICON_API_URL}?search=${encodeURIComponent(cleanQuery)}&premium=false&family=system&per_page=16`, {
                headers: {
                    'Authorization': `Bearer ${LORDICON_TOKEN}`
                }
            });

            if (!response.ok) throw new Error('Error en la respuesta del API');

            const data = await response.json();
            const icons = Array.isArray(data) ? data : (data.value || []);

            // Fallback: Si no hay resultados con la frase, buscar solo el núcleo (última palabra)
            if (icons.length === 0 && cleanQuery.includes(' ')) {
                const words = cleanQuery.split(' ');
                const lastWord = words[words.length - 1];
                return searchIcons(lastWord); 
            }

            renderIconResults(icons);
        } catch (error) {
            console.error('[Lordicon] Error:', error);
            statusText.textContent = "Error al cargar iconos.";
            iconGrid.innerHTML = '<div class="loading-icons">No se pudieron cargar los iconos.</div>';
        }
    };

    /**
     * Renderiza los resultados de la búsqueda en la cuadrícula.
     */
    const renderIconResults = (icons) => {
        if (icons.length === 0) {
            statusText.textContent = "No se encontraron iconos.";
            iconGrid.innerHTML = '<div class="loading-icons">Intenta con otra palabra.</div>';
            return;
        }

        statusText.textContent = `${icons.length} iconos encontrados.`;
        iconGrid.innerHTML = '';

        icons.forEach(icon => {
            const svgUrl = icon.files?.svg;
            if (!svgUrl) return;

            const iconItem = document.createElement('div');
            iconItem.className = 'icon-item';
            iconItem.innerHTML = `<img src="${svgUrl}" alt="icon">`;
            
            iconItem.addEventListener('click', () => {
                selectIcon(svgUrl);
            });

            iconGrid.appendChild(iconItem);
        });
    };

    /**
     * Maneja la selección de un icono.
     */
    const selectIcon = (url) => {
        iconUrlInput.value = url;
        iconPreview.innerHTML = `<img src="${url}" alt="selected icon">`;
        
        document.querySelectorAll('.icon-item').forEach(el => el.classList.remove('selected'));
        const selectedEl = Array.from(document.querySelectorAll('.icon-item img')).find(img => img.src === url);
        if (selectedEl) selectedEl.parentElement.classList.add('selected');

        iconPanel.classList.add('hidden');
        validateForm();
    };

    // --- Event Listeners ---

    nameInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        searchTimeout = setTimeout(() => {
            searchIcons(query);
        }, 800);

        validateForm();
    });

    iconBtn.addEventListener('click', () => {
        iconPanel.classList.toggle('hidden');
        if (!iconPanel.classList.contains('hidden') && iconGrid.children.length <= 1) {
            searchIcons(nameInput.value.trim());
        }
    });

    closePanelBtn.addEventListener('click', () => {
        iconPanel.classList.add('hidden');
    });

    form.addEventListener('input', validateForm);
    form.addEventListener('change', validateForm);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        submitBtn.disabled = true;
        const originalHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Guardando concepto...';

        try {
            const formData = new FormData(form);
            const isRecurring = form.querySelector('input[name="isRecurring"]').checked;
            
            const conceptData = {
                name: formData.get('name').trim(),
                iconUrl: formData.get('iconUrl'),
                type: formData.get('type'),
                defaultAmount: parseFloat(formData.get('defaultAmount')) || 0,
                isRecurring: isRecurring,
                billingFrequency: isRecurring ? 'monthly' : 'one-time',
                applicableTo: formData.get('applicableTo'),
                description: formData.get('description').trim(),
                isRequestableByResident: (formData.get('type') === 'service' || formData.get('type') === 'reservation'),
                requiresApproval: true
            };

            const docId = await ChargeConcept.create(conceptData);
            
            if (docId) {
                if (window.appRouter) {
                    window.appRouter.navigate('/dashboard/services');
                } else {
                    window.history.back();
                }
            }
        } catch (error) {
            console.error('[ServicesNew] Error al guardar:', error);
            alert('Error al crear el concepto.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    });

    validateForm();
}
