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
    },
    breadcrumbs: {
      capabilities: []
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
        allowedModules: ["financialSummary", "recentActivity", "navigator", "topbar", "paymentReport", "paymentHistory", "services", "breadcrumbs"],
        capabilities: ["residents.edit_profile", "services.view_all"]
      },
      guest: {
        allowedModules: ["hero", "services", "navigator", "topbar", "breadcrumbs"],
        capabilities: ["services.view_all"]
      },
      pending: {
        allowedModules: ["navigator", "topbar", "breadcrumbs"],
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

  // 4. Estadísticas y Caché Financiera (NUEVO)
  stats: {
    saldoCajaDisponible: 0,
    totalCuentasPorCobrar: 0,
    totalSaldosAFavor: 0,
    ultimaSincronizacion: null
  },

  // 5. Identidad Visual y Branding
  branding: {
    appName: "Alborada Residencial",
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
  },

  // 6. Navegación Dinámica
  navigation: {
    sidebar: [
      {
        id: "nav-dashboard",
        labelKey: "navigation.dashboard",
        path: "/dashboard/resumen",
        icon: "layout-dashboard",
        roles: ["admin", "resident"],
        items: [
          { labelKey: "navigation.financialSummary", path: "/dashboard/resumen", icon: "layout-grid" },
          { labelKey: "navigation.transactions", path: "/dashboard/transactions", icon: "clock" },
          { labelKey: "navigation.properties", path: "/dashboard/properties", icon: "home", roles: ["admin"] }
        ]
      },
      {
        id: "nav-services",
        labelKey: "navigation.services",
        path: "/services",
        icon: "heart",
        roles: ["admin", "resident", "guest"],
        items: [
          { labelKey: "navigation.catalog", path: "/services", icon: "box", roles: ["resident", "guest"] },
          { labelKey: "navigation.requests", path: "/dashboard/requests", icon: "file-text" },
          { labelKey: "navigation.residents", path: "/residents", icon: "users", roles: ["admin"] },
          { labelKey: "navigation.reportPayment", path: "/dashboard/payments/report", icon: "megaphone", roles: ["resident"] },
          { labelKey: "navigation.paymentHistory", path: "/dashboard/payments/history", icon: "clock", roles: ["resident"] },
          { labelKey: "navigation.approvePayments", path: "/dashboard/payments/pending", icon: "wallet", roles: ["admin"] }
        ]
      },
      {
        id: "nav-notifications",
        labelKey: "navigation.notifications",
        path: "/dashboard/notifications",
        icon: "bell",
        roles: ["admin", "resident"],
        items: [
          { labelKey: "navigation.catalog", path: "/dashboard/notifications", icon: "bell", roles: ["admin", "resident", "guest"] },
        ]
      },
      // {
      //   id: "nav-settings",
      //   labelKey: "navigation.settings",
      //   path: "/dashboard/profile",
      //   icon: "id-card",
      //   roles: ["admin", "resident", "guest", "pending"],
      //   items: [
      //     { labelKey: "navigation.profile", path: "/dashboard/profile", icon: "user-cog" },
      //     { labelKey: "navigation.systemSettings", path: "/dashboard/config", icon: "settings", roles: ["admin"] }
      //   ]
      // }
    ]
  },

  // 7. Acciones Rápidas
  quickActions: [
    { id: "report-payment", labelKey: "quickActions.reportPayment", path: "/dashboard/payments/report", icon: "megaphone", roles: ["resident"] },
    { id: "approve-payments", labelKey: "quickActions.approvePayments", path: "/dashboard/payments/pending", icon: "wallet", roles: ["admin"] },
    { id: "new-resident", labelKey: "quickActions.newResident", path: "/residents", icon: "user-plus", roles: ["admin"] },
    { id: "view-requests", labelKey: "quickActions.viewRequests", path: "/dashboard/requests", icon: "file-text", roles: ["admin", "resident"] },
    { id: "app-config", labelKey: "quickActions.appConfig", path: "/dashboard/config", icon: "settings", roles: ["admin"] }
  ]
};
