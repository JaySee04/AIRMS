/* AIRMS — Chart.js helpers with theme-aware defaults */
(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function palette() {
    return [
      cssVar('--chart-1') || '#173d63',
      cssVar('--chart-2') || '#c89b3c',
      cssVar('--chart-3') || '#3d7c47',
      cssVar('--chart-4') || '#b03030',
      cssVar('--chart-5') || '#6b5b95',
      cssVar('--chart-6') || '#2a8e9e'
    ];
  }
  function gridCol() { return cssVar('--border'); }
  function textCol() { return cssVar('--text-muted'); }

  function applyDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = textCol();
    Chart.defaults.borderColor = gridCol();
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 14;
  }

  // Re-render charts when theme toggles
  const charts = [];
  function register(c) { charts.push(c); }
  function refreshAll() {
    applyDefaults();
    charts.forEach(c => {
      c.options.scales = c.options.scales || {};
      Object.values(c.options.scales).forEach(s => {
        if (s.ticks) s.ticks.color = textCol();
        if (s.grid) s.grid.color = gridCol();
      });
      if (c.options.plugins && c.options.plugins.legend && c.options.plugins.legend.labels)
        c.options.plugins.legend.labels.color = textCol();
      c.update();
    });
  }
  // Observe theme changes
  const observer = new MutationObserver(() => refreshAll());
  document.addEventListener('DOMContentLoaded', () => {
    applyDefaults();
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  });

  window.AIRMS_CHARTS = {
    palette, register, applyDefaults,
    // ACWR colour for a value
    acwrColor(v) {
      if (v < 0.8 || v > 1.5) return cssVar('--risk-high') || '#b03030';
      if (v < 1.0 || v > 1.3) return cssVar('--risk-mod') || '#c89b3c';
      return cssVar('--risk-low') || '#3d7c47';
    },
    riskLevel(v) {
      if (v < 0.8 || v > 1.5) return { level: 'High', cls: 'high' };
      if (v < 1.0 || v > 1.3) return { level: 'Moderate', cls: 'mod' };
      return { level: 'Low', cls: 'low' };
    }
  };
})();
