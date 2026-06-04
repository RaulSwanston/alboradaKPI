/**
 * @file configManager.controller.js
 * @description Controlador para la gestión de la configuración dinámica de la app.
 * Maneja la lógica de la matriz de permisos, el ordenamiento de la cascada de módulos
 * y la persistencia híbrida (Local + Firebase).
 */

import { appConfig } from '../../core/appConfig.js';
import { t } from '../../core/i18n.js';
import { storage, ref, uploadBytes, getDownloadURL, db, doc, setDoc, collection, query, getDocs, where, updateDoc, limit, startAfter, orderBy } from '../../core/firebase.js';

export default async function configManagerController(contexto) {
    console.log("Iniciando configManager con contexto:", contexto);

    let selectedFile = null; 
    let lastUserDoc = null; // Para paginación Firestore
    const USERS_PER_PAGE = 5;
    let currentRoleFilter = 'all';
    let currentSearchTerm = '';
    let pendingUserUpdates = {}; // Almacena { uid: newRole } para guardado global

    // --- REFERENCIAS AL DOM ---
    const languageSelect = document.getElementById('config-language');
    const appNameInput = document.getElementById('config-app-name');
    const matrixContainer = document.getElementById('roles-matrix-container');
    const viewSelector = document.getElementById('config-view-selector');
    const cascadeList = document.getElementById('draggable-modules-list');
    const saveBtn = document.getElementById('saveConfigGlobal');
    const resetBtn = document.getElementById('resetConfigGlobal');

    // Referencias para Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Referencias para el Logo
    const dropZone = document.getElementById('logo-drop-zone');
    const logoFileInput = document.getElementById('config-logo-file');
    const logoUrlInput = document.getElementById('config-logo-url');
    const logoPreview = document.getElementById('config-logo-preview');
    const btnUploadLogo = document.getElementById('btn-upload-logo');

    // --- ESTADO LOCAL DE CONFIGURACIÓN ---
    let localConfig = JSON.parse(JSON.stringify(contexto.data.appConfig || appConfig));

    // --- LÓGICA DE PESTAÑAS (TABS) ---
    const initTabs = () => {
        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const targetTab = btn.getAttribute('data-tab');
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                tabPanes.forEach(pane => {
                    pane.classList.toggle('active', pane.id === targetTab);
                });
            };
        });
    };

    // --- LÓGICA DEL LOGO ---
    const updateLogoState = (hasLogo) => {
        if (dropZone) dropZone.classList.toggle('has-logo', !!hasLogo);
    };

    const handleLogoFile = (file) => {
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecciona un archivo de imagen válido.');
            return;
        }
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Image = e.target.result;
            if (logoPreview) {
                logoPreview.src = base64Image;
                updateLogoState(true);
            }
            if (logoUrlInput) logoUrlInput.value = `LOCAL: ${file.name}`;
            localConfig.branding.logoUrl = base64Image;
        };
        reader.readAsDataURL(file);
    };

    const uploadLogoToFirebase = async () => {
        if (!selectedFile) return null;
        try {
            const storageRef = ref(storage, `config/branding/logo_${Date.now()}`);
            const snapshot = await uploadBytes(storageRef, selectedFile);
            return await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("❌ Error al subir logo:", error);
            return null;
        }
    };

    const initLogoEvents = () => {
        if (!dropZone || !logoFileInput || !btnUploadLogo) return;
        btnUploadLogo.onclick = () => logoFileInput.click();
        if (logoPreview) logoPreview.parentElement.onclick = () => logoFileInput.click();
        logoFileInput.onchange = (e) => { if (e.target.files.length > 0) handleLogoFile(e.target.files[0]); };
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) handleLogoFile(e.dataTransfer.files[0]);
        });
        if (logoUrlInput) {
            logoUrlInput.onchange = (e) => {
                if (e.target.value && !e.target.value.startsWith('LOCAL:')) {
                    logoPreview.src = e.target.value;
                    localConfig.branding.logoUrl = e.target.value;
                    updateLogoState(true);
                } else if (!e.target.value) {
                    localConfig.branding.logoUrl = '';
                    updateLogoState(false);
                }
            };
        }
    };

    // --- LÓGICA GENERAL ---
    const initGeneralSettings = () => {
        const { systemDefaults, branding } = localConfig;
        if (languageSelect) languageSelect.value = systemDefaults.language;
        if (appNameInput) appNameInput.value = branding.appName;
        if (logoUrlInput) logoUrlInput.value = branding.logoUrl;
        if (logoPreview) {
            logoPreview.src = branding.logoUrl || '/src/img/alborada.svg';
            updateLogoState(!!branding.logoUrl);
        }
        if (appNameInput) appNameInput.oninput = (e) => localConfig.branding.appName = e.target.value;
        if (languageSelect) languageSelect.onchange = (e) => localConfig.systemDefaults.language = e.target.value;
    };

    // --- MATRIZ DE PERMISOS ---
    const renderPermissionsMatrix = () => {
        if (!matrixContainer) return;
        const { roleList, roles } = localConfig.accessControl;
        const { moduleRegistry } = localConfig;
        
        let html = `<table class="matrix-table">
            <thead>
                <tr>
                    <th>${t('configManager.roles.moduleColumn')}</th>
                    ${roleList.map(role => `
                        <th>
                            <div class="role-header-content">
                                <span>${role.label}</span>
                                ${role.isSystem ? `<span class="role-badge-system">SISTEMA</span>` : `
                                    <button class="btn-delete-role" data-id="${role.id}" title="Eliminar Rol">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                `}
                            </div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>`;

        Object.keys(moduleRegistry).forEach(moduleKey => {
            const moduleData = moduleRegistry[moduleKey];
            html += `<tr class="module-row" data-module="${moduleKey}">
                <td><span class="expand-icon">▶</span> <strong>${moduleKey}</strong></td>
                ${roleList.map(role => {
                    const hasFullAccess = roles[role.id]?.allowedModules.includes(moduleKey) || roles[role.id]?.allowedModules.includes('*');
                    return `<td><input type="checkbox" class="mod-access" data-role="${role.id}" data-module="${moduleKey}" ${hasFullAccess ? 'checked' : ''}></td>`;
                }).join('')}
            </tr>`;

            moduleData.capabilities.forEach(cap => {
                html += `<tr class="capability-row" data-parent="${moduleKey}">
                    <td class="capability-name">${t(cap.labelKey)}</td>
                    ${roleList.map(role => {
                        const fullCapKey = `${moduleKey}.${cap.id}`;
                        const hasCap = roles[role.id]?.capabilities.includes(fullCapKey) || roles[role.id]?.capabilities.includes('*');
                        return `<td><input type="checkbox" class="cap-access" data-role="${role.id}" data-cap="${fullCapKey}" ${hasCap ? 'checked' : ''}></td>`;
                    }).join('')}
                </tr>`;
            });
        });
        html += `</tbody></table>`;
        matrixContainer.innerHTML = html;

        matrixContainer.querySelectorAll('.module-row').forEach(row => {
            row.onclick = (e) => {
                if (e.target.type === 'checkbox') return;
                row.classList.toggle('expanded');
                matrixContainer.querySelectorAll(`.capability-row[data-parent="${row.dataset.module}"]`).forEach(c => c.classList.toggle('show'));
            };
        });

        matrixContainer.querySelectorAll('.mod-access').forEach(cb => {
            cb.onchange = (e) => {
                const { role, module } = e.target.dataset;
                const roleData = localConfig.accessControl.roles[role];
                if (e.target.checked) { if (!roleData.allowedModules.includes(module)) roleData.allowedModules.push(module); }
                else { roleData.allowedModules = roleData.allowedModules.filter(m => m !== module); }
            };
        });

        matrixContainer.querySelectorAll('.cap-access').forEach(cb => {
            cb.onchange = (e) => {
                const { role, cap } = e.target.dataset;
                const roleData = localConfig.accessControl.roles[role];
                if (e.target.checked) { if (!roleData.capabilities.includes(cap)) roleData.capabilities.push(cap); }
                else { roleData.capabilities = roleData.capabilities.filter(c => c !== cap); }
            };
        });

        matrixContainer.querySelectorAll('.btn-delete-role').forEach(btn => {
            btn.onclick = () => {
                const roleId = btn.dataset.id;
                if (confirm(`¿Eliminar rol "${roleId}"?`)) {
                    localConfig.accessControl.roleList = localConfig.accessControl.roleList.filter(r => r.id !== roleId);
                    delete localConfig.accessControl.roles[roleId];
                    renderPermissionsMatrix();
                }
            };
        });
    };

    const initRoleActions = () => {
        const addBtn = document.getElementById('add-role');
        if (addBtn) addBtn.onclick = () => {
            const name = prompt("Nombre del nuevo rol:");
            if (!name) return;
            const id = name.toLowerCase().trim().replace(/\s+/g, '_');
            if (localConfig.accessControl.roles[id]) return alert("Ya existe.");
            localConfig.accessControl.roleList.push({ id, label: name, isSystem: false });
            localConfig.accessControl.roles[id] = { allowedModules: [], capabilities: [] };
            renderPermissionsMatrix();
        };
    };

    // --- GESTIÓN DE USUARIOS (Paginación y Filtros) ---
    const initUserManagement = () => {
        const searchInput = document.getElementById('user-search-input');
        const roleFilter = document.getElementById('user-role-filter');
        const btnLoadMore = document.getElementById('btn-load-more-users');
        const resultsContainer = document.getElementById('user-list-results');

        if (!searchInput || !roleFilter || !btnLoadMore || !resultsContainer) return;

        const { roleList } = localConfig.accessControl;
        roleFilter.innerHTML = `<option value="all">Todos los Roles</option>` + 
            roleList.map(r => `<option value="${r.id}">${r.label}</option>`).join('');

        let debounceTimer;
        searchInput.oninput = (e) => {
            clearTimeout(debounceTimer);
            currentSearchTerm = e.target.value.toLowerCase().trim();
            debounceTimer = setTimeout(() => {
                lastUserDoc = null;
                resultsContainer.innerHTML = '';
                loadUsers();
            }, 500);
        };

        roleFilter.onchange = (e) => {
            currentRoleFilter = e.target.value;
            lastUserDoc = null;
            resultsContainer.innerHTML = '';
            loadUsers();
        };

        btnLoadMore.onclick = () => loadUsers(true);

        loadUsers();
    };

    const loadUsers = async (isLoadMore = false) => {
        const resultsContainer = document.getElementById('user-list-results');
        const btnLoadMore = document.getElementById('btn-load-more-users');
        
        if (!isLoadMore) resultsContainer.innerHTML = `<p class="config-empty-state">${t('configManager.roles.loading')}</p>`;
        if (btnLoadMore) btnLoadMore.classList.add('hidden');

        try {
            const usersRef = collection(db, "users");
            const constraints = [orderBy("email"), limit(USERS_PER_PAGE)];
            if (currentRoleFilter !== 'all') constraints.unshift(where("role", "==", currentRoleFilter));
            if (lastUserDoc) constraints.push(startAfter(lastUserDoc));

            const snapshot = await getDocs(query(usersRef, ...constraints));
            
            if (!isLoadMore && snapshot.empty) {
                resultsContainer.innerHTML = `<p class="config-empty-state">${t('configManager.roles.noUsersFound')}</p>`;
                return;
            }

            if (!isLoadMore) resultsContainer.innerHTML = '';

            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (currentSearchTerm) {
                    const matches = (data.displayName || '').toLowerCase().includes(currentSearchTerm) || 
                                  (data.email || '').toLowerCase().includes(currentSearchTerm);
                    if (matches) users.push({ id: doc.id, ...data });
                } else {
                    users.push({ id: doc.id, ...data });
                }
            });

            if (snapshot.docs.length > 0) {
                lastUserDoc = snapshot.docs[snapshot.docs.length - 1];
            }
            
            renderUserResults(users, isLoadMore);

            if (snapshot.size === USERS_PER_PAGE) {
                btnLoadMore.classList.remove('hidden');
            }

        } catch (error) {
            console.error("❌ Error cargando usuarios:", error);
            resultsContainer.innerHTML += `<p class="config-empty-state text-error">Error al conectar con la base de datos.</p>`;
        }
    };

    const renderUserResults = (users, isLoadMore) => {
        const resultsContainer = document.getElementById('user-list-results');
        const { roleList } = localConfig.accessControl;

        const html = users.map(user => {
            const assignedRole = pendingUserUpdates[user.id] || user.role || 'pending';
            const hasChange = !!pendingUserUpdates[user.id];

            return `
                <div class="user-role-card ${hasChange ? 'has-pending-change' : ''}" data-uid="${user.id}">
                    <div class="user-card-main-info">
                        <img src="${user.photoUrl || user.photoURL || '/src/img/person.svg'}" class="user-avatar-mini" alt="Avatar">
                        <div class="user-info-text">
                            <span class="user-name-tag">${user.displayName || 'Sin nombre'}</span>
                            <span class="user-email-tag">${user.email}</span>
                        </div>
                    </div>
                    <div class="user-role-control">
                        <select class="user-role-select" data-uid="${user.id}">
                            ${roleList.map(role => `
                                <option value="${role.id}" ${assignedRole === role.id ? 'selected' : ''}>${role.label}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            `;
        }).join('');

        if (isLoadMore) resultsContainer.insertAdjacentHTML('beforeend', html);
        else resultsContainer.innerHTML = html;

        resultsContainer.querySelectorAll('.user-role-select').forEach(select => {
            select.onchange = (e) => {
                const uid = e.target.dataset.uid;
                const newRole = e.target.value;
                const card = e.target.closest('.user-role-card');
                pendingUserUpdates[uid] = newRole;
                card.classList.add('has-pending-change');
                console.log(`⏳ Cambio pendiente: Usuario ${uid} -> Rol ${newRole}`);
            };
        });
    };

    // --- CASCADA DE MÓDULOS ---
    const renderModuleCascade = (viewKey) => {
        if (!cascadeList) return;
        const layoutData = localConfig.viewLayouts[viewKey];
        if (!layoutData) { cascadeList.innerHTML = `<p class="config-empty-state">${t('configManager.views.noModules')}</p>`; return; }
        const modules = Array.isArray(layoutData) ? layoutData : (layoutData.modules || []);
        cascadeList.innerHTML = [...modules].sort((a,b) => (a.order||0)-(b.order||0)).map(mod => `
            <div class="module-item" draggable="true" data-id="${mod.id}">
                <div class="drag-handle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg></div>
                <div class="module-info"><span class="module-name">${mod.id}</span></div>
                <label class="toggle-switch">
                    <input type="checkbox" class="switch" ${mod.visible !== false ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `).join('');
        initDragAndDrop(viewKey);
    };

    const initDragAndDrop = (viewKey) => {
        cascadeList.querySelectorAll('.module-item').forEach(item => {
            item.addEventListener('dragstart', () => item.classList.add('dragging'));
            item.addEventListener('dragend', () => { item.classList.remove('dragging'); updateCascadeOrder(viewKey); });
            item.querySelector('.switch').onchange = () => updateCascadeOrder(viewKey);
        });
        cascadeList.addEventListener('dragover', e => {
            e.preventDefault();
            const draggable = document.querySelector('.dragging');
            if (!draggable) return;
            const afterElement = ([...cascadeList.querySelectorAll('.module-item:not(.dragging)')]).reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;
                return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
            if (afterElement == null) cascadeList.appendChild(draggable);
            else cascadeList.insertBefore(draggable, afterElement);
        });
    };

    const updateCascadeOrder = (viewKey) => {
        const newOrder = [...cascadeList.querySelectorAll('.module-item')].map((el, i) => ({
            id: el.dataset.id, order: i + 1, visible: el.querySelector('.switch').checked
        }));
        if (Array.isArray(localConfig.viewLayouts[viewKey])) localConfig.viewLayouts[viewKey] = newOrder;
        else localConfig.viewLayouts[viewKey].modules = newOrder;
    };

    const initViewSelector = () => {
        if (!viewSelector) return;
        const views = Object.keys(localConfig.viewLayouts);
        viewSelector.innerHTML = views.map(v => `<option value="${v}">${v}</option>`).join('');
        viewSelector.onchange = (e) => renderModuleCascade(e.target.value);
        if (views.length > 0) renderModuleCascade(views[0]);
    };

    // --- INICIALIZACIÓN ---
    initGeneralSettings();
    renderPermissionsMatrix();
    initRoleActions();
    initUserManagement();
    initViewSelector();
    initLogoEvents();
    initTabs();

    if (resetBtn) {
        resetBtn.onclick = () => {
            if (confirm(t('configManager.actions.resetConfirm'))) {
                localStorage.removeItem('gph_app_config');
                window.location.reload();
            }
        };
    }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            saveBtn.innerHTML = `<span>${t('configManager.actions.saving')}</span>`;
            saveBtn.disabled = true;
            try {
                // 1. Logo a Storage
                const remoteUrl = await uploadLogoToFirebase();
                if (remoteUrl) localConfig.branding.logoUrl = remoteUrl;

                // 2. Roles de Usuario a Firestore
                const userUpdatePromises = Object.entries(pendingUserUpdates).map(([uid, newRole]) => {
                    return updateDoc(doc(db, "users", uid), { role: newRole });
                });
                if (userUpdatePromises.length > 0) {
                    await Promise.all(userUpdatePromises);
                    console.log(`✅ ${userUpdatePromises.length} roles de usuario actualizados.`);
                }

                // 3. Configuración Global a Firestore
                await setDoc(doc(db, "_config", "app"), localConfig, { merge: true });
                
                localStorage.setItem('gph_app_config', JSON.stringify(localConfig));
                saveBtn.innerHTML = `<span>${t('configManager.actions.success')}</span>`;
                saveBtn.style.backgroundColor = 'var(--color-success)';
                setTimeout(() => window.location.reload(), 1000);
            } catch (error) {
                console.error("❌ Error en guardado global:", error);
                alert("Error al guardar.");
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<span>${t('configManager.actions.save')}</span>`;
            }
        };
    }

    return () => console.log("Limpiando configManagerController");
}
