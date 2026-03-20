import Transaction from "../../models/Transaction.js";

/**
 * transactions-detail.controller.js
 * 
 * Controlador para la gestión individual de una transacción.
 * Soporta creación, edición y eliminación.
 */
export default async function transactionsDetailController(contexto) {
    const form = document.getElementById('trans-form');
    const titleEl = document.getElementById('trans-detail-title');
    const btnDelete = document.getElementById('btn-delete-trans');
    const btnSave = document.getElementById('btn-save-trans');
    
    // Referencia directa al campo de tipo para evitar conflictos con form.type
    const typeInput = document.getElementById('trans-type');
    
    // Obtener el ID de la transacción desde los parámetros de la ruta
    const transId = contexto.params.id;
    const isNew = transId === 'new';

    if (!form || !typeInput) return;

    /**
     * Carga los datos de la transacción en el formulario
     */
    const loadTransaction = async () => {
        if (isNew) {
            titleEl.textContent = "Nueva Transacción";
            if (btnDelete) btnDelete.style.display = 'none';
            form.effectiveDate.value = new Date().toISOString().split('T')[0];
            return;
        }

        try {
            titleEl.textContent = "Cargando detalles...";
            const trans = await Transaction.getById(transId);
            
            if (!trans) {
                alert("La transacción ya no existe o no pudo ser encontrada.");
                window.history.back();
                return;
            }

            titleEl.textContent = "Editar Transacción";

            // Rellenar campos usando referencias directas o nombres seguros
            form.description.value = trans.description || '';
            form.propertyId.value = trans.propertyId || '';
            form.amount.value = trans.amount || 0;
            
            // CORRECCIÓN CRÍTICA: Asignación al nuevo nombre transactionType
            typeInput.value = trans.type || 'FEE';
            
            form.status.value = trans.status || 'verified';
            form.bankReference.value = trans.metadata?.bankReference || '';
            
            if (trans.effectiveDate) {
                let date;
                if (trans.effectiveDate.toDate) {
                    date = trans.effectiveDate.toDate();
                } else if (typeof trans.effectiveDate === 'string' || typeof trans.effectiveDate === 'number') {
                    date = new Date(trans.effectiveDate);
                } else {
                    date = new Date();
                }
                
                if (!isNaN(date.getTime())) {
                    form.effectiveDate.value = date.toISOString().split('T')[0];
                }
            }

        } catch (error) {
            console.error("[TransactionsDetail] Error al cargar:", error);
            alert("Ocurrió un error al intentar cargar los detalles de la transacción.");
        }
    };

    /**
     * Maneja el envío del formulario
     */
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const originalBtnText = btnSave.textContent;
        btnSave.disabled = true;
        btnSave.textContent = "Guardando...";

        const data = {
            description: form.description.value,
            propertyId: form.propertyId.value,
            amount: Number(form.amount.value),
            // Usamos el valor del input directo para evitar conflictos de nombres en el formulario
            type: typeInput.value,
            status: form.status.value,
            // Usamos T12:00:00 para evitar que el desfase de zona horaria reste un día al convertir a objeto Date
            effectiveDate: form.effectiveDate.value ? new Date(form.effectiveDate.value + 'T12:00:00') : new Date(),
            metadata: {
                bankReference: form.bankReference.value || ''
            }
        };

        try {
            const initiator = { type: 'USER', name: 'Administrador' }; 
            
            if (isNew) {
                await Transaction.create(data, initiator);
            } else {
                await Transaction.update(transId, data, initiator);
            }
            
            window.history.back();
        } catch (error) {
            console.error("[TransactionsDetail] Error al guardar:", error);
            alert("No se pudieron guardar los cambios.");
            btnSave.disabled = false;
            btnSave.textContent = originalBtnText;
        }
    });

    /**
     * Maneja la eliminación
     */
    if (btnDelete) {
        btnDelete.addEventListener('click', async () => {
            if (!confirm("¿Estás seguro de que deseas eliminar este movimiento?")) return;

            const originalBtnText = btnDelete.textContent;
            btnDelete.disabled = true;
            btnDelete.textContent = "Eliminando...";

            try {
                await Transaction.delete(transId, { type: 'USER', name: 'Administrador' });
                window.history.back();
            } catch (error) {
                console.error("[TransactionsDetail] Error al eliminar:", error);
                alert("Error al intentar eliminar el registro.");
                btnDelete.disabled = false;
                btnDelete.textContent = originalBtnText;
            }
        });
    }

    /**
     * Mejora definitiva para el datalist:
     * Al hacer clic, forzamos al navegador a mostrar TODAS las opciones 
     * independientemente del valor actual.
     */
    typeInput.addEventListener('click', () => {
        const currentVal = typeInput.value;
        typeInput.value = ''; // Limpiamos para romper el filtro del navegador
        setTimeout(() => {
            if (typeInput.value === '') {
                typeInput.value = currentVal;
                typeInput.select(); // Seleccionamos para que sea fácil sobreescribir
            }
        }, 10);
    });

    // Inicializar carga
    await loadTransaction();

    return () => {
        console.log("Módulo de detalle de transacción cerrado.");
    };
}
