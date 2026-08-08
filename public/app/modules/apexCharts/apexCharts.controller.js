import ApexCharts from 'apexcharts';
import Analytics from '../../models/Analytics.js';
import { appConfig as defaultAppConfig } from '../../core/appConfig.js';
import { t } from '../../core/i18n.js';

const DONUT_TYPES = ['donut', 'pie', 'radialBar', 'polarArea'];

/**
 * Controlador del módulo apexCharts.
 * Renderiza los gráficos definidos en appConfig.moduleRegistry.apexCharts.charts,
 * agrupados por pestañas según el público (admin / residente).
 * Si un gráfico define dataSource, la data se obtiene del modelo Analytics;
 * si no, usa las series estáticas de la configuración.
 */
export default async function apexChartsController(contexto) {
  const root = document.querySelector('[data-module-controller$="apexCharts.controller.js"]') || document;
  const tabsEl = root.querySelector('#apex-charts-tabs');
  const grid = root.querySelector('#apex-charts-grid');
  if (!grid) return () => {};

  // Los charts pueden vivir en el appConfig fusionado (Firestore + caché local),
  // pero la fusión es superficial y el doc en la nube podría no tener la clave.
  // Fallback al config default del código para garantizar los gráficos.
  const chartsConfig = contexto.data.appConfig?.moduleRegistry?.apexCharts?.charts
    || defaultAppConfig.moduleRegistry?.apexCharts?.charts
    || [];
  const isAdmin = contexto.data.permissions?.isAdmin;
  const analytics = new Analytics(contexto);

  let instances = [];
  const tabListeners = [];
  const resizeObservers = [];
  let reflowTimer = null;

  // ApexCharts renderiza con el ancho del contenedor al momento de dibujar y solo
  // re-renderiza en resize de ventana o si el padre cambia DESPUÉS de observarlo
  // (la primera callback del ResizeObserver se omite). Si el layout se asienta
  // después del render, el SVG queda con un ancho incorrecto y se solapan.
  // Reflow: forzamos un re-render (vía el propio handler de ApexCharts) cuando
  // el layout termina de asentarse.
  const reflow = () => {
    if (reflowTimer) return;
    reflowTimer = setTimeout(() => {
      reflowTimer = null;
      window.dispatchEvent(new Event('resize'));
    }, 120);
  };

  const scheduleSettleReflow = () => {
    requestAnimationFrame(reflow);
    setTimeout(reflow, 300);
    setTimeout(reflow, 900);
    if (document.fonts?.ready) {
      document.fonts.ready.then(reflow).catch(() => {});
    }
  };

  const observeContainer = (container) => {
    if (typeof ResizeObserver === 'undefined') return;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      reflow();
    });
    observer.observe(container);
    resizeObservers.push(observer);
  };

  const destroyAll = () => {
    instances.forEach(chart => {
      try {
        chart.destroy();
      } catch (e) {
        console.warn('[apexCharts] Error al destruir gráfico:', e);
      }
    });
    instances = [];
    resizeObservers.forEach(observer => observer.disconnect());
    resizeObservers.length = 0;
    if (reflowTimer) {
      clearTimeout(reflowTimer);
      reflowTimer = null;
    }
  };

  const hasData = (chartDef, data) => {
    if (!data || !Array.isArray(data.series)) return false;
    if (DONUT_TYPES.includes(chartDef.type)) {
      return data.series.some(v => typeof v === 'number' && v > 0);
    }
    return data.series.some(s => (s.data || []).some(v => v > 0));
  };

  const buildOptions = (chartDef, data) => {
    const chart = { ...(chartDef.options?.chart || {}), type: chartDef.type, height: chartDef.height };
    if (DONUT_TYPES.includes(chartDef.type)) {
      const labels = data.categories && data.categories.length
        ? data.categories
        : (chartDef.options?.labels || []);
      return { ...(chartDef.options || {}), chart, labels, series: data.series };
    }
    return {
      ...(chartDef.options || {}),
      chart,
      series: data.series,
      xaxis: { ...(chartDef.options?.xaxis || {}), categories: data.categories }
    };
  };

  const renderEmptyCard = (chartDef) => {
    const card = document.createElement('div');
    card.className = 'apex-chart-card';
    const header = document.createElement('div');
    header.className = 'apex-chart-card-header';
    const title = document.createElement('span');
    title.className = 'apex-chart-card-title';
    title.textContent = chartDef.title || chartDef.id;
    header.appendChild(title);
    const container = document.createElement('div');
    container.className = 'apex-chart-container';
    container.innerHTML = `<p class="apex-charts-empty">${t('modules.apexCharts.noData')}</p>`;
    card.appendChild(header);
    card.appendChild(container);
    grid.appendChild(card);
  };

  const renderCard = (chartDef) => {
    const card = document.createElement('div');
    card.className = 'apex-chart-card';
    const header = document.createElement('div');
    header.className = 'apex-chart-card-header';
    const title = document.createElement('span');
    title.className = 'apex-chart-card-title';
    title.textContent = chartDef.title || chartDef.id;
    header.appendChild(title);
    const container = document.createElement('div');
    container.className = 'apex-chart-container';
    card.appendChild(header);
    card.appendChild(container);
    grid.appendChild(card);
    return container;
  };

  const loadChart = async (chartDef) => {
    if (!chartDef.id || !chartDef.type) return;

    const dataSource = chartDef.dataSource;
    if (dataSource && dataSource.method && typeof analytics[dataSource.method] === 'function') {
      const data = await analytics[dataSource.method](dataSource.params || {});
      if (!hasData(chartDef, data)) {
        renderEmptyCard(chartDef);
        return;
      }
      const container = renderCard(chartDef);
      const chart = new ApexCharts(container, buildOptions(chartDef, data));
      await chart.render();
      instances.push(chart);
      observeContainer(container);
    } else if (Array.isArray(chartDef.series) && chartDef.series.length > 0) {
      const categories = chartDef.options?.xaxis?.categories || [];
      const container = renderCard(chartDef);
      const chart = new ApexCharts(container, buildOptions(chartDef, { categories, series: chartDef.series }));
      await chart.render();
      instances.push(chart);
      observeContainer(container);
    } else {
      renderEmptyCard(chartDef);
    }
  };

  const renderAudience = async (audience) => {
    grid.innerHTML = '';
    destroyAll();
    const charts = chartsConfig.filter(c => (c.audience || 'admin') === audience);
    if (charts.length === 0) {
      grid.innerHTML = `<p class="apex-charts-empty">${t('modules.apexCharts.empty')}</p>`;
      return;
    }
    for (const chartDef of charts) {
      await loadChart(chartDef);
    }
    scheduleSettleReflow();
  };

  // --- Pestañas según rol ---
  const audiences = [...new Set(chartsConfig.map(c => c.audience || 'admin'))];
  const allowed = isAdmin ? new Set(['admin', 'resident']) : new Set(['resident']);
  const visibleAudiences = audiences.filter(a => allowed.has(a));
  const preferred = isAdmin ? 'admin' : 'resident';
  let activeAudience = visibleAudiences.includes(preferred) ? preferred : (visibleAudiences[0] || null);

  if (!activeAudience) {
    grid.innerHTML = `<p class="apex-charts-empty">${t('modules.apexCharts.empty')}</p>`;
    return () => {};
  }

  if (tabsEl && visibleAudiences.length > 1) {
    tabsEl.hidden = false;
    tabsEl.innerHTML = visibleAudiences
      .map(a => `
        <button type="button" class="apex-charts-tab${a === activeAudience ? ' is-active' : ''}" data-audience="${a}">
          ${t(`modules.apexCharts.tabs.${a}`)}
        </button>`)
      .join('');

    const onClick = (e) => {
      const btn = e.target.closest('.apex-charts-tab');
      if (!btn || btn.dataset.audience === activeAudience) return;
      activeAudience = btn.dataset.audience;
      tabsEl.querySelectorAll('.apex-charts-tab').forEach(b => b.classList.toggle('is-active', b === btn));
      renderAudience(btn.dataset.audience);
    };
    tabsEl.querySelectorAll('.apex-charts-tab').forEach(b => {
      b.addEventListener('click', onClick);
      tabListeners.push({ el: b, fn: onClick });
    });
  } else if (tabsEl) {
    tabsEl.hidden = true;
  }

  try {
    await renderAudience(activeAudience);
  } catch (error) {
    console.error('[apexCharts] Error al renderizar gráficos:', error);
    grid.innerHTML = `<p class="apex-charts-empty">${t('modules.apexCharts.renderError')}</p>`;
  }

  return () => {
    destroyAll();
    tabListeners.forEach(({ el, fn }) => el.removeEventListener('click', fn));
  };
}
