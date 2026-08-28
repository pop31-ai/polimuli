/* polimuli_runtime.js
 * Интерпретатор формата POL (Poly Animation Language) поверх движка
 * polimuli_engine.js. Чистые данные -> живой Canvas.
 *
 * API:
 *   const ctrl = Polimuli.play(data, canvasIdOrEl);
 *   ctrl.pause(); ctrl.resume(); ctrl.stop();
 *
 * Плеер рисует: фон-акты с перетеканием цвета, акторы-эмодзи
 * (bob/sway/pulse/key/cycle), частицы, заголовок акта, HUD.
 */

var Polimuli = (() => {
  const base = (typeof Polimuli !== 'undefined' && Polimuli) || {};
  // ---------- helpers ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3
      ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToCss(rgb) {
    return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
  }
  function lerpColor(a, b, t) {
    const r1 = hexToRgb(a), r2 = hexToRgb(b);
    return rgbToCss(r1.map((c, i) => lerp(c, r2[i], t)));
  }

  // ---------- предобработка данных ----------
  function prep(data) {
    const acts = (data.acts || []).slice().sort((a, b) => a.at - b.at);
    const dur = data.meta && data.meta.dur ? data.meta.dur : 24;
    const actors = (data.actors || []).map(a => {
      const key = (a.key || a.acts || []).slice().sort((p, q) => p.at - q.at);
      return {
        id: a.id, emoji: a.emoji, x: a.x || 0, y: a.y || 0,
        size: a.size || 40, bob: a.bob, sway: a.sway,
        pulse: a.pulse, cycle: a.cycle, key, visible: a.visible,
      };
    });
    const fx = (data.particles || []).map(p => ({
      from: p.from, x: p.x, y: p.y, dx: p.dx || 0, dy: p.dy || 0,
      emoji: p.emoji, rate: p.rate != null ? p.rate : 0.05,
      vx: p.vx || 0, vy: p.vy != null ? p.vy : 0,
      life: p.life != null ? p.life : 1, size: p.size || 14,
      gravity: p.gravity || 0, alpha: p.alpha != null ? p.alpha : 1,
    }));
    return { data, acts, dur, actors, fx };
  }

  function atAct(acts, t) {
    let cur = null;
    for (const a of acts) if (t >= a.at) cur = a;
    return cur;
  }
  function nextAct(acts, t) {
    for (const a of acts) if (a.at > t) return a;
    return null;
  }

  // ключи: возвращает значение компонента `field` в момент t или null
  function keyVal(key, t, field, base) {
    if (!key.length) return null;
    if (t <= key[0].at && key[0][field] != null) return key[0][field];
    const last = key[key.length - 1];
    if (t >= last.at) return last[field] != null ? last[field] : null;
    for (let i = 0; i < key.length - 1; i++) {
      const a = key[i], b = key[i + 1];
      if (t >= a.at && t < b.at) {
        const f = a[field] != null ? a[field] : base;
        const g = b[field] != null ? b[field] : base;
        return lerp(f, g, (t - a.at) / Math.max(1e-6, b.at - a.at));
      }
    }
    return null;
  }

  // ---------- плеер ----------
  function play(data, id) {
    const P = prep(data);
    const CV = Polimuli.makeCanvas(id, data.canvas.w, data.canvas.h);
    if (!CV) throw new Error('canvas not found: ' + id);
    const ctx = CV.ctx, W = CV.W, H = CV.H;
    const Parts = new Polimuli.Particles();
    const st = P.data.style || {};
    const caption = st.caption || {};
    const hud = st.hud || {};

    const ctrl = { running: true, _t: 0, _start: null };

    function actorPos(a, t) {
      let x = keyVal(a.key, t, 'x', a.x);
      if (x == null) x = a.x;
      let y = keyVal(a.key, t, 'y', a.y);
      if (y == null) y = a.y;
      let size = keyVal(a.key, t, 'size', a.size);
      if (size == null) size = a.size;
      if (a.sway) x += Math.sin(t * a.sway.speed) * a.sway.amp;
      if (a.bob) y += Math.sin(t * a.bob.speed) * a.bob.amp;
      if (a.pulse) { const k = 1 + Math.sin(t * a.pulse.speed) * a.pulse.amp; size *= k; }
      return { x, y, size };
    }
    function actorEmoji(a, t) {
      if (!a.cycle) return a.emoji;
      const arr = a.cycle.emojis;
      return arr[Math.floor(t / a.cycle.period) % arr.length];
    }

    function drawBg(t) {
      const cur = atAct(P.acts, t);
      const nxt = nextAct(P.acts, t);
      const curBg = cur && cur.bg;
      const nxtBg = nxt && nxt.bg;
      if (!curBg && !nxtBg) {
        ctx.fillStyle = '#10151f';
        ctx.fillRect(0, 0, W, H);
        return;
      }
      let k = 0;
      if (curBg && nxtBg && nxt) {
        const span = Math.max(1, nxt.at - cur.at);
        k = clamp((t - cur.at) / span, 0, 1);
      }
      const top = nxtBg && curBg ? lerpColor(curBg.top, nxtBg.top, k)
                : (curBg ? curBg.top : nxtBg.top);
      const bottom = nxtBg && curBg ? lerpColor(curBg.bottom, nxtBg.bottom, k)
                   : (curBg ? curBg.bottom : nxtBg.bottom);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    function drawActors(t) {
      for (const a of P.actors) {
        if (a.visible === false) continue;
        if (a.visible && typeof a.visible === 'object') {
          if (t < a.visible.from || t >= a.visible.to) continue;
        }
        const p = actorPos(a, t);
        Polimuli.drawEmoji(ctx, actorEmoji(a, t), p.x, p.y, p.size);
      }
    }

    function updateFx(t, dt) {
      for (const f of P.fx) {
        if (Math.random() > f.rate * dt) continue;
        let x = f.x, y = f.y;
        if (f.from) {
          const src = P.actors.find(a => a.id === f.from);
          if (src) { const p = actorPos(src, t); x = p.x; y = p.y; }
          else continue;
        }
        Parts.spawn({
          x: x + f.dx, y: y + f.dy, vx: f.vx, vy: f.vy,
          life: f.life, size: f.size, emoji: f.emoji,
          gravity: f.gravity, alpha: f.alpha,
        });
      }
      Parts.update(dt);
    }

    function drawCaption(t) {
      const cur = atAct(P.acts, t);
      if (!cur || !cur.text) return;
      ctx.font = `${caption.font || 24}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = caption.shadow || 'rgba(0,0,0,0.5)';
      ctx.fillText(cur.text, W / 2 + 2, 84 + 2);
      ctx.fillStyle = caption.color || '#f0ead8';
      ctx.fillText(cur.text, W / 2, 84);
    }

    function frame(now) {
      if (!ctrl.running) return;
      if (!ctrl._start) ctrl._start = now;
      let t = (now - ctrl._start) / 1000;
      if (t > P.dur && P.data.meta.loop !== false) t = t % P.dur;
      const dt = Math.min(0.05, Math.max(1e-4, t - ctrl._t));
      ctrl._t = t;

      ctx.clearRect(0, 0, W, H);
      drawBg(t);
      drawActors(t);
      updateFx(t, dt);
      Parts.draw(ctx);
      drawCaption(t);

      Polimuli.drawHUD(ctx, W, H, t, P.dur,
        P.data.meta.title + ' · ' + ((atAct(P.acts, t) || {}).text || ''),
        { labelColor: hud.labelColor, barColor: hud.barColor });

      ctrl._raf = requestAnimationFrame(frame);
    }

    ctrl.pause = () => { if (ctrl.running) { ctrl.running = false; cancelAnimationFrame(ctrl._raf); } };
    ctrl.resume = () => { if (!ctrl.running) { ctrl.running = true; ctrl._start = null; ctrl._raf = requestAnimationFrame(frame); } };
    ctrl.stop = () => { ctrl.running = false; cancelAnimationFrame(ctrl._raf); };

    // клик — пауза; повторный — продолжить
    CV.cv.addEventListener('click', () => {
      if (ctrl.running) ctrl.pause(); else ctrl.resume();
    });

    ctrl._raf = requestAnimationFrame(frame);
    return ctrl;
  }

  return Object.assign(base, { play });
})();