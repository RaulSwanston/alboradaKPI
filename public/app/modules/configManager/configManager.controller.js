/**
 * @file configManager.controller.js
 * @description Controlador para la gestión de la configuración dinámica de la app.
 * Maneja la lógica de la matriz de permisos, el ordenamiento de la cascada de módulos
 * y la persistencia híbrida (Local + Firebase).
 */

import { appConfig } from '../../core/appConfig.js';
import { t } from '../../core/i18n.js';
import { db, doc, getDoc } from '../../core/firebase.js';
import { uploadFileToR2, buildSystemImageKey, getAuthObjectURL, revokeAuthObjectURLs } from '../../core/r2.js';
import { compressImageFile } from '../../core/imageCompress.js';
import User from '../../models/User.js';
import AppConfig from '../../models/AppConfig.js';
import ExpenseAccount from '../../models/ExpenseAccount.js';

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

    // Referencias para el Catálogo de Cuentas de Gasto
    const eaForm = document.getElementById('expense-account-form');
    const eaCategory = document.getElementById('ea-category');
    const eaName = document.getElementById('ea-name');
    const eaOrder = document.getElementById('ea-order');
    const eaActive = document.getElementById('ea-active');
    const eaNewBtn = document.getElementById('expense-account-new');
    const eaSaveBtn = document.getElementById('ea-save');
    const eaCancelBtn = document.getElementById('ea-cancel');
    const eaTable = document.getElementById('expense-accounts-table');
    const eaTbody = document.getElementById('expense-accounts-tbody');
    const eaEmpty = document.getElementById('expense-accounts-empty');

    let expenseAccountList = [];
    let eaEditingId = null;
    let dragState = null;

    // --- ESTADO LOCAL DE CONFIGURACIÓN ---
    let localConfig = JSON.parse(JSON.stringify(contexto.data.appConfig || appConfig));
    if (!localConfig.branding) localConfig.branding = JSON.parse(JSON.stringify(appConfig.branding));
    if (!localConfig.systemDefaults) localConfig.systemDefaults = JSON.parse(JSON.stringify(appConfig.systemDefaults));

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
        };
        reader.readAsDataURL(file);
    };

    const uploadLogoToFirebase = async () => {
        if (!selectedFile) return null;
        try {
            const { blob, ext } = await compressImageFile(selectedFile, { maxDimension: 512, maxBytes: 200 * 1024 });
            const key = buildSystemImageKey('logo', ext);
            return await uploadFileToR2(blob, key);
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
            getAuthObjectURL(branding.logoUrl || '/src/img/alborada.svg').then((blobUrl) => {
                if (logoPreview) logoPreview.src = blobUrl;
            }).catch(() => {
                if (logoPreview) logoPreview.src = '/src/img/alborada.svg';
            });
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
                    const roleAllowed = roles[role.id]?.allowedModules || [];
                    const hasFullAccess = roleAllowed.includes(moduleKey) || roleAllowed.includes('*');
                    return `<td><input type="checkbox" class="mod-access" data-role="${role.id}" data-module="${moduleKey}" ${hasFullAccess ? 'checked' : ''}></td>`;
                }).join('')}
            </tr>`;

            (moduleData.capabilities || []).forEach(cap => {
                html += `<tr class="capability-row" data-parent="${moduleKey}">
                    <td class="capability-name">${t(cap.labelKey)}</td>
                    ${roleList.map(role => {
                        const fullCapKey = `${moduleKey}.${cap.id}`;
                        const roleCaps = roles[role.id]?.capabilities || [];
                        const hasCap = roleCaps.includes(fullCapKey) || roleCaps.includes('*');
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
                roleData.allowedModules = roleData.allowedModules || [];
                if (e.target.checked) { if (!roleData.allowedModules.includes(module)) roleData.allowedModules.push(module); }
                else { roleData.allowedModules = roleData.allowedModules.filter(m => m !== module); }
            };
        });

        matrixContainer.querySelectorAll('.cap-access').forEach(cb => {
            cb.onchange = (e) => {
                const { role, cap } = e.target.dataset;
                const roleData = localConfig.accessControl.roles[role];
                roleData.capabilities = roleData.capabilities || [];
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

        if (searchInput) searchInput.placeholder = t('configManager.roles.searchPlaceholder');

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
            // Uso del modelo User para búsqueda y paginación
            const result = await User.queryUsers({
                role: currentRoleFilter,
                searchTerm: currentSearchTerm,
                pageSize: USERS_PER_PAGE,
                lastDoc: lastUserDoc
            });
            
            if (!isLoadMore && result.users.length === 0) {
                resultsContainer.innerHTML = `<p class="config-empty-state">${t('configManager.roles.noUsersFound')}</p>`;
                return;
            }

            if (!isLoadMore) resultsContainer.innerHTML = '';

            lastUserDoc = result.lastDoc;
            renderUserResults(result.users, isLoadMore);

            if (result.size === USERS_PER_PAGE) {
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

    // --- CATÁLOGO DE CUENTAS DE GASTO ---
    const resetAccountForm = () => {
        eaEditingId = null;
        if (eaCategory) eaCategory.value = '';
        if (eaName) eaName.value = '';
        if (eaOrder) eaOrder.value = '0';
        if (eaActive) eaActive.value = 'true';
    };

    const toggleAccountForm = (visible, editing = false) => {
        if (!eaForm) return;
        eaForm.classList.toggle('hidden', !visible);
        if (eaNewBtn) eaNewBtn.classList.toggle('hidden', visible);
        if (visible && !editing) {
            resetAccountForm();
            eaForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    const renderExpenseAccounts = () => {
        if (!eaTable || !eaEmpty) return;
        if (expenseAccountList.length === 0) {
            eaTable.classList.add('hidden');
            eaEmpty.classList.remove('hidden');
            return;
        }
        eaTable.classList.remove('hidden');
        eaEmpty.classList.add('hidden');

        eaTbody.innerHTML = expenseAccountList.map(acc => {
            const isActive = acc.active !== false;
            return `
                <tr data-id="${acc.id}">
                    <td class="expense-account-drag-handle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg></td>
                    <td>${acc.category || '-'}</td>
                    <td>${acc.name || ''}</td>
                    <td class="ea-order-cell" style="text-align:center">${acc.order || 0}</td>
                    <td style="text-align:center">${isActive
                        ? `<span class="expense-account-badge active">${t('configManager.expenseAccounts.activeYes')}</span>`
                        : `<span class="expense-account-badge inactive">${t('configManager.expenseAccounts.activeNo')}</span>`}</td>
                    <td class="expense-account-row-actions">
                        <button class="expense-account-action ea-edit" type="button" data-id="${acc.id}">${t('configManager.expenseAccounts.edit')}</button>
                        <button class="expense-account-action expense-account-del ea-delete" type="button" data-id="${acc.id}">${t('configManager.expenseAccounts.delete')}</button>
                    </td>
                </tr>
            `;
        }).join('');
        initExpenseAccountsDrag();
    };

    // --- REORDENAR CUENTAS DE GASTO POR ARRASTRE (Pointer Events: ratón + táctil) ---
    const initExpenseAccountsDrag = () => {
        if (!eaTbody) return;
        eaTbody.querySelectorAll('.expense-account-drag-handle').forEach(handle => {
            handle.style.touchAction = 'none';
            handle.addEventListener('pointerdown', handleExpenseAccountPointerDown);
            handle.addEventListener('pointermove', handleExpenseAccountPointerMove);
            handle.addEventListener('pointerup', handleExpenseAccountPointerEnd);
            handle.addEventListener('pointercancel', handleExpenseAccountPointerEnd);
        });
    };

    const handleExpenseAccountPointerDown = (e) => {
        const row = e.currentTarget.closest('tr');
        if (!row || !row.dataset.id) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        dragState = {
            id: row.dataset.id,
            offsetY: e.clientY - rect.top,
            pointerId: e.pointerId
        };
        row.classList.add('dragging');
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    };

    const handleExpenseAccountPointerMove = (e) => {
        if (!dragState) return;
        e.preventDefault();
        const draggingRow = eaTbody.querySelector('tr.dragging');
        if (!draggingRow) return;
        const rows = [...eaTbody.querySelectorAll('tr:not(.dragging)')];
        const afterElement = rows.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
        if (afterElement == null) eaTbody.appendChild(draggingRow);
        else eaTbody.insertBefore(draggingRow, afterElement);
        updateOrderColumn();
        autoScrollExpenseAccountsDrag(e);
    };

    const updateOrderColumn = () => {
        eaTbody.querySelectorAll('tr[data-id]').forEach((row, index) => {
            const cell = row.querySelector('.ea-order-cell');
            if (cell) cell.textContent = String(index + 1);
        });
    };

    const handleExpenseAccountPointerEnd = () => {
        if (!dragState) return;
        const draggingRow = eaTbody.querySelector('tr.dragging');
        if (draggingRow) draggingRow.classList.remove('dragging');
        dragState = null;
        persistExpenseAccountOrder();
    };

    const autoScrollExpenseAccountsDrag = (e) => {
        const MARGIN = 80;
        if (e.clientY < MARGIN) window.scrollBy(0, -8);
        else if (e.clientY > window.innerHeight - MARGIN) window.scrollBy(0, 8);
    };

    const persistExpenseAccountOrder = async () => {
        const rows = [...eaTbody.querySelectorAll('tr[data-id]')];
        const updates = [];
        const newList = rows.reduce((list, row, index) => {
            const acc = expenseAccountList.find(a => a.id === row.dataset.id);
            if (!acc) return list;
            list.push(acc);
            const newOrder = index + 1;
            if (acc.order !== newOrder) {
                acc.order = newOrder;
                updates.push(ExpenseAccount.update(acc.id, { order: newOrder }));
            }
            return list;
        }, []);
        if (newList.length > 0) expenseAccountList = newList;
        if (updates.length === 0) return;
        const results = await Promise.allSettled(updates);
        if (results.some(r => r.status === 'rejected')) {
            console.error('[ConfigManager] Error al persistir el orden de cuentas:', results.filter(r => r.status === 'rejected'));
            alert(t('configManager.expenseAccounts.saveError') || 'Error al guardar la cuenta');
        }
        renderExpenseAccounts();
    };

    const loadExpenseAccounts = async () => {
        try {
            expenseAccountList = await ExpenseAccount.getAll();
        } catch (e) {
            console.warn('[ConfigManager] Error loading expense accounts:', e);
            expenseAccountList = [];
        }
        renderExpenseAccounts();
    };

    const initExpenseAccounts = () => {
        if (!eaForm || !eaTable) return;

        if (eaCategory) eaCategory.placeholder = t('configManager.expenseAccounts.categoryPlaceholder');
        if (eaName) eaName.placeholder = t('configManager.expenseAccounts.namePlaceholder');
        if (logoUrlInput) logoUrlInput.placeholder = t('configManager.general.logoUrlPlaceholder');

        loadExpenseAccounts();

        if (eaNewBtn) {
            eaNewBtn.onclick = () => toggleAccountForm(true);
        }
        if (eaCancelBtn) {
            eaCancelBtn.onclick = () => toggleAccountForm(false);
        }
        if (eaSaveBtn) {
            eaSaveBtn.onclick = async () => {
                const name = (eaName.value || '').trim();
                if (!name) {
                    alert(t('configManager.expenseAccounts.nameRequired') || 'El nombre es obligatorio');
                    return;
                }

                const data = {
                    name,
                    category: (eaCategory.value || '').trim(),
                    order: parseInt(eaOrder.value, 10) || 0,
                    active: eaActive.value === 'true'
                };

                try {
                    if (eaEditingId) {
                        await ExpenseAccount.update(eaEditingId, data);
                    } else {
                        await ExpenseAccount.create(data);
                    }
                    toggleAccountForm(false);
                    await loadExpenseAccounts();
                } catch (err) {
                    console.error('[ConfigManager] Error guardando cuenta de gasto:', err);
                    alert(t('configManager.expenseAccounts.saveError') || 'Error al guardar la cuenta');
                }
            };
        }
        if (eaTbody) {
            eaTbody.addEventListener('click', async (e) => {
                const editBtn = e.target.closest('.ea-edit');
                const delBtn = e.target.closest('.ea-delete');
                if (editBtn) {
                    const acc = expenseAccountList.find(a => a.id === editBtn.dataset.id);
                    if (!acc) return;
                    eaEditingId = acc.id;
                    eaCategory.value = acc.category || '';
                    eaName.value = acc.name || '';
                    eaOrder.value = acc.order || 0;
                    eaActive.value = acc.active === false ? 'false' : 'true';
                    toggleAccountForm(true, true);
                } else if (delBtn) {
                    const acc = expenseAccountList.find(a => a.id === delBtn.dataset.id);
                    if (!acc) return;
                    if (!confirm(`${t('configManager.expenseAccounts.deleteConfirm')} "${acc.name}"?`)) return;
                    try {
                        await ExpenseAccount.delete(delBtn.dataset.id);
                        await loadExpenseAccounts();
                    } catch (err) {
                        console.error('[ConfigManager] Error eliminando cuenta de gasto:', err);
                        alert(t('configManager.expenseAccounts.deleteError') || 'Error al eliminar la cuenta');
                    }
                }
            });
        }
    };

    // --- INICIALIZACIÓN ---
    initGeneralSettings();
    renderPermissionsMatrix();
    initRoleActions();
    initUserManagement();
    initViewSelector();
    initLogoEvents();
    initExpenseAccounts();
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
                // 1. Logo a Storage (Independiente)
                const remoteUrl = await uploadLogoToFirebase();
                if (remoteUrl) localConfig.branding.logoUrl = remoteUrl;
                else if (selectedFile) alert('No se pudo subir el logo; se mantendrá el actual.');
                selectedFile = null;

                // 2. Roles de Usuario (Uso del modelo User)
                const userUpdatePromises = Object.entries(pendingUserUpdates).map(([uid, newRole]) => {
                    return User.updateRole(uid, newRole);
                });
                if (userUpdatePromises.length > 0) {
                    await Promise.all(userUpdatePromises);
                    console.log(`✅ ${userUpdatePromises.length} roles de usuario actualizados.`);
                }

                // 3. Configuración Global (Uso del modelo AppConfig)
                await AppConfig.save(localConfig);
                
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

    return () => {
        revokeAuthObjectURLs();
        console.log("Limpiando configManagerController");
    };
}
