/* polimuli_semestr_player.js
 * Семестровый плеер: ведёт поток по модулям курса (последовательность),
 * играет полиарт-уроки по графику, отслеживает прогресс в localStorage.
 *
 * Параметры:
 *   ?course=<id>        — id курса (например matematika-inzhener)
 *   Используются данные из courses/<course>/semestr.json:
 *   { meta:{ id,title,weeks,after }, modules:[ { id,title,weeks,src } ] }
 */

(function () {
  const q = new URLSearchParams(location.search);
  const course = q.get('course') || 'matematika-inzhener';
  const LS_KEY = 'polimuli-semestr-' + course;

  let data = null;        // semestr.json
  let seq = [];           // модули
  let idx = 0;            // текущий модуль
  let ctrl = null;        // текущий ctrl плейера
  let tmr = null;         // таймер автоперехода
  const state = loadState();

  const $ = id => document.getElementById(id);

  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  async function fetchJson(src) {
    const candidates = [src];
    if (!/^(\/|https?:|\.{1,2}\/)/.test(src)) {
      candidates.push('/' + src, '../' + src);
    }
    for (const c of candidates) {
      try {
        const r = await fetch(c);
        if (r.ok) return await r.json();
      } catch (e) {}
    }
    throw new Error('fetch failed: ' + src);
  }

  // ---------- рендер списка модулей ----------
  function renderMods() {
    const box = $('mods');
    box.innerHTML = '';
    seq.forEach((m, i) => {
      const div = document.createElement('div');
      div.className = 'mod' + (i === idx ? ' active' : '') +
        (state.done && state.done.indexOf(m.id) >= 0 ? ' done' : '');
      const status = i === idx ? '▶ текущая' :
        (state.done && state.done.indexOf(m.id) >= 0 ? '✓ пройдено' : '→ доступно');
      div.innerHTML =
        '<div class="num">' + String(i + 1).padStart(2, '0') + '</div>' +
        '<div class="tinfo"><div class="ttl">' + m.title + '</div>' +
        '<div class="wk">' + m.weeks + '</div></div>' +
        '<div class="st">' + status + '</div>';
      div.addEventListener('click', () => select(i));
      box.appendChild(div);
    });
  }

  function renderProg() {
    $('course').textContent = (data.meta.emoji || '') + ' ' + data.meta.title +
      ' · по графику, неделя ' + (idx + 1) + ' из ' + seq.length;
    const pct = Math.round((idx + 1) / seq.length * 100);
    $('progfill').style.width = pct + '%';
    $('proglabel').textContent =
      'Модуль ' + (idx + 1) + '/' + seq.length + ' · ' + seq[idx].weeks +
      (ctrl && ctrl.running ? ' · играется лекция' : ' · пауза');
  }

  // ---------- играть модуль ----------
  async function playModule(m) {
    stopPlay();
    const d = await fetchJson(m.src);
    if (!d || d.format !== 'polimuli/pol') throw new Error('не формат pol: ' + m.src);
    const cv = $('cv');
    cv.width = d.canvas.w; cv.height = d.canvas.h;
    ctrl = Polimuli.play(d, 'cv');
    setPlayBtn(false);
    scheduleNext(m);
  }

  function scheduleNext(m) {
    clearTimeout(tmr);
    const dur = (data.meta.after || 2) * 1000 + (m.dur || 24) * 1000;
    tmr = setTimeout(() => {
      if ($('auto').checked && idx < seq.length - 1) step(1);
    }, dur);
  }

  // ---------- управление ----------
  function stopPlay() {
    clearTimeout(tmr);
    if (ctrl) { try { ctrl.stop(); } catch (e) {} ctrl = null; }
  }
  function setPlayBtn(running) {
    $('bPlay').textContent = ctrl && !ctrl.running ? '▶ играть' : '⏸ пауза';
  }

  function step(d) {
    const ni = idx + d;
    if (ni < 0 || ni >= seq.length) return;
    select(ni);
  }

  async function select(i) {
    idx = i;
    state.done = state.done || [];
    if (state.done.indexOf(seq[idx].id) < 0) state.done.push(seq[idx].id);
    saveState();
    renderMods();
    try {
      await playModule(seq[idx]);
    } catch (e) { fail(e.message); }
    renderProg();
  }

  function fail(msg) {
    const el = $('err');
    el.textContent = '⚠ ' + msg; el.style.display = 'block';
  }

  function bind() {
    $('bPrev').addEventListener('click', () => step(-1));
    $('bNext').addEventListener('click', () => step(1));
    $('bPlay').addEventListener('click', () => {
      if (!ctrl) return;
      if (ctrl.running) { ctrl.pause(); setPlayBtn(); }
      else { ctrl.resume(); setPlayBtn(false); }
    });
  }

  // ---------- запуск ----------
  window.addEventListener('DOMContentLoaded', async () => {
    bind();
    try {
      data = await fetchJson('courses/' + course + '/semestr.json');
      seq = (data.modules || []).slice();
      if (!seq.length) throw new Error('нет модулей в semestr.json');
      const last = state.current != null ? state.current : 0;
      idx = Math.max(0, Math.min(last, seq.length - 1));
      renderMods();
      await select(idx);
    } catch (e) { fail(e.message); }
  });
})();