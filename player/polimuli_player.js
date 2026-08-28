/* polimuli_player.js
 * Загрузчик .pol в плеер: принимает данные из URL (?src= путь через fetch,
 * ?pol= закодированный JSON для file://) или встроенный демо-датасет.
 */

(function () {
  const query = new URLSearchParams(location.search);
  const DEMO = window.__POL_DEMO__ || null;

  async function fetchPol(src) {
    const candidates = [src];
    if (!/^(\/|https?:|\.{1,2}\/)/.test(src)) {
      candidates.push('/' + src, '../' + src);
    }
    for (const c of candidates) {
      try {
        const r = await fetch(c);
        if (r.ok) return await r.json();
      } catch (e) { /* пробуем следующий кандидат */ }
    }
    throw new Error('fetch failed: ' + src);
  }

  async function loadData() {
    const src = query.get('src');
    if (src) return fetchPol(src);
    const pol = query.get('pol');
    if (pol) return JSON.parse(decodeURIComponent(pol));
    if (DEMO) return DEMO;
    throw new Error('нет данных: укажи ?src=file.pol, ?pol=JSON или встрой __POL_DEMO__');
  }

  function boot(data) {
    if (!data || data.format !== 'polimuli/pol') {
      throw new Error('не формат pol: ' + (data && data.format));
    }
    const el = document.getElementById('stage');
    el.innerHTML = '<canvas id="cv" width="' + data.canvas.w + '" height="' +
      data.canvas.h + '"></canvas>';
    const c = Polimuli.play(data, 'cv');
    window.__pol_ctrl = c;
    document.title = 'POL · ' + (data.meta.title || data.meta.id);
    const info = document.getElementById('info');
    if (info) {
      info.textContent = 'POL v' + data.version + ' · ' + (data.meta.title || '');
    }
  }

  function fail(msg) {
    const el = document.getElementById('error');
    if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
  }

  window.addEventListener('DOMContentLoaded', () => {
    loadData().then(boot, (e) => fail(e.message));
  });
})();