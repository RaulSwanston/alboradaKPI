/**
 * @file appConfig.js
 * @description Configuración centralizada de la aplicación. 
 * Actúa como la fuente de verdad para permisos granulares, roles y comportamiento del sistema.
 */

export const appConfig = {
  // 1. Registro de Capacidades (Module Registry)
  // Define qué acciones específicas puede realizar un usuario dentro de cada módulo.
  // Las etiquetas (label) usan claves i18n para soportar múltiples idiomas.
  moduleRegistry: {
    residents: {
      capabilities: [
        { id: 'view_all', labelKey: 'configManager.capabilities.residents.viewAll' },
        { id: 'create', labelKey: 'configManager.capabilities.residents.create' },
        { id: 'delete', labelKey: 'configManager.capabilities.residents.delete' },
        { id: 'edit_profile', labelKey: 'configManager.capabilities.residents.editProfile' }
      ]
    },
    transactions: {
      capabilities: [
        { id: 'view_all', labelKey: 'configManager.capabilities.transactions.viewAll' },
        { id: 'approve_payment', labelKey: 'configManager.capabilities.transactions.approve' },
        { id: 'manual_charge', labelKey: 'configManager.capabilities.transactions.manualCharge' }
      ]
    },
    properties: {
      capabilities: [
        { id: 'view_all', labelKey: 'configManager.capabilities.properties.viewAll' },
        { id: 'edit_balance', labelKey: 'configManager.capabilities.properties.editBalance' }
      ]
    },
    financialSummary: {
      capabilities: [
        { id: 'view_global', labelKey: 'configManager.capabilities.financial.viewGlobal' }
      ]
    }
  },

  // 2. Control de Acceso (RBAC)
  accessControl: {
    // Roles del sistema (Protegidos) y personalizados.
    roleList: [
      { id: "admin", label: "Administrador", isSystem: true },
      { id: "resident", label: "Residente", isSystem: true },
      { id: "provider", label: "Proveedor", isSystem: true },
      { id: "guest", label: "Visitante", isSystem: true },
      { id: "pending", label: "Pendiente", isSystem: true }
    ],
    // Definiciones de permisos por rol
    roles: {
      admin: {
        allowedModules: ["*"],
        // Permisos granulares: 'modulo:capacidad'
        capabilities: ["*"] 
      },
      resident: {
        allowedModules: ["financialSummary", "recentActivity", "navigator", "topbar", "paymentReport", "services"],
        capabilities: ["residents.edit_profile", "services.view_all"]
      },
      guest: {
        allowedModules: ["hero", "services", "navigator", "topbar"],
        capabilities: ["services.view_all"]
      },
      pending: {
        allowedModules: ["navigator", "topbar"],
        capabilities: []
      }
    }
  },

  // 3. Definiciones de Sistema
  systemDefaults: {
    language: "es",
    currency: "USD",
    theme: "light",
    maintenanceMode: false,
    timezone: "America/Panama"
  },

  // 4. Identidad Visual y Branding
  branding: {
    appName: "GPH Condominios",
    logoUrl: "/src/img/alborada.svg",
    colors: {
      primary: "#28bf63",
      accent: "#d55e65"
    }
  },

  // 5. Configuración de Vistas (Layouts)
  viewLayouts: {
    dashboard: {
      theme: "dashboard",
      modules: [
        { id: "navigator", slot: "sidebar" },
        { id: "topbar", slot: "top" },
        { id: "financialSummary", slot: "main", order: 1 },
        { id: "recentActivity", slot: "main", order: 2 },
        { id: "notificationsFeed", slot: "main", order: 3 }
      ]
    },
    "dashboard/summary": [
      { id: "financialSummary", order: 1, visible: true },
      { id: "recentActivity", order: 2, visible: true }
    ],
    "services": [
      { id: "hero", order: 1, visible: true },
      { id: "services", order: 2, visible: true }
    ]
  }
};
