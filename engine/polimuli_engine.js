/* polimuli_engine.js
 * Мини-движок для полиарт-мультфильмов (Canvas 2D).
 * Без зависимостей. Предоставляет:
 *  - холст с автопультом размеров
 *  - «сценарный таймлайн»: сцены {'from','to','draw'}
 *  - системy частиц (эмодзи-спрайты, серый цвет по умолчанию)
 *  - эмодзи-спрайт-рендер (тень для «тёмных» сцен)
 *  - подпись-титры / прогресс-бар
 */

var Polimuli = (() => {
  function makeCanvas(id, W, H) {
    const cv = document.getElementById(id);
    if (!cv) return null;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    return { cv, ctx, W, H };
  }

  // Эмодзи можно рисовать либо <canvas> (если есть эмодзи-фонт), либо
  // заполнять стандартным emoji-шрифтом браузера.
  function drawEmoji(ctx, emoji, x, y, size, alignCenter = true) {
    ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  // Система частиц. Каждая частица: {x,y,vx,vy,life,maxLife,size,emoji|color,gravity}
  class Particles {
    constructor() { this.list = []; }
    spawn(o) {
      this.list.push({
        x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0,
        life: o.life || 1, maxLife: o.life || 1,
        size: o.size || 16, emoji: o.emoji || null,
        color: o.color || null, gravity: o.gravity || 0,
        alpha: o.alpha != null ? o.alpha : 1,
      });
    }
    burst(n, make) { for (let i = 0; i < n; i++) this.spawn(make(i)); }
    update(dt) {
      const alive = [];
      for (const p of this.list) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy += p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        alive.push(p);
      }
      this.list = alive;
    }
    draw(ctx) {
      for (const p of this.list) {
        const t = p.life / p.maxLife;
        const size = p.size * (0.6 + 0.4 * t);
        if (p.emoji) {
          ctx.globalAlpha = p.alpha * t;
          drawEmoji(ctx, p.emoji, p.x, p.y, size);
        } else {
          ctx.globalAlpha = p.alpha * t;
          ctx.fillStyle = p.color || '#ffffff';
          ctx.beginPath(); ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // Прогресс-бар + подпись текущей сцены (режиссёрская подсказка).
  function drawHUD(ctx, W, H, t, total, label, opts = {}) {
    if (opts.label) {
      ctx.font = `14px monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = opts.labelColor || 'rgba(255,255,255,0.85)';
      ctx.fillText(`🎬 ${label}`, 10, 8);
    }
    const bw = W - 20, bh = 4;
    const bx = 10, by = H - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = opts.barColor || 'rgba(255,255,255,0.8)';
    ctx.fillRect(bx, by, bw * Math.min(1, t / total), bh);
  }

  // Таймлайн: сцены со стартовым {from} и окончанием {to}.
  class Timeline {
    constructor(scenes) { this.scenes = scenes; }
    find(t) {
      for (const s of this.scenes) if (t >= s.from && t < s.to) return s;
      return null;
    }
  }

  return { makeCanvas, drawEmoji, Particles, drawHUD, Timeline };
})();
