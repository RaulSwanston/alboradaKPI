import { router } from '/router.js';
import { db, collection, query, where, onSnapshot } from '../../core/firebase.js';
import { getInternalPath, t } from '../../core/i18n.js';

export default async function navigator(contexto) {
  console.log("Ejecutando inicialización del 'navigator' dinámico.");
  const permissions = contexto.data.permissions;
  const user = contexto.data.user;
  const config = contexto.data.appConfig;

  // --- Clase Interna Modular para Notificaciones ---
  class NotificationManager {
    constructor() {
      this.watchers = new Map(); 
      this.counts = new Map();   
    }

    registerWatcher(name, firestoreQuery, callback) {
      if (this.watchers.has(name)) return;
      const unsubscribe = onSnapshot(firestoreQuery, (snapshot) => {
        this.counts.set(name, snapshot.size);
        callback(this.getTotal());
      }, (error) => {
        console.warn(`⚠️ Error en antena '${name}':`, error.message);
      });
      this.watchers.set(name, unsubscribe);
    }

    getTotal() {
      return Array.from(this.counts.values()).reduce((a, b) => a + b, 0);
    }

    destroy() {
      this.watchers.forEach(unsub => unsub());
      this.watchers.clear();
      this.counts.clear();
    }
  }

  const notifier = new NotificationManager();

  // --- Referencias a Elementos del DOM ---
  const navList = document.getElementById("nav-list");
  const buttonMenu = document.getElementById("button-menu");
  const navLogo = document.getElementById("nav-logo");
  const navAppName = document.getElementById("nav-app-name");

  if (!navList || !buttonMenu) {
      console.warn("Elementos del navegador no encontrados.");
      return;
  }

  /**
   * Renderiza el branding (Logo y Nombre)
   */
  const renderBranding = () => {
    if (config.branding) {
      if (navLogo && config.branding.logoUrl) {
        navLogo.src = config.branding.logoUrl;
        navLogo.alt = config.branding.appName || "App Logo";
      }
      if (navAppName && config.branding.appName) {
        // Si el nombre tiene espacios, podemos intentar poner un <br> en el primer espacio
        // para mantener el estilo visual original, o simplemente usar el nombre.
        // Por ahora, lo usaremos tal cual pero con soporte para el estilo de dos líneas si el usuario lo desea.
        const nameParts = config.branding.appName.split(' ');
        if (nameParts.length > 1) {
          navAppName.innerHTML = `${nameParts[0]}<br>${nameParts.slice(1).join(' ')}`;
        } else {
          navAppName.textContent = config.branding.appName;
        }
      }
    }
  };

  /**
   * Inyecta los iconos SVG desde el repositorio central.
   */
  const handleIcons = async (container = document) => {
    try {
        const response = await fetch('/src/img/icons.json');
        const data = await response.json();
        const iconRepo = data.icons;

        const inject = (c, iconName) => {
            const iconData = iconRepo.find(i => i.name === iconName);
            if (iconData && c) {
                c.innerHTML = iconData.svg;
            }
        };

        container.querySelectorAll('[data-icon]').forEach(el => {
            inject(el, el.dataset.icon);
        });
    } catch (error) {
        console.error("Error al cargar icons.json en navigator:", error);
    }
  };

  /**
   * Renderiza el menú basado en la configuración y roles
   */
  const renderMenu = async () => {
    const sidebarConfig = config.navigation?.sidebar || [];
    const userRole = permissions.role;

    let html = '';

    sidebarConfig.forEach(group => {
      // Verificar si el rol del usuario tiene permiso para este grupo
      if (group.roles && !group.roles.includes(userRole) && !permissions.isAdmin) return;

      const hasItems = group.items && group.items.length > 0;
      
      html += `
        <li class="menu-divider" id="${group.id}">
          <a href="${group.path}" data-view="dashboard">
            <div class="icon-slot" data-icon="${group.icon}"></div>
            <span>${t(group.labelKey)}</span>
          </a>
        </li>
      `;

      if (hasItems) {
        html += `<div class="dropdown">`;
        group.items.forEach(item => {
          if (item.roles && !item.roles.includes(userRole) && !permissions.isAdmin) return;

          html += `
            <li class="menu-item">
              <a href="${item.path}" data-view="dashboard">
                <div class="icon-slot-sm" data-icon="${item.icon}"></div>
                <span>${t(item.labelKey)}</span>
              </a>
            </li>
          `;
        });
        html += `</div>`;
      }
    });

    navList.innerHTML = html;
    await handleIcons(navList);
    syncActiveRoute();
    attachEvents();
    initNotifiers();
  };

  const syncActiveRoute = () => {
    const currentInternalPath = getInternalPath(window.location.pathname);
    const dividers = navList.querySelectorAll(".menu-divider");
    const allLinks = navList.querySelectorAll("a[href]");
    
    let activeDivider = null;

    allLinks.forEach(link => {
      const linkPath = getInternalPath(link.getAttribute("href"));
      if (linkPath === currentInternalPath) {
        const parentDivider = link.closest(".menu-divider");
        if (parentDivider) {
          activeDivider = parentDivider;
        } else {
          const dropdown = link.closest(".dropdown");
          if (dropdown && dropdown.previousElementSibling?.classList.contains("menu-divider")) {
            activeDivider = dropdown.previousElementSibling;
          }
        }
      }
    });

    if (activeDivider) {
      dividers.forEach(el => el.classList.remove("selected"));
      activeDivider.classList.add("selected");
    }
  };

  const handleDividerClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const divider = e.currentTarget;
    const dividers = navList.querySelectorAll(".menu-divider");
    const isDesktop = window.matchMedia("(min-width: 768px)");

    if (isDesktop.matches) {
      divider.classList.toggle("selected");
    } else {
      dividers.forEach(el => el.classList.remove("selected"));
      divider.classList.add("selected");
    }

    const link = divider.querySelector('a');
    if (link && link.href) {
      const path = new URL(link.href).pathname;
      router.navigate(path, link.dataset.view);
    }
  };

  const attachEvents = () => {
    const dividers = navList.querySelectorAll(".menu-divider");
    dividers.forEach((divider) => {
      divider.addEventListener("click", handleDividerClick);
    });
  };

  const initNotifiers = () => {
    const notificationElement = document.getElementById('nav-notifications');
    if (!notificationElement) return;

    const updateBadge = (total) => {
      notificationElement.classList.toggle('has-updates', total > 0);
    };

    if (permissions.isAdmin) {
      notifier.registerWatcher('memberships', query(
        collection(db, "membershipRequests"), 
        where("status", "==", "pending")
      ), updateBadge);
      
      notifier.registerWatcher('services', query(
        collection(db, "serviceRequests"), 
        where("status", "==", "pending")
      ), updateBadge);
    }
  };

  const handleMenuButtonClick = () => {
    buttonMenu.classList.toggle('open');
  };

  buttonMenu.addEventListener("click", handleMenuButtonClick);

  // Ejecutar render inicial
  renderBranding();
  await renderMenu();

  // --- Limpieza ---
  return () => {
    console.log("Limpiando listeners del 'navigator'.");
    notifier.destroy();
    buttonMenu.removeEventListener("click", handleMenuButtonClick);
    const dividers = navList.querySelectorAll(".menu-divider");
    dividers.forEach((divider) => {
      divider.removeEventListener("click", handleDividerClick);
    });
  };
}