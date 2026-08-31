#!/usr/bin/env node
/* polimuli_pack.js — упаковщик формата POL
 *
 * Node CLI (без зависимостей):
 *   node pack/polimuli_pack.js episodes/16_express_strela.pol [-o out.html]
 *   node pack/polimuli_pack.js <dir>            — упаковать все *.pol в папке
 *
 * Делает:
 *   1. валидацию данных по схеме POL v1
 *   2. сборку самодостаточного .html (движок+рантайм+данные инлайн, file://)
 * Коды выхода: 0 — ok, 1 — warning, 2 — error.
 */

const fs = require('fs');
const path = require('path');

const VERSION = 1;
const CRITICAL = ['format', 'version', 'meta', 'canvas', 'acts'];

// ---------- валидация ----------
function validate(data, file) {
  const problems = [];
  const warn = (m) => problems.push({ level: 'warn', m });
  const err = (m) => problems.push({ level: 'err', m });

  if (!data || typeof data !== 'object') return [{ level: 'err', m: 'данные не объект' }];
  if (data.format !== 'polimuli/pol') err('format !== "polimuli/pol"');
  if (data.version !== VERSION) err(`version !== ${VERSION}`);
  if (!data.meta || !data.meta.title) err('meta.title отсутствует');
  if (!data.canvas) err('canvas отсутствует');
  else {
    if (!(data.canvas.w > 0) || !(data.canvas.h > 0)) err('canvas.w/h должны быть >0');
  }
  if (!Array.isArray(data.acts) || data.acts.length < 1) err('acts пуст');
  else {
    let last = -1;
    data.acts.forEach((a, i) => {
      if (a.at == null) err(`acts[${i}].at отсутствует`);
      else if (a.at < last) warn(`acts не отсортированы по at (индекс ${i})`);
      last = a.at != null ? a.at : last;
      if (a.bg) {
        if (!a.bg.top || !a.bg.bottom) warn(`acts[${i}].bg требует top и bottom`);
      }
      if (a.board != null && !Array.isArray(a.board))
        warn(`acts[${i}].board должен быть массивом (строки или объекты-блоки)`);
      if (Array.isArray(a.board) && a.board.some(s =>
          typeof s !== 'string' && (typeof s !== 'object' || s == null || typeof s.t !== 'string')))
        warn(`acts[${i}].board содержит не строку и не объект-блок {t,...}`);
    });
  }

  const dur = data.meta && data.meta.dur ? data.meta.dur : 24;
  const ids = new Set((data.actors || []).map(a => a.id));

  (data.actors || []).forEach((a, i) => {
    if (!a.id) err(`actors[${i}].id отсутствует`);
    if (!a.emoji) warn(`actors[${i}] без emoji`);
    (a.key || a.acts || []).forEach((k, j) => {
      if (k.at != null && (k.at < 0 || k.at > dur + 0.001))
        warn(`actors[${i}].key[${j}].at вне метража`);
    });
    if (a.cycle) {
      if (!Array.isArray(a.cycle.emojis) || a.cycle.emojis.length < 1)
        err(`actors[${i}].cycle.emojis должен быть массивом`);
      if (!(a.cycle.period > 0)) warn(`actors[${i}].cycle.period >0`);
    }
  });

  (data.particles || []).forEach((p, i) => {
    if (p.from && !ids.has(p.from))
      warn(`particles[${i}].from ссылается на несуществующего актора "${p.from}"`);
  });

  return problems;
}

// ---------- сборка HTML ----------
function buildHtml(data) {
  const engine = fs.readFileSync(path.join(__dirname, '..', 'engine', 'polimuli_engine.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(__dirname, '..', 'engine', 'polimuli_runtime.js'), 'utf8');
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c').replace(/&/g, '\\u0026');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>POL · ${(data.meta && data.meta.title) || 'episode'}</title>
<style>
  body{background:#0b1220;color:#cfd8e3;margin:0;display:flex;flex-direction:column;align-items:center;
       font-family:"Segoe UI",Arial,sans-serif}
  .wrap{max-width:980px;width:100%;padding:16px}
  h1{font-size:18px;letter-spacing:2px;margin:0 0 4px}
  #info{color:#8fa3b9;font-size:13px;margin-bottom:10px}
  #stage canvas{width:100%;height:auto;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.55)}
  #err{color:#ffb3a0;background:#2a1216;border:1px solid #5a2430;border-radius:8px;padding:10px 14px;display:none}
</style>
</head>
<body>
<div class="wrap">
  <h1>▶ ${(data.meta && data.meta.title) || 'POL'}</h1>
  <div id="info">${(data.meta && data.meta.genre) || ''} · упаковано pack v${VERSION} · клик = пауза</div>
  <div id="err">⚠</div>
  <div id="stage"><canvas id="cv" width="${data.canvas.w}" height="${data.canvas.h}"></canvas></div>
</div>
<script>${engine}</script>
<script>${runtime}</script>
<script>
  window.__POL_DEMO__ = ${json};
</script>
<script>
  (function(){
    var c = Polimuli.play(window.__POL_DEMO__, 'cv');
    window.__pol_ctrl = c;
    document.addEventListener('keydown', function(e){
      if (e.key === ' '){ e.preventDefault(); if (c.running) c.pause(); else c.resume(); }
    });
  })();
</script>
</body>
</html>
`;
}

// ---------- CLI ----------
function summary(problems, file) {
  const es = problems.filter(p => p.level === 'err');
  const ws = problems.filter(p => p.level === 'warn');
  es.forEach(p => console.log('  ERR : ' + file + ' — ' + p.m));
  ws.forEach(p => console.log('  WARN: ' + file + ' — ' + p.m));
  return { es, ws };
}

function packOne(file, out) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('ERR  : ' + file + ' — не JSON: ' + e.message); process.exitCode = Math.max(process.exitCode || 0, 2); return; }

  const probs = validate(data, file);
  const s = summary(probs, file);
  if (s.es.length) { console.error('→ не упаковано: ' + file); process.exitCode = Math.max(process.exitCode || 0, 2); return; }

  const html = buildHtml(data);
  if (!out) out = file.replace(/\.pol$/i, '_packed.html');
  fs.writeFileSync(out, html);
  console.log('OK   : ' + file + ' → ' + out + (s.ws.length ? ' (' + s.ws.length + ' предупреждений)' : ''));
  if (s.ws.length) process.exitCode = Math.max(process.exitCode || 0, 1);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('использование: node pack/polimuli_pack.js file.pol [-o out.html] | node pack/polimuli_pack.js dir');
    return;
  }
  const first = args[0];
  const outIdx = args.indexOf('-o');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;

  let stat;
  try { stat = fs.statSync(first); } catch { console.error('нет файла: ' + first); process.exit(2); return; }

  if (stat.isDirectory()) {
    const files = fs.readdirSync(first).filter(f => f.endsWith('.pol'));
    if (!files.length) { console.error('нет *.pol в папке'); return; }
    files.forEach(f => packOne(path.join(first, f)));
  } else if (stat.isFile()) {
    packOne(first, out);
  }
}

main();