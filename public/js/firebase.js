// --- Configuración de Firebase ---
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithCredential, getAdditionalUserInfo, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, getDocs, serverTimestamp, addDoc, onSnapshot, deleteDoc, updateDoc, runTransaction, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js"; 
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAfb-hN3jJSaPHZ3JMVJyXIjkIc_-NPyGg",
  authDomain: "alboradakpi.firebaseapp.com",
  projectId: "alboradakpi",
  storageBucket: "alboradakpi.firebasestorage.app",
  messagingSenderId: "137214990147",
  appId: "1:137214990147:web:09ed9f77b6830a997601f6",
  measurementId: "G-Y23MSYLH7B"
};

// Initialize Firebase
// --- Inicialización de Servicios ---
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Referencias al DOM ---
const authContainer = document.getElementById('auth-container');
const dashboardContainer = document.getElementById('dashboard-container');
const adminContainer = document.getElementById('admin-container');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const registerButton = document.getElementById('registerButton');
const googleLoginButton = document.getElementById('googleLoginButton');
const logoutButton = document.getElementById('logoutButton');
const adminLogoutButton = document.getElementById('adminLogoutButton');
const errorMessageElement = document.getElementById('error-message');

// Payment Modal DOM References
const paymentModal = document.getElementById('payment-modal');
const reportPaymentButton = document.getElementById('report-payment-button');
const cancelPaymentButton = document.getElementById('cancel-payment-button');
const paymentForm = document.getElementById('payment-form');
const paymentAmountInput = document.getElementById('payment-amount');
const paymentDateInput = document.getElementById('payment-date');
const paymentReceiptInput = document.getElementById('payment-receipt');
const paymentNotesInput = document.getElementById('payment-notes');

// Admin Panel DOM References
const conceptForm = document.getElementById('concept-form');
const conceptIdInput = document.getElementById('concept-id');
const conceptNameInput = document.getElementById('concept-name');
const conceptAmountInput = document.getElementById('concept-amount');
const conceptRecurringCheckbox = document.getElementById('concept-recurring');
const conceptRequestableCheckbox = document.getElementById('concept-requestable');
const conceptApprovalCheckbox = document.getElementById('concept-approval');
const recurringOptionsDiv = document.getElementById('recurring-options');
const conceptFrequencySelect = document.getElementById('concept-frequency');
const conceptsTableBody = document.getElementById('concepts-table-body');
const cancelEditButton = document.getElementById('cancel-edit-button');
const requestsTableBody = document.getElementById('requests-table-body');
const generateMonthlyFeesButton = document.getElementById('generate-monthly-fees-button');
const paymentsTableBody = document.getElementById('payments-table-body');

