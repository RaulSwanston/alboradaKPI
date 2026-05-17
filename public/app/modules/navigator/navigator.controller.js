import { router } from '/router.js';
import { db, collection, query, where, onSnapshot } from '../../core/firebase.js';
import { getInternalPath } from '../../core/i18n.js';

export default function navigator(contexto) {
  console.log("Ejecutando inicialización del 'navigator'.");
  const permissions = contexto.data.permissions;
  const user = contexto.data.user;

  // --- Clase Interna Modular para Notificaciones ---
  class NotificationManager {
    constructor(elementId) {
      this.element = document.getElementById(elementId);
      this.watchers = new Map(); // Mapa de desuscripciones [nombre -> unsubscribeFunc]
      this.counts = new Map();   // Mapa de conteos [nombre -> cantidad]
    }

    /**
     * Registra una nueva "antena" (listener en tiempo real)
     */
    registerWatcher(name, firestoreQuery) {
      if (this.watchers.has(name)) return;

      const unsubscribe = onSnapshot(firestoreQuery, (snapshot) => {
        this.counts.set(name, snapshot.size);
        this.updateUI();
      }, (error) => {
        console.warn(`⚠️ Error en antena '${name}':`, error.message);
      });

      this.watchers.set(name, unsubscribe);
    }

    /**
     * Evalúa si debe mostrar el punto rojo
     */
    updateUI() {
      if (!this.element) return;
      const totalPending = Array.from(this.counts.values()).reduce((a, b) => a + b, 0);
      this.element.classList.toggle('has-updates', totalPending > 0);
    }

    /**
     * Apaga todos los listeners
     */
    destroy() {
      this.watchers.forEach(unsub => unsub());
      this.watchers.clear();
      this.counts.clear();
    }
  }

  // --- Referencias a Elementos del DOM ---
  const dashboardMenu = document.getElementById("dashboard-menu");
  const dividers = dashboardMenu?.querySelectorAll(".menu-divider");
  const buttonMenu = document.getElementById("button-menu");

  if (!dashboardMenu || !dividers || !buttonMenu || dividers.length === 0) {
      console.warn("Elementos del navegador no encontrados.");
      return;
  }

  // --- Sincronización Inicial con la Ruta Actual ---
  const syncActiveRoute = () => {
    const currentInternalPath = getInternalPath(window.location.pathname);
    const allLinks = dashboardMenu.querySelectorAll("a[href]");
    
    let activeDivider = null;

    allLinks.forEach(link => {
      const linkPath = getInternalPath(link.getAttribute("href"));
      if (linkPath === currentInternalPath) {
        // Si el link está en un divider directamente, ese es el activo.
        // Si está en un dropdown, el activo es el divider inmediatamente anterior al dropdown.
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

  syncActiveRoute();

  // --- Inicializar Notificaciones ---
  const notifier = new NotificationManager('nav-notifications');

  if (permissions.isAdmin) {
    // Antena Admin 1: Membresías pendientes
    notifier.registerWatcher('memberships', query(
      collection(db, "membershipRequests"), 
      where("status", "==", "pending")
    ));
    // Antena Admin 2: Servicios pendientes (preparado para el futuro)
    notifier.registerWatcher('services', query(
      collection(db, "serviceRequests"), 
      where("status", "==", "pending")
    ));
  } else if (user) {
    // Antena Residente: Sus propias solicitudes aprobadas/notificadas recientemente
    // Por ahora, solo detectamos si tiene solicitudes activas (opcional)
  }

  // --- Handlers ---
  const handleDividerClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const divider = e.currentTarget;
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

  const handleMenuButtonClick = () => {
    buttonMenu.classList.toggle('open');
  };

  // --- Suscripción ---
  dividers.forEach((divider) => {
    divider.addEventListener("click", handleDividerClick);
  });
  buttonMenu.addEventListener("click", handleMenuButtonClick);

  // --- Limpieza ---
  return () => {
    console.log("Limpiando listeners del 'navigator' y apagando antenas.");
    notifier.destroy();
    dividers.forEach((divider) => {
      divider.removeEventListener("click", handleDividerClick);
    });
    buttonMenu.removeEventListener("click", handleMenuButtonClick);
  };
}