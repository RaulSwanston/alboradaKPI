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
      ],
      // Métodos de pago aceptados. Fuente única para paymentReport (residente)
      // y transactions-detail (admin). Editable a futuro desde configManager.
      paymentMethods: [
        { id: 'transfer', label: 'Transferencia' },
        { id: 'deposit', label: 'Depósito' },
        { id: 'cash', label: 'Efectivo' },
        { id: 'check', label: 'Cheque' },
        { id: 'card', label: 'Tarjeta' },
        { id: 'yappy', label: 'Yappy' },
        { id: 'other', label: 'Otro' }
      ]
    },
    // Gráficos ApexCharts (configuración centralizada).
    // Donde se coloque ::module.apexCharts se renderizan los gráficos aquí definidos,
    // agrupados en pestañas por público (audience: 'admin' | 'resident').
    // dataSource.method → método del modelo Analytics que alimenta el gráfico.
    apexCharts: {
      charts: [
        // ----- Tab Administración -----
        {
          id: 'flujo-caja',
          audience: 'admin',
          title: 'Flujo de Caja Mensual',
          type: 'bar',
          height: 320,
          dataSource: { method: 'getCashFlow', params: { months: 6 } },
          options: {
            dataLabels: { enabled: false },
            colors: ['#28bf63', '#d55e65']
          }
        },
        {
          id: 'recaudacion-facturacion',
          audience: 'admin',
          title: 'Recaudación vs Facturación',
          type: 'bar',
          height: 320,
          dataSource: { method: 'getCollectionRate', params: { months: 6 } },
          options: {
            dataLabels: { enabled: false },
            colors: ['#1b9e4e', '#e0b400']
          }
        },
        {
          id: 'unidades-salud',
          audience: 'admin',
          title: 'Unidades al día vs en mora',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getUnitsHealth', params: {} },
          options: {
            colors: ['#28bf63', '#d55e65'],
            legend: { position: 'bottom' }
          }
        },
        {
          id: 'top-deudores',
          audience: 'admin',
          title: 'Top Deudores',
          type: 'bar',
          height: 320,
          dataSource: { method: 'getTopDebtors', params: { top: 6 } },
          options: {
            plotOptions: { bar: { horizontal: true, barHeight: '45%' } },
            dataLabels: { enabled: false },
            colors: ['#d55e65']
          }
        },
        {
          id: 'saldos-favor',
          audience: 'admin',
          title: 'Saldos a Favor por Unidad',
          type: 'bar',
          height: 320,
          dataSource: { method: 'getOverpayments', params: { top: 6 } },
          options: {
            plotOptions: { bar: { horizontal: true, barHeight: '45%' } },
            dataLabels: { enabled: false },
            colors: ['#e0b400']
          }
        },
        {
          id: 'metodos-pago',
          audience: 'admin',
          title: 'Cobros por Método de Pago',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getPaymentMethodDistribution', params: { months: 12 } },
          options: {
            legend: { position: 'bottom' }
          }
        },
        {
          id: 'ingresos-concepto',
          audience: 'admin',
          title: 'Ingresos por Concepto',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getIncomeByConcept', params: { months: 12 } },
          options: {
            legend: { position: 'bottom' }
          }
        },
        {
          id: 'gastos-categoria',
          audience: 'admin',
          title: 'Gastos por Categoría',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getExpensesByCategory', params: { months: 12 } },
          options: {
            legend: { position: 'bottom' }
          }
        },
        {
          id: 'estados-reportes',
          audience: 'admin',
          title: 'Estados de Reportes de Pago',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getPaymentReportStatus', params: {} },
          options: {
            legend: { position: 'bottom' }
          }
        },
        {
          id: 'estados-solicitudes',
          audience: 'admin',
          title: 'Estados de Solicitudes de Servicio',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getServiceRequestStatus', params: {} },
          options: {
            legend: { position: 'bottom' }
          }
        },
        // ----- Tab Comunidad (residentes) -----
        {
          id: 'mi-estado',
          audience: 'resident',
          title: 'Mi Estado de Cuenta',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getMyBalance', params: {} },
          options: {
            colors: ['#d55e65', '#28bf63'],
            legend: { position: 'bottom' }
          }
        },
        {
          id: 'salud-comunidad',
          audience: 'resident',
          title: 'Salud Financiera de la Comunidad',
          type: 'radialBar',
          height: 320,
          dataSource: { method: 'getCommunityHealth', params: {} },
          options: {
            labels: ['Unidades al día'],
            colors: ['#28bf63']
          }
        },
        {
          id: 'inversion-comunidad',
          audience: 'resident',
          title: '¿En qué se invierte la comunidad?',
          type: 'donut',
          height: 320,
          dataSource: { method: 'getCommunityExpenses', params: { months: 12 } },
          options: {
            legend: { position: 'bottom' }
          }
        },
        {
          id: 'servicios-solicitados',
          audience: 'resident',
          title: 'Servicios más Solicitados',
          type: 'bar',
          height: 320,
          dataSource: { method: 'getTopServices', params: { top: 6 } },
          options: {
            dataLabels: { enabled: false },
            colors: ['#1b9e4e']
          }
        },
        {
          id: 'eventos-mes',
          audience: 'resident',
          title: 'Eventos Comunitarios por Mes',
          type: 'bar',
          height: 320,
          dataSource: { method: 'getEventsByMonth', params: { months: 6 } },
          options: {
            dataLabels: { enabled: false },
            colors: ['#d55e65']
          }
        }
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

  // 5. Contadores de Facturación (Secuencial Manual)
  // Si el admin define fac o rec aquí, _generateVoucher() usará esos valores
  // como semilla inicial para system/counters. Si son null, arranca desde 1.
  counters: {
    fac: null,
    rec: null
  },

  // 6. Identidad Visual y Branding
  branding: {
    appName: "Alborada Residencial",
    logoUrl: "/src/img/alborada.svg",
    colors: {
      primary: "#28bf63",
      accent: "#d55e65"
    }
  },

  // 7. Configuración de Vistas (Layouts)
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

  // 8. Navegación Dinámica
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

  // 10. Tipos de Concepto de Cargo
  chargeTypes: {
    ordinary: { label: "Cuota Ordinaria", badgeClass: "badge-ordinary" },
    extraordinary: { label: "Cuota Extraordinaria", badgeClass: "badge-extraordinary" },
    fine: { label: "Multa", badgeClass: "badge-fine" },
    service: { label: "Servicio", badgeClass: "badge-service" },
    reservation: { label: "Reserva", badgeClass: "badge-reservation" }
  },

  // 9. Acciones Rápidas
  quickActions: [
    { id: "report-payment", labelKey: "quickActions.reportPayment", path: "/dashboard/payments/report", icon: "megaphone", roles: ["resident"] },
    { id: "approve-payments", labelKey: "quickActions.approvePayments", path: "/dashboard/payments/pending", icon: "wallet", roles: ["admin"] },
    { id: "new-resident", labelKey: "quickActions.newResident", path: "/residents", icon: "user-plus", roles: ["admin"] },
    { id: "view-requests", labelKey: "quickActions.viewRequests", path: "/dashboard/requests", icon: "file-text", roles: ["admin", "resident"] },
    { id: "app-config", labelKey: "quickActions.appConfig", path: "/dashboard/config", icon: "settings", roles: ["admin"] }
  ]
};