// --- Lógica Principal (Observador de Autenticación) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. Activa la sección principal del dashboard.
        window.activeSection('.dashboard');
        console.log("Usuario autenticado:", user.email);

        try {
            // 2. Obtenemos el token del usuario para leer los claims de forma segura.
            // El argumento 'true' fuerza la actualización del token para obtener los claims más recientes.
            const idTokenResult = await user.getIdTokenResult(true);
            console.log("Custom claims del usuario:", idTokenResult.claims);

            // 3. Verificamos si el claim 'admin' es true.
            if (idTokenResult.claims.admin === true) {
                console.log("Rol de admin verificado desde token. Mostrando panel de administración.");
                // document.getElementById('dashboard-container').classList.add('hidden');
                document.getElementById('admin-container').classList.remove('hidden');
                loadAdminData();
            } else {
                // 4. Si no es admin, mostramos el dashboard de residente.
                document.getElementById('dashboard-container').classList.remove('hidden');
                document.getElementById('admin-container').classList.add('hidden');
                loadDashboardData(user);
            }

            // 5. Verificamos si el perfil del usuario existe en Firestore y lo creamos si no.
            //    Esto es para datos de perfil (como propertyId), no para roles.
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.exists()) {
                console.log("Perfil no encontrado en Firestore, creando uno nuevo...");
                await createUserProfile(user);
            }

        } catch (error) {
            console.error("Error al verificar rol o cargar datos:", error);
            showToast("Error al cargar los datos de la sesión.", "error");
            // Si todo falla, mostramos el dashboard de residente como fallback.
            document.getElementById('dashboard-container').classList.remove('hidden');
            document.getElementById('admin-container').classList.add('hidden');
            loadDashboardData(user);
        }

    } else {
        // Si no hay usuario, volvemos a la pantalla de bienvenida.
        window.activeSection(".welcome");
        document.getElementById('dashboard-container').classList.remove('hidden');
        document.getElementById('admin-container').classList.add('hidden');
        clearDashboardData();
    }
});








        // --- Funciones de Notificaciones ---
        /**
         * @summary Muestra una notificación toast no bloqueante.
         * @param {string} message - El mensaje a mostrar.
         * @param {string} [type='info'] - El tipo de toast ('success' o 'error').
         */
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;

            container.appendChild(toast);

            setTimeout(() => {
                toast.remove();
            }, 5000);
        }

        /**
         * @summary Crea un botón de acción con clases y evento click predefinidos.
         * @param {string} text - El texto del botón.
         * @param {string} className - Las clases CSS del botón.
         * @param {function} onClick - La función a ejecutar cuando se hace click.
         * @returns {HTMLButtonElement} El elemento botón creado.
         */
        function createActionButton(text, className, onClick) {
            const button = document.createElement('button');
            button.textContent = text;
            button.className = `button ${className}`;
            button.onclick = onClick;
            return button;
        }

        // --- Funciones del Panel de Administración ---
        function loadAdminData() {
            document.getElementById('welcome-message').textContent = `Panel de Admin: ${auth.currentUser.displayName || auth.currentUser.email}`;
            conceptRecurringCheckbox.addEventListener('change', () => {
                recurringOptionsDiv.classList.toggle('hidden', !conceptRecurringCheckbox.checked);
            });
            conceptForm.addEventListener('submit', handleConceptFormSubmit);
            cancelEditButton.addEventListener('click', resetConceptForm);
            generateMonthlyFeesButton.addEventListener('click', generateMonthlyFees);

            // renderConcepts();
            // renderServiceRequests();
            // renderPaymentNotifications(); // Añadir esta llamada
        }

        function renderPaymentNotifications() {
            const q = query(collection(db, "paymentNotifications"), where("status", "==", "pending_verification"), orderBy("reportDate", "desc"));
            onSnapshot(q, (snapshot) => {
                paymentsTableBody.innerHTML = '';
                if (snapshot.empty) {
                    paymentsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 1rem;">No hay pagos por verificar.</td></tr>';
                    return;
                }
                snapshot.forEach(async (doc) => {
                    const notification = doc.data();
                    let propName = "Propiedad Desconocida";
                    try {
                        const propDoc = await getDoc(doc(db, "properties", notification.propertyId));
                        propName = propDoc.exists() ? propDoc.data().name : "Propiedad Desconocida";
                    } catch (error) {
                        console.error("Error obteniendo datos de la propiedad para notificación de pago:", error);
                        showToast("Error al cargar datos de propiedad para una notificación.", "error");
                    }
                    renderPaymentNotificationRow(doc.id, notification, propName);
                });
            });
        }

        function renderPaymentNotificationRow(notificationId, notification, propName) {
            const row = paymentsTableBody.insertRow();
            row.insertCell(0).textContent = notification.reportDate.toDate().toLocaleDateString('es-PA');
            row.insertCell(1).textContent = propName;
            const amountCell = row.insertCell(2);
            amountCell.className = 'text-right';
            amountCell.textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(notification.amount);

            const receiptCell = row.insertCell(3);
            if (notification.receiptUrl) {
                const link = document.createElement('a');
                link.href = notification.receiptUrl;
                link.target = '_blank';
                link.textContent = 'Ver Comprobante';
                link.className = 'text-blue-600 hover:underline';
                receiptCell.appendChild(link);
            }

            const actionsCell = row.insertCell(4);
            const approveButton = createActionButton('Aprobar', 'button-primary', () => approvePayment(notificationId));
            const rejectButton = createActionButton('Rechazar', 'button-accent', () => rejectPayment(notificationId));
            rejectButton.style.marginLeft = '8px'; // Mantener el estilo específico de margen

            actionsCell.appendChild(approveButton);
            actionsCell.appendChild(rejectButton);
        }

        /**
         * @summary Aprueba una notificación de pago, creando una transacción de crédito
         *          y actualizando el saldo de la propiedad en una transacción de Firestore.
         * @param {string} notificationId - El ID de la notificación de pago a aprobar.
         * @returns {Promise<void>}
         */
        async function approvePayment(notificationId) {
            if (!confirm("¿Aprobar este pago? Se creará un crédito en la cuenta del residente y se actualizará su saldo.")) return;

            try {
                await runTransaction(db, async (transaction) => {
                    const notificationRef = doc(db, 'paymentNotifications', notificationId);
                    const notificationDoc = await transaction.get(notificationRef);
                    if (!notificationDoc.exists()) throw new Error("La notificación no existe.");

                    const notificationData = notificationDoc.data();
                    const propertyRef = doc(db, "properties", notificationData.propertyId);
                    const propertyDoc = await transaction.get(propertyRef);
                    if (!propertyDoc.exists()) throw new Error("La propiedad no existe.");

                    const creditAmount = Math.abs(notificationData.amount);
                    const newBalance = propertyDoc.data().balance + creditAmount;

                    const newTransactionRef = doc(collection(db, 'transactions'));
                    transaction.set(newTransactionRef, {
                        propertyId: notificationData.propertyId,
                        amount: creditAmount,
                        type: 'PAYMENT',
                        description: `Pago reportado por residente`,
                        voucherType: 'Recibo de Pago',
                        voucherNumber: notificationId,
                        createdAt: serverTimestamp(),
                        effectiveDate: notificationData.paymentDate.toDate()
                    });

                    transaction.update(propertyRef, { balance: newBalance });
                    transaction.update(notificationRef, { status: 'verified' });
                });
                showToast("Pago aprobado y saldo actualizado.");
            } catch (error) {
                console.error("Error al aprobar el pago: ", error);
                showToast("Error al aprobar el pago.", "error");
            }
        }

        /**
         * @summary Rechaza una notificación de pago, actualizando su estado a 'rejected'.
         * @param {string} notificationId - El ID de la notificación de pago a rechazar.
         * @returns {Promise<void>}
         */
        async function rejectPayment(notificationId) {
            if (!confirm("¿Rechazar este reporte de pago?")) return;
            try {
                await updateDoc(doc(db, 'paymentNotifications', notificationId), { status: 'rejected' });
                showToast("Reporte de pago rechazado.");
            } catch (error) {
                console.error("Error al rechazar el pago: ", error);
                showToast("Error al rechazar el pago.", "error");
            }
        }

        /**
         * @summary Genera las cuotas mensuales recurrentes para todas las propiedades.
         *          Verifica si ya existe una transacción para el concepto recurrente en el mes actual
         *          antes de crear una nueva. Actualiza el balance de las propiedades en lote.
         * @returns {Promise<void>} Una promesa que se resuelve cuando el proceso ha terminado.
         */
        async function generateMonthlyFees() {
            const today = new Date();
            const monthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            if (!confirm(`¿Estás seguro de que quieres generar las cuotas recurrentes para ${monthYear}? Esta acción buscará propiedades que no tengan la cuota de este mes y la generará. No se puede deshacer.`)) return;

            showToast("Iniciando proceso...", "info");

            try {
                // 1. Obtener conceptos recurrentes mensuales
                const conceptsQuery = query(collection(db, "chargeConcepts"), where("isRecurring", "==", true), where("billingFrequency", "==", "monthly"));
                const recurringConcepts = await getDocs(conceptsQuery);
                if (recurringConcepts.empty) {
                    showToast("No se encontraron conceptos recurrentes.", "error");
                    return;
                }

                // 2. Obtener todas las propiedades
                const properties = await getDocs(collection(db, "properties"));
                if (properties.empty) {
                    showToast("No hay propiedades registradas.", "error");
                    return;
                }

                const batch = writeBatch(db);
                let chargesGenerated = 0;

                // Usamos un bucle for...of para poder usar await adentro
                for (const propDoc of properties.docs) {
                    const propertyData = propDoc.data();
                    const propertyRef = propDoc.ref;
                    let newBalance = propertyData.balance;

                    for (const conceptDoc of recurringConcepts.docs) {
                        const conceptData = conceptDoc.data();
                        const description = `${conceptData.name} - ${monthYear}`;

                        // 3. Verificar si ya existe una transacción para este concepto y propiedad en este mes
                        const transactionCheckQuery = query(collection(db, "transactions"), 
                            where("propertyId", "==", propDoc.id),
                            where("description", "==", description)
                        );
                        const existingTransactions = await getDocs(transactionCheckQuery);

                        if (existingTransactions.empty) {
                            // 4. Si no existe, la añadimos al batch
                            const chargeAmount = -Math.abs(conceptData.defaultAmount);
                            newBalance += chargeAmount;

                            const newTransactionRef = doc(collection(db, 'transactions'));
                            batch.set(newTransactionRef, {
                                propertyId: propDoc.id,
                                amount: chargeAmount,
                                type: 'FEE',
                                description: description,
                                voucherType: 'Cargo Automático',
                                voucherNumber: `FEE-${monthYear}`,
                                createdAt: serverTimestamp(),
                                effectiveDate: new Date()
                            });
                            chargesGenerated++;
                        }
                    }
                    // Actualizar el balance de la propiedad en el batch
                    batch.update(propertyRef, { balance: newBalance });
                }

                // 5. Ejecutar todas las operaciones en lote
                await batch.commit();
                showToast(`Proceso completado. Se generaron ${chargesGenerated} nuevos cargos.`);

            } catch (error) {
                console.error("Error generando cuotas mensuales: ", error);
                showToast("Error crítico durante la generación de cuotas.", "error");
            }
        }

        /**
         * @summary Renderiza la tabla de conceptos de cargo en el panel de administración.
         *          Escucha cambios en tiempo real en la colección 'chargeConcepts'.
         */
        function renderConcepts() {
            const q = query(collection(db, "chargeConcepts"), orderBy("name"));
            onSnapshot(q, (querySnapshot) => {
                conceptsTableBody.innerHTML = '';
                querySnapshot.forEach(renderConceptRow);
            });
        }

        /**
         * @summary Renderiza la tabla de solicitudes de servicio pendientes en el panel de administración.
         *          Escucha cambios en tiempo real en la colección 'serviceRequests'.
         */
        function renderServiceRequests() {
            const q = query(collection(db, "serviceRequests"), where("status", "==", "pending_approval"), orderBy("requestDate", "desc"));
            onSnapshot(q, (snapshot) => {
                requestsTableBody.innerHTML = '';
                snapshot.forEach(async (doc) => {
                    const request = doc.data();
                    let propName = "Propiedad Desconocida";
                    let conceptName = "Concepto Desconocido";
                    let conceptAmount = 0;
                    try {
                        const propDoc = await getDoc(doc(db, "properties", request.propertyId));
                        propName = propDoc.exists() ? propDoc.data().name : "Propiedad Desconocida";
                        const conceptDoc = await getDoc(doc(db, "chargeConcepts", request.chargeConceptId));
                        conceptName = conceptDoc.exists() ? conceptDoc.data().name : "Concepto Desconocido";
                        conceptAmount = conceptDoc.exists() ? conceptDoc.data().defaultAmount : 0;
                    } catch (error) {
                        console.error("Error obteniendo datos de propiedad/concepto para solicitud de servicio:", error);
                        showToast("Error al cargar datos para una solicitud de servicio.", "error");
                    }
                    renderRequestRow(doc.id, request, propName, conceptName, conceptAmount);
                });
            });
        }

        /**
         * @summary Renderiza una fila en la tabla de solicitudes de servicio pendientes.
         * @param {string} requestId - El ID del documento de la solicitud de servicio.
         * @param {object} request - Los datos de la solicitud de servicio.
         * @param {string} propName - El nombre de la propiedad asociada.
         * @param {string} conceptName - El nombre del concepto de cargo asociado.
         * @param {number} conceptAmount - El monto del concepto de cargo asociado.
         */
        function renderRequestRow(requestId, request, propName, conceptName, conceptAmount) {
            const row = requestsTableBody.insertRow();
            row.insertCell(0).textContent = request.requestDate.toDate().toLocaleDateString('es-PA');
            row.insertCell(1).textContent = propName;
            row.insertCell(2).textContent = conceptName;
            row.insertCell(3).textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(conceptAmount);
            const actionsCell = row.insertCell(4);
            const approveButton = createActionButton('Aprobar', 'button-primary', () => approveRequest(requestId));
            const rejectButton = createActionButton('Rechazar', 'button-accent', () => rejectRequest(requestId));
            rejectButton.style.marginLeft = '8px'; // Mantener el estilo específico de margen
            actionsCell.appendChild(approveButton);
            actionsCell.appendChild(rejectButton);
        }

        /**
         * @summary Aprueba una solicitud de servicio, creando un cargo en la propiedad
         *          y actualizando el saldo y el estado de la solicitud en una transacción de Firestore.
         * @param {string} requestId - El ID de la solicitud de servicio a aprobar.
         * @returns {Promise<void>}
         */
        async function approveRequest(requestId) {
            if (!confirm("¿Estás seguro de que quieres APROBAR esta solicitud? Se creará un cargo y se actualizará el saldo de la propiedad.")) return;

            try {
                await runTransaction(db, async (transaction) => {
                    const requestRef = doc(db, 'serviceRequests', requestId);
                    const requestDoc = await transaction.get(requestRef);
                    if (!requestDoc.exists()) throw new Error("La solicitud no existe o ya fue procesada.");

                    const requestData = requestDoc.data();
                    const conceptRef = doc(db, "chargeConcepts", requestData.chargeConceptId);
                    const propertyRef = doc(db, "properties", requestData.propertyId);

                    const conceptDoc = await transaction.get(conceptRef);
                    const propertyDoc = await transaction.get(propertyRef);

                    if (!conceptDoc.exists()) throw new Error("El concepto de cargo asociado no existe.");
                    if (!propertyDoc.exists()) throw new Error("La propiedad asociada no existe.");

                    const chargeAmount = -Math.abs(conceptDoc.data().defaultAmount);
                    const newBalance = propertyDoc.data().balance + chargeAmount;

                    // 1. Crear la nueva transacción financiera
                    const newTransactionRef = doc(collection(db, 'transactions'));
                    transaction.set(newTransactionRef, {
                        propertyId: requestData.propertyId,
                        amount: chargeAmount,
                        type: 'FEE',
                        description: `Servicio: ${conceptDoc.data().name}`,
                        voucherType: 'Solicitud de Servicio',
                        voucherNumber: requestId,
                        serviceRequestId: requestId,
                        createdAt: serverTimestamp(),
                        effectiveDate: new Date()
                    });

                    // 2. Actualizar el saldo de la propiedad
                    transaction.update(propertyRef, { balance: newBalance });

                    // 3. Actualizar el estado de la solicitud
                    transaction.update(requestRef, { status: 'approved' });
                });
                console.log("Transacción completada con éxito!");
                showToast("Solicitud aprobada y cargo generado.");
            } catch (error) {
                console.error("Error en la transacción de aprobación: ", error);
                showToast("Error al aprobar la solicitud.", "error");
            }
        }

        /**
         * @summary Rechaza una solicitud de servicio, actualizando su estado a 'rejected'.
         * @param {string} requestId - El ID de la solicitud de servicio a rechazar.
         * @returns {Promise<void>}
         */
        async function rejectRequest(requestId) {
            if (!confirm("¿Estás seguro de que quieres RECHAZAR esta solicitud?")) return;
            try {
                await updateDoc(doc(db, 'serviceRequests', requestId), { status: 'rejected' });
                showToast("Solicitud rechazada.");
            } catch (error) {
                console.error("Error al rechazar la solicitud: ", error);
                showToast("Error al rechazar la solicitud.", "error");
            }
        }

        /**
         * @summary Maneja el envío del formulario de conceptos de cargo, creando o actualizando un concepto.
         * @param {Event} e - El evento de envío del formulario.
         * @returns {Promise<void>}
         */
        async function handleConceptFormSubmit(e) {
            e.preventDefault();
            const conceptId = conceptIdInput.value;
            const conceptData = {
                name: conceptNameInput.value,
                defaultAmount: parseFloat(conceptAmountInput.value),
                isRecurring: conceptRecurringCheckbox.checked,
                billingFrequency: conceptRecurringCheckbox.checked ? conceptFrequencySelect.value : null,
                isRequestableByResident: conceptRequestableCheckbox.checked,
                requiresApproval: conceptApprovalCheckbox.checked,
            };
            try {
                if (conceptId) {
                    await updateDoc(doc(db, 'chargeConcepts', conceptId), conceptData);
                    showToast("Concepto actualizado con éxito.");
                } else {
                    await addDoc(collection(db, 'chargeConcepts'), conceptData);
                    showToast("Concepto guardado con éxito.");
                }
                resetConceptForm();
            } catch (error) {
                console.error("Error guardando el concepto: ", error);
                showToast("Error al guardar el concepto.", "error");
            }
        }

        /**
         * @summary Renderiza una fila en la tabla de conceptos de cargo.
         * @param {object} doc - El documento de Firestore que contiene los datos del concepto.
         */
        function renderConceptRow(doc) {
            const concept = doc.data();
            const row = conceptsTableBody.insertRow();
            row.setAttribute('data-id', doc.id);
            row.insertCell(0).textContent = concept.name;
            row.insertCell(1).textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(concept.defaultAmount);
            let typeLabel = concept.isRecurring ? `Recurrente (${concept.billingFrequency})` : 'Único';
            if (concept.isRequestableByResident) { typeLabel += ' / Solicitable'; }
            row.insertCell(2).textContent = typeLabel;
            const actionsCell = row.insertCell(3);
            const editButton = createActionButton('Editar', 'button-secondary', () => populateFormForEdit(doc));
            const deleteButton = createActionButton('Eliminar', 'button-accent', () => deleteConcept(doc.id, concept.name));
            deleteButton.style.marginLeft = '8px';
            actionsCell.appendChild(editButton);
            actionsCell.appendChild(deleteButton);
        }
        
        /**
         * @summary Rellena el formulario de conceptos de cargo con los datos de un concepto existente para su edición.
         * @param {object} doc - El documento de Firestore que contiene los datos del concepto a editar.
         */
        function populateFormForEdit(doc) {
            const concept = doc.data();
            conceptIdInput.value = doc.id;
            conceptNameInput.value = concept.name;
            conceptAmountInput.value = concept.defaultAmount;
            conceptRecurringCheckbox.checked = concept.isRecurring;
            conceptRequestableCheckbox.checked = concept.isRequestableByResident;
            conceptApprovalCheckbox.checked = concept.requiresApproval;
            recurringOptionsDiv.classList.toggle('hidden', !concept.isRecurring);
            if (concept.isRecurring) {
                conceptFrequencySelect.value = concept.billingFrequency;
            }
            cancelEditButton.classList.remove('hidden');
            conceptForm.scrollIntoView({ behavior: 'smooth' });
        }

        /**
         * @summary Elimina un concepto de cargo de Firestore.
         * @param {string} id - El ID del documento del concepto a eliminar.
         * @param {string} name - El nombre del concepto (para el mensaje de confirmación).
         * @returns {Promise<void>}
         */
        async function deleteConcept(id, name) {
            if (confirm(`¿Estás seguro de que quieres eliminar el concepto "${name}"?`)) {
                try {
                    await deleteDoc(doc(db, 'chargeConcepts', id));
                    showToast("Concepto eliminado.");
                } catch (error) {
                    console.error("Error eliminando el concepto: ", error);
                    showToast("Error al eliminar el concepto.", "error");
                }
            }
        }

        /**
         * @summary Resetea el formulario de conceptos de cargo y oculta elementos relacionados con la edición.
         */
        function resetConceptForm() {
            conceptForm.reset();
            conceptIdInput.value = '';
            recurringOptionsDiv.classList.add('hidden');
            cancelEditButton.classList.add('hidden');
        }

        // --- Funciones del Dashboard de Residente ---
        /**
         * @summary Carga y renderiza los datos del dashboard del residente.
         *          Incluye la información de la propiedad, el saldo, el catálogo de servicios
         *          y el historial de transacciones.
         * @param {object} user - El objeto de usuario autenticado de Firebase.
         * @returns {Promise<void>}
         */
        async function loadDashboardData(user) {
            document.getElementById('welcome-message').textContent = `Bienvenido, ${user.displayName || user.email}`;
            console.log(user);
            // Listeners para el modal de pago
            reportPaymentButton.addEventListener('click', () => paymentModal.classList.remove('hidden'));
            cancelPaymentButton.addEventListener('click', () => paymentModal.classList.add('hidden'));
            paymentForm.addEventListener('submit', (e) => handlePaymentFormSubmit(e, user));

            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);

                if (!userDoc.exists() || !userDoc.data().propertyId || userDoc.data().propertyId === 'PENDING_ASSIGNMENT') {
                    document.getElementById('property-name').textContent = 'Propiedad no asignada';
                    document.getElementById('property-balance').textContent = 'N/A';
                    reportPaymentButton.classList.add('hidden'); // Ocultar si no hay propiedad
                    return;
                }
                reportPaymentButton.classList.remove('hidden');
                const propertyId = userDoc.data().propertyId;
                renderServiceCatalog(propertyId);

                // Escuchar cambios en la propiedad en tiempo real para mantener el saldo actualizado
                onSnapshot(doc(db, "properties", propertyId), (propDoc) => {
                    if (propDoc.exists()) {
                        const propertyData = propDoc.data();
                        document.getElementById('property-name').textContent = propertyData.name || 'Mi Propiedad';
                        const balance = propertyData.balance || 0;
                        const balanceElement = document.getElementById('property-balance');
                        balanceElement.textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(balance);
                        balanceElement.className = 'dashboard-summary-balance ' + (balance >= 0 ? 'text-kaitoke-green-600' : 'text-solid-pink-600');
                        
                        renderTransactionsTable(propertyId, balance);
                    }
                });

            } catch (error) {
                console.error("Error cargando datos del dashboard:", error);
                document.getElementById('property-name').textContent = 'Error al cargar datos.';
            }
        }

        /**
         * @summary Maneja el envío del formulario de reporte de pago, subiendo el comprobante (si existe)
         *          y creando una notificación de pago en Firestore.
         * @param {Event} e - El evento de envío del formulario.
         * @param {object} user - El objeto de usuario autenticado de Firebase.
         * @returns {Promise<void>}
         */
        async function handlePaymentFormSubmit(e, user) {
            e.preventDefault();
            const submitButton = e.target.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Enviando...';

            const amount = parseFloat(paymentAmountInput.value);
            const paymentDate = new Date(paymentDateInput.value);
            const notes = paymentNotesInput.value;
            const receiptFile = paymentReceiptInput.files[0];
            let receiptUrl = null;

            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const propertyId = userDoc.data().propertyId;

                // 1. Subir el comprobante si existe
                if (receiptFile) {
                    const storage = getStorage(app);
                    const filePath = `receipts/${propertyId}/${Date.now()}-${receiptFile.name}`;
                    const storageRef = ref(storage, filePath);
                    const uploadResult = await uploadBytes(storageRef, receiptFile);
                    receiptUrl = await getDownloadURL(uploadResult.ref);
                }

                // 2. Crear la notificación de pago
                await addDoc(collection(db, 'paymentNotifications'), {
                    propertyId: propertyId,
                    amount: amount,
                    paymentDate: paymentDate,
                    reportDate: serverTimestamp(),
                    status: 'pending_verification',
                    receiptUrl: receiptUrl,
                    notes: notes,
                    reportedBy: user.uid
                });

                showToast("Reporte de pago enviado con éxito.");
                paymentForm.reset();
                paymentModal.classList.add('hidden');

            } catch (error) {
                console.error("Error al reportar el pago: ", error);
                showToast("Hubo un error al enviar el reporte.", "error");
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Enviar Reporte';
            }
        }



        /**
         * @summary Renderiza la tabla de transacciones para una propiedad específica.
         *          Calcula el saldo corriente para cada transacción y muestra un spinner de carga.
         * @param {string} propertyId - El ID de la propiedad cuyas transacciones se van a mostrar.
         * @param {number} currentBalance - El saldo actual de la propiedad.
         * @returns {Promise<void>}
         */
        async function renderTransactionsTable(propertyId, currentBalance) {
            const transactionsTableBody = document.getElementById('transactions-table-body');
            transactionsTableBody.innerHTML = '<tr><td colspan="7"><div class="spinner-container"><div class="spinner"></div></div></td></tr>';

            const q = query(collection(db, "transactions"), where("propertyId", "==", propertyId), orderBy("createdAt", "asc"));
            const querySnapshot = await getDocs(q);
            
            transactionsTableBody.innerHTML = ''; // Limpiar spinner
            if (querySnapshot.empty) {
                transactionsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 1rem;">No hay transacciones registradas.</td></tr>';
                return;
            }

            const transactions = querySnapshot.docs.map(doc => doc.data());
            const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            let runningBalance = currentBalance - totalAmount;

            const transactionsWithBalance = [];
            for (const tx of transactions) {
                runningBalance += tx.amount;
                transactionsWithBalance.push({ ...tx, runningBalance: runningBalance });
            }

            // Invertir el array para mostrar las más recientes primero, pero con los saldos correctos
            transactionsWithBalance.reverse().forEach(tx => {
                const row = transactionsTableBody.insertRow();
                row.className = 'border-b border-gray-200';

                row.insertCell(0).textContent = tx.createdAt.toDate().toLocaleDateString('es-PA');
                row.insertCell(1).textContent = tx.description;
                row.insertCell(2).textContent = tx.voucherType || 'N/A';
                row.insertCell(3).textContent = tx.voucherNumber || 'N/A';

                const debitCell = row.insertCell(4);
                const creditCell = row.insertCell(5);
                debitCell.className = 'px-5 py-5 text-sm text-right font-semibold text-solid-pink-600';
                creditCell.className = 'px-5 py-5 text-sm text-right font-semibold text-kaitoke-green-600';

                if (tx.amount < 0) {
                    debitCell.textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(tx.amount);
                    creditCell.textContent = '';
                } else {
                    debitCell.textContent = '';
                    creditCell.textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(tx.amount);
                }
                
                const balanceCell = row.insertCell(6);
                balanceCell.className = 'px-5 py-5 text-sm text-right font-bold';
                balanceCell.textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(tx.runningBalance);
            });
        }

        /**
         * @summary Renderiza el catálogo de servicios solicitables por el residente.
         *          Muestra un spinner de carga mientras se obtienen los datos.
         * @param {string} propertyId - El ID de la propiedad del residente.
         * @returns {Promise<void>}
         */
        async function renderServiceCatalog(propertyId) {
            const container = document.getElementById('services-list-container');
            container.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';

            const q = query(collection(db, "chargeConcepts"), where("isRequestableByResident", "==", true));
            const querySnapshot = await getDocs(q);

            container.innerHTML = ''; // Limpiar spinner
            if (querySnapshot.empty) {
                container.innerHTML = '<p class="text-sm text-gray-500">No hay servicios adicionales disponibles para solicitar en este momento.</p>';
                return;
            }

            querySnapshot.forEach(doc => {
                const concept = doc.data();
                const conceptId = doc.id;

                const serviceItem = document.createElement('div');
                serviceItem.className = 'service-item';

                const details = document.createElement('div');
                details.className = 'service-item-details';
                
                const name = document.createElement('span');
                name.className = 'service-item-name';
                name.textContent = concept.name;

                const amount = document.createElement('span');
                amount.className = 'service-item-amount';
                amount.textContent = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(concept.defaultAmount);

                details.appendChild(name);
                details.appendChild(amount);

                const requestButton = document.createElement('button');
                requestButton.textContent = 'Solicitar';
                requestButton.className = 'button button-primary';
                requestButton.onclick = async () => {
                    if (confirm(`¿Confirmas que deseas solicitar el servicio "${concept.name}"?`)) {
                        try {
                            await addDoc(collection(db, 'serviceRequests'), {
                                propertyId: propertyId,
                                chargeConceptId: conceptId,
                                requestDate: serverTimestamp(),
                                status: 'pending_approval'
                            });
                            showToast('¡Solicitud enviada con éxito!');
                        } catch (error) {
                            console.error("Error al enviar la solicitud: ", error);
                            showToast('Hubo un error al enviar tu solicitud.', 'error');
                        }
                    }
                };

                serviceItem.appendChild(details);
                serviceItem.appendChild(requestButton);
                container.appendChild(serviceItem);
            });
        }

        /**
         * @summary Limpia los datos mostrados en el dashboard del residente.
         */
        function clearDashboardData() {
            document.getElementById('welcome-message').textContent = '';
            document.getElementById('property-name').textContent = '';
            document.getElementById('property-balance').textContent = '';
            document.getElementById('transactions-table-body').innerHTML = '';
            document.getElementById('services-list-container').innerHTML = '';
        }

        // Maneja el evento de clic para los botones de cerrar sesión.
        logoutButton.addEventListener('click', () => signOut(auth).catch(error => console.error('Error al cerrar sesión:', error)));
        adminLogoutButton.addEventListener('click', () => signOut(auth).catch(error => console.error('Error al cerrar sesión:', error)));

        // --- Funciones de Autenticación ---
        /**
         * @summary Crea un nuevo perfil de usuario en Firestore para un usuario recién autenticado.
         * @param {object} user - El objeto de usuario autenticado de Firebase.
         * @returns {Promise<void>}
         */
        async function createUserProfile(user) {
            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                role: 'resident', // Por defecto, todos los nuevos usuarios son residentes
                propertyId: 'PENDING_ASSIGNMENT',
                createdAt: serverTimestamp()
            });
        }

        /**
         * @summary Maneja el proceso de registro de un nuevo usuario con correo electrónico y contraseña.
         * @returns {Promise<void>}
         */
        async function handleRegister() {
            const email = emailInput.value;
            const password = passwordInput.value;
            errorMessageElement.textContent = '';
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await createUserProfile(userCredential.user);
                showToast('¡Registro exitoso! Por favor, inicia sesión.');
                // Limpiar campos después del registro
                emailInput.value = '';
                passwordInput.value = '';
            } catch (error) {
                errorMessageElement.textContent = `Error: ${error.message}`;
            }
        }

        registerButton.addEventListener('click', handleRegister);

        /**
         * @summary Maneja el proceso de inicio de sesión de un usuario con correo electrónico y contraseña.
         * @returns {Promise<void>}
         */
        async function handleLogin() {
            const email = emailInput.value;
            const password = passwordInput.value;
            errorMessageElement.textContent = '';
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                errorMessageElement.textContent = `Error: ${error.message}`;
            }
        }

        loginButton.addEventListener('click', handleLogin);

        /**
         * @summary Maneja el flujo para restablecer la contraseña de un usuario.
         */
        async function handleForgotPassword() {
            const email = emailInput.value;
            if (!email) {
                errorMessageElement.textContent = 'Por favor, ingresa tu correo electrónico para restablecer la contraseña.';
                return;
            }
            errorMessageElement.textContent = '';

            try {
                await sendPasswordResetEmail(auth, email);
                showToast('Se ha enviado un correo para restablecer tu contraseña.', 'success');
            } catch (error) {
                errorMessageElement.textContent = `Error: ${error.message}`;
            }
        }

        // --- Event Listeners Adicionales ---
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault(); // Prevenir que el enlace navegue
                handleForgotPassword();
            });
        }

        /**
         * @summary Maneja el flujo de inicio de sesión con el proveedor de Google de Firebase.
         */
        async function handleGoogleSignIn() {
            const provider = new GoogleAuthProvider();
            errorMessageElement.textContent = '';

            try {
                const result = await signInWithPopup(auth, provider);
                const isNewUser = getAdditionalUserInfo(result).isNewUser;

                if (isNewUser) {
                    console.log("Nuevo usuario de Google, creando perfil...");
                    await createUserProfile(result.user);
                }
                // onAuthStateChanged se encargará de redirigir al dashboard.
            } catch (error) {
                console.error("Error al iniciar sesión con Google:", error);
                errorMessageElement.textContent = `Error: ${error.message}`;
            }
        }

        // --- Event Listener para el botón de Google ---
        const googleSignInButton = document.getElementById('googleSignInButton');
        if (googleSignInButton) {
            googleSignInButton.addEventListener('click', handleGoogleSignIn);
        }        // La función handleGoogleLogin y su addEventListener ya no son necesarios
document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const heroWelcomeSection = document.getElementById('hero-welcome');
    const authContainer = document.getElementById('auth-container');

    if (startButton && heroWelcomeSection && authContainer) {
        startButton.addEventListener('click', () => {
            heroWelcomeSection.style.display = 'none';
            authContainer.style.display = 'flex'; // O 'block' dependiendo de cómo esté diseñado el auth-container
        });
    }

    // Asegurarse de que la sección de autenticación esté oculta al cargar si la bienvenida está visible
    if (heroWelcomeSection && authContainer && heroWelcomeSection.style.display !== 'none') {
        authContainer.style.display = 'none';
    }
});

// Resto del código JavaScript existente...
        // ya que GIS renderiza su propio botón y llama a handleCredentialResponse.