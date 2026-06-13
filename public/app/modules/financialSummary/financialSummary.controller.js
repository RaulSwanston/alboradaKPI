import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import { t } from '../../core/i18n.js';
import { db, collection, query, where, orderBy, limit, getDocs, doc, getDoc } from '../../core/firebase.js';

/**
 * Controlador para el módulo de Resumen Financiero (financialSummary).
 */
export default async function financialSummary(contexto) {
  console.log("Controlador 'financialSummary' cargado.");

  const permissions = contexto.data.permissions;
  const userProfile = contexto.data.userProfile;

  // --- Elementos del DOM ---
  const totalReceivableEl = document.getElementById('fs-total-receivable');
  const pastDueAmountEl = document.getElementById('fs-past-due-amount');
  const creditBalanceAmountEl = document.getElementById('fs-credit-balance-amount');
  const receivableLabelEl = document.getElementById('fs-receivable-label');
  const adminControls = document.getElementById('fs-admin-controls');
  const propertySearchInput = document.getElementById('fs-property-search');
  const propertiesDataList = document.getElementById('fs-properties-list');
  const btnSync = document.getElementById('fs-btn-sync');
  
  // Referencias adicionales para UI reactiva
  const propertyNameEl = document.getElementById('fs-property-name');
  const userRoleEl = document.getElementById('fs-user-role');
  const userDisplayNameEl = document.getElementById('fs-user-display-name');
  const userPhoneEl = document.getElementById('fs-user-phone');
  const propertyAddressEl = document.getElementById('fs-property-address');
  const balanceStatusEl = document.getElementById('fs-balance-status');
  const lastPaymentDateEl = document.getElementById('fs-last-payment-date');
  
  // Cache de propiedades para búsqueda rápida
  let cachedProperties = [];

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const updateBalanceUI = (balance) => {
    if (!balanceStatusEl || !totalReceivableEl) return;
    
    totalReceivableEl.textContent = formatCurrency(Math.abs(balance));
    
    if (balance >= -0.01 && balance <= 0.01) {
      balanceStatusEl.className = 'status-indicator status-ok';
      balanceStatusEl.innerHTML = `<div data-icon="check-circle"></div> <span>${t('financialSummary.statusOk')}</span>`;
    } else if (balance < 0) {
      balanceStatusEl.className = 'status-indicator status-debt';
      balanceStatusEl.innerHTML = `<div data-icon="x-circle"></div> <span>${t('financialSummary.statusDebt')}</span>`;
    } else {
      balanceStatusEl.className = 'status-indicator status-credit';
      balanceStatusEl.innerHTML = `<div data-icon="plus-circle"></div> <span>${t('financialSummary.statusCredit')}</span>`;
    }
  };

  /**
   * Obtiene el último pago registrado para una propiedad
   */
  const loadLastPayment = async (propertyId) => {
    try {
      const q = query(
        collection(db, "transactions"),
        where("propertyId", "==", propertyId),
        where("type", "==", "PAYMENT"),
        orderBy("effectiveDate", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const lastPay = snapshot.docs[0].data();
        if (creditBalanceAmountEl) creditBalanceAmountEl.textContent = formatCurrency(lastPay.amount);
        if (lastPaymentDateEl) lastPaymentDateEl.textContent = `Realizado el ${formatDate(lastPay.effectiveDate)}`;
      } else {
        if (creditBalanceAmountEl) creditBalanceAmountEl.textContent = formatCurrency(0);
        if (lastPaymentDateEl) lastPaymentDateEl.textContent = 'Sin pagos registrados';
      }
    } catch (e) {
      console.warn("Error al cargar último pago:", e);
    }
  };

  const userIconEl = document.getElementById('fs-user-icon');
  const userPhotoEl = document.getElementById('fs-user-photo');

  /**
   * Carga la info del usuario en la tarjeta Dark
   */
  const loadUserInfo = async (propId = null) => {
    const role = permissions.role;
    const user = contexto.data.user;
    const userProfile = contexto.data.userProfile;

    if (userRoleEl) userRoleEl.textContent = role === 'admin' ? t('roles.admin') : t('financialSummary.residentTitular');
    
    if (propId) {
      const prop = await Property.getById(propId);
      if (propertyNameEl) propertyNameEl.textContent = prop?.name || `Unidad ${propId}`;
      
      const ownerName = prop?.ownerInfo?.name || user?.displayName || user?.email.split('@')[0];
      const ownerPhone = prop?.ownerInfo?.mobile || prop?.ownerInfo?.phone || userProfile?.mobile || '---';
      const fullAddress = prop?.address?.fullAddress || prop?.address?.street || 'Condominio Alborada';

      if (userDisplayNameEl) userDisplayNameEl.textContent = ownerName;
      if (userPhoneEl) userPhoneEl.textContent = ownerPhone;
      if (propertyAddressEl) propertyAddressEl.textContent = fullAddress;

      // Lógica de Foto vs Icono
      let photoUrl = null;
      if (prop?.residentUids?.length > 0) {
        const firstResident = await User.getById(prop.residentUids[0]);
        photoUrl = firstResident?.photoUrl;
      }

      if (photoUrl) {
        userPhotoEl.src = photoUrl;
        userPhotoEl.classList.remove('hidden');
        userIconEl.classList.add('hidden');
      } else {
        userPhotoEl.classList.add('hidden');
        userIconEl.classList.remove('hidden');
      }

    } else {
      if (propertyNameEl) propertyNameEl.textContent = permissions.isAdmin ? 'Vista Global' : 'Alborada Residencial';
      if (userDisplayNameEl) userDisplayNameEl.textContent = user?.displayName || user?.email.split('@')[0];
      if (propertyAddressEl) propertyAddressEl.textContent = 'Consolidado General';
      if (userPhoneEl) userPhoneEl.textContent = userProfile?.mobile || '---';

      // En Vista Global siempre icono blanco
      userPhotoEl.classList.add('hidden');
      userIconEl.classList.remove('hidden');
    }
  };

  /**
   * Carga el resumen global para administradores usando la caché de appConfig
   */
  const loadGlobalSummary = async () => {
    try {
      const stats = contexto.data.appConfig.stats;
      
      if (stats) {
        // Tarjeta 1: Saldo Real en Banco/Caja
        if (totalReceivableEl) totalReceivableEl.textContent = formatCurrency(stats.saldoCajaDisponible || 0);
        
        // Tarjeta 2: ÚLTIMO PAGO Global + Índice de Cumplimiento (Sugerencia combinada)
        if (creditBalanceAmountEl) creditBalanceAmountEl.textContent = formatCurrency(stats.ultimoPagoMonto || 0);
        
        if (lastPaymentDateEl) {
          const alDia = stats.unidadesAlDiaCount || 0;
          const total = stats.totalUnidades || 1;
          const porcentaje = ((alDia / total) * 100).toFixed(1);
          lastPaymentDateEl.textContent = `${alDia} unidades al día (${porcentaje}%)`;
        }
        
        if (balanceStatusEl) {
          balanceStatusEl.className = 'status-indicator status-ok';
          balanceStatusEl.innerHTML = `<span>Balance Real de Caja</span>`;
        }
      } else {
        if (totalReceivableEl) totalReceivableEl.textContent = formatCurrency(0);
        if (creditBalanceAmountEl) creditBalanceAmountEl.textContent = formatCurrency(0);
        if (lastPaymentDateEl) lastPaymentDateEl.textContent = 'Pendiente de sincronización';
      }

      await loadUserInfo();
    } catch (error) {
      console.error("Error al cargar resumen global:", error);
    }
  };

  /**
   * Carga el resumen para una propiedad específica
   */
  const loadPropertySummary = async (propertyId) => {
    try {
      const prop = await Property.getById(propertyId);
      
      if (prop) {
        const balance = prop.balance || 0;
        updateBalanceUI(balance);
        
        if (creditBalanceAmountEl) creditBalanceAmountEl.textContent = formatCurrency(balance > 0 ? balance : 0);
        
        await loadLastPayment(propertyId);
        await loadUserInfo(propertyId);
      }
    } catch (error) {
      console.error("Error al cargar resumen de propiedad:", error);
    }
  };

  // --- Lógica de Inicialización por Rol ---
  if (permissions.isAdmin) {
    if (adminControls) adminControls.classList.remove('hidden');
    if (btnSync) {
        btnSync.classList.remove('hidden');
        btnSync.onclick = async () => {
            if (btnSync.classList.contains('loading')) return;
            
            const confirmMsg = "Esto recalculará el balance de TODAS las unidades y el saldo de caja real basándose en la contabilidad. ¿Deseas continuar?";
            if (!confirm(confirmMsg)) return;

            try {
                btnSync.classList.add('loading');
                const btnText = btnSync.querySelector('span');
                const originalText = btnText ? btnText.textContent : '';

                const result = await Property.recalculateAllBalances((current, total) => {
                  const percent = Math.round((current / total) * 100);
                  btnSync.style.setProperty('--progress', `${percent}%`);
                  if (btnText) btnText.textContent = `Sincronizando ${current}/${total}...`;
                });
                
                if (result.success) {
                    btnSync.style.removeProperty('--progress');
                    
                    if (result.stats) {
                      const currentConfig = contexto.data.appConfig;
                      currentConfig.stats = result.stats;
                      localStorage.setItem('gph_app_config', JSON.stringify(currentConfig));
                      contexto.data.appConfig = currentConfig;
                    }

                    btnSync.classList.remove('loading');
                    btnSync.classList.add('success');
                    btnSync.innerHTML = `<div class="icon-sync" data-icon="check-circle"></div>`;
                    await handleIcons();
                    
                    const currentVal = propertySearchInput.value;
                    if (currentVal === 'global' || !currentVal) await loadGlobalSummary();
                    else await loadPropertySummary(currentVal);
                    
                    setTimeout(() => {
                        btnSync.classList.remove('success');
                        btnSync.innerHTML = `<div class="icon-sync" data-icon="refresh"></div> <span>${originalText}</span>`;
                        handleIcons();
                    }, 3000);
                }
            } catch (error) {
                btnSync.classList.remove('loading');
                const btnText = btnSync.querySelector('span');
                if (btnText && typeof originalText !== 'undefined') btnText.textContent = originalText;
                alert("Ocurrió un error durante la sincronización.");
            } finally {
                btnSync.style.removeProperty('--progress');
            }
        };
    }
    if (propertyNameEl) propertyNameEl.classList.add('hidden');
    await loadGlobalSummary();

    // Cargar buscador de propiedades
    try {
      cachedProperties = await Property.getAll();
      
      const globalLabel = t('financialSummary.viewGlobal');
      propertiesDataList.innerHTML = `<option value="${globalLabel}"></option>` + 
        cachedProperties.map(p => {
          const label = p.ownerInfo?.name ? `${p.ownerInfo.name}` : p.name;
          return `<option value="${p.id}" label="${label}"></option>`;
        }).join('');

      // Preseleccionar vista global con el texto traducido
      propertySearchInput.value = globalLabel;

      propertySearchInput.oninput = async (e) => {
        const val = e.target.value;
        
        if (val === globalLabel) {
          await loadGlobalSummary();
          await handleIcons();
        } else {
          const match = cachedProperties.find(p => p.id === val);
          if (match) {
            await loadPropertySummary(val);
            await handleIcons();
          }
        }
      };

      propertySearchInput.onfocus = () => propertySearchInput.value = '';

    } catch (e) {
      console.error("Error al inicializar buscador:", e);
    }

  } else if (permissions.isResident) {
    if (adminControls) adminControls.classList.add('hidden');
    if (propertyNameEl) propertyNameEl.classList.remove('hidden');
    const myProperties = userProfile.propertyIds || [];
    if (myProperties.length > 0) {
      await loadPropertySummary(myProperties[0]);
    }
  }

  // Helper para inyectar iconos
  async function handleIcons() {
    try {
        const response = await fetch('/src/img/icons.json');
        const data = await response.json();
        document.querySelectorAll('.financial-summary-module [data-icon]').forEach(el => {
            const icon = data.icons.find(i => i.name === el.dataset.icon);
            if (icon) el.innerHTML = icon.svg;
        });
    } catch (e) {}
  }

  await handleIcons();
}
