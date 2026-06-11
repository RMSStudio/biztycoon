'use strict';
// ══════════════════════════════════════════════════════
//  BizTycoon v2.4 — LC Lifecycle Test Harness (sim2-lc)
//  Прогоняет ТОЛЬКО lifecycle-проекты (_lifecycleTest) через
//  реальный движок + projects.js. Fake-DOM с реестром элементов —
//  бот «кликает» кнопки решений в lc-modal как игрок.
//
//  Запуск:  node sim/sim2-lc.js [runs=10]
// ══════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const RUNS = parseInt(process.argv[2] || '10', 10);

// ── Fake DOM с реестром: один элемент на id, живой children ──
function makeClassList(el) {
  const set = new Set();
  return {
    add: c => set.add(c),
    remove: c => set.delete(c),
    toggle: c => set.has(c) ? set.delete(c) : set.add(c),
    contains: c => set.has(c),
  };
}
function makeEl(id) {
  const el = {
    id: id || '', textContent: '', value: '', className: '',
    style: {}, dataset: {}, children: [], disabled: false, onclick: null,
    appendChild(c){ this.children.push(c); return c; },
    removeChild(c){ this.children = this.children.filter(x => x !== c); },
    remove(){}, insertBefore(c){ this.children.push(c); return c; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){ if (this.onclick) this.onclick(); },
    getBoundingClientRect(){ return { top:0,left:0,width:0,height:0 }; },
    scrollIntoView(){},
  };
  el.classList = makeClassList(el);
  // innerHTML-присвоение очищает детей (модалки делают innerHTML='' перед пересборкой)
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get(){ return _html; },
    set(v){ _html = v; el.children.length = 0; },
  });
  return el;
}
const REGISTRY = new Map();
const byId = id => { if (!REGISTRY.has(id)) REGISTRY.set(id, makeEl(id)); return REGISTRY.get(id); };
const fakeDocument = {
  getElementById: byId,
  createElement: () => makeEl(),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  body: makeEl('body'),
  addEventListener(){}, removeEventListener(){},
};

// ── Sandbox ───────────────────────────────────────────
const sandbox = {
  console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
  document: fakeDocument,
  localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  navigator: {},
  renderPortfolioTab(){},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.REGISTRY = REGISTRY;   // нужен боту для сброса модалок между ранами
vm.createContext(sandbox);

// ── Загрузка движка + projects.js (lifecycle) ─────────
const FILES = [
  'src/constants.js',
  'src/events.js',
  'scenarios/agency.js',
  'src/engine.js',
  'src/projects.js',
  'src/staff.js',
];
const engineSrc = FILES
  .map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n;\n');

const BOT_SRC = String.raw`
// ───────────────────────────────────────────────────────
//  LC BOT
// ───────────────────────────────────────────────────────
const __SETTINGS = SCENARIO.settings;
const __SPEC_IDS = Object.keys(SPECS);

let __run = null;

EventBus.on('end_game', ({ won }) => { if (__run) { __run.ended = true; __run.won = won; } });

// Обычные события движка (скидка/уход/алгоритм) — решаем как в sim2
EventBus.on('show_event', ({ ev }) => {
  if (!ev || !ev.choices || !ev.choices.length) return;
  let idx = 0;
  if (ev.title === 'Превышен лимит проектов') idx = 0;
  else if (ev.id === 'quit') idx = G.money > 500000 ? 0 : 1;
  else idx = G.money > 300000 ? 0 : ev.choices.length - 1;
  const ch = ev.choices[Math.min(idx, ev.choices.length - 1)];
  try { ch.fn(G); } catch (e) { __run && __run.errors.push('event:' + (ev.id||ev.title) + ': ' + e.message); }
  if (__run && !__run.ended) {
    if (G.money <= 0) { __run.ended = true; __run.won = false; }
    else if (G.money >= __SETTINGS.winCondition) { __run.ended = true; __run.won = true; }
  }
});

// ── Насос LC-модалок: «кликаем» решения пока модалка открыта ──
const lcModal   = document.getElementById('lc-modal');
const lcChoices = document.getElementById('lc-modal-choices');

function pumpLCModal(tag) {
  let guard = 40;
  while (lcModal.classList.contains('active') && guard-- > 0) {
    const btns = lcChoices.children.filter(b => b.onclick && !b.disabled);
    if (!btns.length) {
      __run.errors.push('SOFTLOCK[' + tag + ']: модалка активна, нет доступных кнопок (' +
        document.getElementById('lc-modal-title').textContent + ')');
      lcModal.classList.remove('active');
      break;
    }
    // Политика: не «Отказаться»; сначала приоритетные ходы (команда, кэш),
    // затем highlight, иначе случайный валидный
    const safe = btns.filter(b => !(b.innerHTML||'').includes('Отказаться от проекта'));
    const cand = safe.length ? safe : btns;
    const PRIORITY = ['Назначить всю команду', 'Аванс 30%'];
    let btn = null;
    for (const p of PRIORITY) { btn = cand.find(b => (b.innerHTML||'').includes(p)); if (btn) break; }
    if (!btn) btn = cand.find(b => (b.style.cssText||'').includes('45,212,191')); // highlight teal
    if (!btn) btn = cand[Math.floor(Math.random() * cand.length)];
    const title = document.getElementById('lc-modal-title').textContent;
    const label = ((btn.innerHTML.match(/choice-title">([^<]*)</)||[])[1] || '?').trim();
    __run.decisions.push({ m: G.month, modal: title, pick: label });
    try { btn.onclick(); } catch (e) {
      __run.errors.push('CLICK[' + tag + '] «' + title + '» → «' + label + '»: ' + e.message);
      lcModal.classList.remove('active');
      break;
    }
  }
  if (guard <= 0) {
    __run.errors.push('PUMP-LIMIT[' + tag + ']: 40 кликов, модалка не закрылась');
    lcModal.classList.remove('active');
  }
}

// ── Найм: до 3 спецов, приоритет WU/цена ──────────────
function lcHire() {
  const team = G.staff.filter(s => s.status !== 'fired');
  const target = 3;
  if (team.length >= target) return;
  const burn = getTotalStaffCost() + (SCENARIO.settings.overhead||0);
  if (G.money < Math.max(300000, burn * 3)) return;
  if (!(G.candidatePool||[]).length) scoutCandidates('free');
  const pool = [...(G.candidatePool||[])];
  pool.sort((a,b) =>
    (calcStaffWorkUnit(b)/(b.salaryAsk||1)) - (calcStaffWorkUnit(a)/(a.salaryAsk||1)));
  if (pool.length) hireCandidate(pool[0].uid || pool[0].id, pool[0].salaryAsk);
}

// ── Помесячная жадная расстановка по дефициту мощности ──
function lcAssign() {
  const regular = (G.activeClients||[]).filter(c =>
    c._lcPhase && c._lcPhase.startsWith('work_'));
  if (!regular.length) return;
  G.staff.filter(s => s.status !== 'fired').forEach(s => unassignStaff(s._iid || s.id));
  const free = G.staff.filter(s => s.status !== 'fired')
    .sort((a,b) => calcStaffWorkUnit(b) - calcStaffWorkUnit(a));
  for (const s of free) {
    let best = null, bestGap = -Infinity;
    for (const c of regular) {
      const gap = getProjectLoad(c) - getProjectThroughput(c);
      if (gap > bestGap) { bestGap = gap; best = c; }
    }
    if (!best || bestGap <= 0) break;
    assignStaffToProject(s._iid || s.id, best.id);
  }
}

// ── Снапшот LC-стейта для отчёта по завершённым ───────
function snapshotLC() {
  const snap = {};
  (G.activeClients||[]).forEach(c => {
    if (!c._lcChain) return;
    snap[c.id] = {
      name: c.name, defId: (c.id||'').replace(/_\d+$/,''), tier: c.tier,
      mood: Math.round(c._lcClientMood||0), risk: Math.round(c._lcRisk||0),
      qBonus: Math.round(c._lcQualityBonus||0), revisions: c._lcRevisionCount||0,
      signedM: c.id.split('_').pop()|0, budget: c._totalBudget||0,
      phase: c._lcPhase, decisions: (c._lcHistory||[]).length,
    };
  });
  return snap;
}

function runGame(runIdx) {
  __run = { ended:false, won:false, errors:[], decisions:[], projects:[] };
  REGISTRY.forEach(el => { el.children.length = 0; el.classList.remove('active'); });

  initState();
  selectSpec(__SPEC_IDS[runIdx % __SPEC_IDS.length]);
  startGame();

  let safety = 60;
  while (!__run.ended && G.month < 36 && safety-- > 0) {
    lcHire();

    // 1) Ожидающие work-события — открываем и решаем
    (G.activeClients||[]).filter(c => c._lcPendingDecision).forEach(c => {
      Projects.resolveWorkEvent(c.id);
      pumpLCModal('work-event');
    });

    // 2) Подписываем LC-проекты — до 2 параллельно (как у игрока с capacity 2)
    while (!__run.ended && (G.activeClients||[]).length < Math.min(2, getCapacity())) {
      doLifecycleScouting();
      const pool = (G.scoutPool||[]).filter(p =>
        !(G.activeClients||[]).find(c => c.id.startsWith(p.id)));
      if (!pool.length) { G.scoutPool = null; break; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const before = snapshotLC();
      signProject(pick.id);
      pumpLCModal('sign-chain');           // proposal → … → planning
      if (G.money <= 0) { __run.ended = true; break; }
    }
    if (__run.ended) break;

    // 2б) Помесячная жадная расстановка по всем work-проектам
    // (закрывает и quick-цепочку без планирования, и перекосы после
    // «Назначить всю команду» на втором проекте)
    lcAssign();

    // 2в) Поддержка настроения: «Промежуточный показ» при просевшем mood
    // (заодно валидирует фикс зеркала mood→clientNPS)
    (G.activeClients||[]).forEach(c => {
      if (!c._lcPhase || !c._lcPhase.startsWith('work_')) return;
      if ((c._lcClientMood ?? 60) < 55 && G.money > 60000) {
        const before = c._lcClientMood ?? 60;
        Projects.triggerPlayerAction(c.id, 'interim_demo');
        const after = c._lcClientMood ?? 60;
        if (after > before && Math.round(G.clientNPS[c.id]) !== Math.round(after)) {
          __run.errors.push('MIRROR-FAIL: mood ' + after + ' но clientNPS ' + G.clientNPS[c.id]);
        }
      }
    });

    // 3) Снапшот до хода (для отчёта по завершающимся)
    const snap = snapshotLC();
    const doneBefore = (G.completedProjects||[]).length;

    // 4) Ход
    advanceMonth();
    pumpLCModal('post-month');             // ревью / делайвери модалки

    // 5) Завершённые за месяц — собираем метрики
    const done = (G.completedProjects||[]).slice(doneBefore);
    done.forEach(d => {
      const s = snap[d.id] || {};
      __run.projects.push({
        defId: s.defId || (d.id||'').replace(/_\d+$/,''), name: d.name,
        churned: !!d.failed,                       // ушёл по старому NPS-каналу, выплаты нет
        signedM: s.signedM ?? null, doneM: d.monthCompleted,
        months: s.signedM != null ? d.monthCompleted - s.signedM : null,
        revenue: d.failed ? 0 : (d.revenue||0),    // у churn-записи revenue = справочное поле дефиниции
        nps: d.finalNPS, phase: s.phase,
        mood: s.mood, risk: s.risk, revisions: s.revisions||0, decisions: s.decisions||0,
      });
    });
  }

  return {
    run: runIdx + 1,
    spec: G.spec,
    won: __run.won || G.money >= __SETTINGS.winCondition,
    bankrupt: __run.ended && !__run.won && G.money <= 0,
    months: G.month,
    finalMoney: Math.round(G.money),
    staff: G.staff.filter(s=>s.status!=='fired').length,
    rep: Math.round(G.reputation),
    completed: __run.projects,
    nDecisions: __run.decisions.length,
    errors: __run.errors,
    sampleDecisions: __run.decisions.slice(0, 14),
  };
}

const all = [];
for (let i = 0; i < __RUNS; i++) all.push(runGame(i));
__RESULTS.push(...all);
`;

// ── What-if: --lc-shield — LC-проекты исключаются из старого NPS-канала ──
// (у них собственная оценка клиента _lcClientMood; гипотеза — старый
//  updateAllNPS-churn должен на них не действовать)
const LC_SHIELD = process.argv.includes('--lc-shield');
const SHIELD_PATCH = String.raw`
const __origUpdateAllNPS = updateAllNPS;
updateAllNPS = function() {
  const lc = (G.activeClients||[]).filter(c => c._lcChain);
  G.activeClients = (G.activeClients||[]).filter(c => !c._lcChain);
  try { __origUpdateAllNPS(); } finally { G.activeClients = G.activeClients.concat(lc); }
};
`;

sandbox.__RUNS = RUNS;
sandbox.__RESULTS = [];

try {
  vm.runInContext(engineSrc + (LC_SHIELD ? '\n;\n' + SHIELD_PATCH : '') + '\n;\n' + BOT_SRC, sandbox, { filename: 'sim2lc-bundle.js' });
} catch (e) {
  console.error('💥 Ошибка LC-симуляции:', e);
  process.exit(1);
}

// ── Отчёт ─────────────────────────────────────────────
const results = sandbox.__RESULTS;
const fmtK = n => Math.abs(n) >= 1e6 ? (n/1e6).toFixed(2)+'M' : Math.round(n/1000)+'K';

console.log('\n══════════════════════════════════════════════════════════════════════════════');
console.log(`  BizTycoon v2.4 — LC LIFECYCLE TEST · ${RUNS} прогонов · только _lifecycleTest-проекты${LC_SHIELD ? ' · [LC-SHIELD: старый NPS-канал отключён]' : ''}`);
console.log('══════════════════════════════════════════════════════════════════════════════');

results.forEach(r => {
  const status = r.won ? '🏆 победа' : r.bankrupt ? '💀 банкрот' : '⏰ таймаут';
  console.log(`\n#${r.run} [${r.spec}] ${status} M${r.months} · финал ${fmtK(r.finalMoney)} · реп ${r.rep} · решений за ран: ${r.nDecisions}`);
  if (r.completed.length) {
    r.completed.forEach(p => {
      if (p.churned) {
        console.log(`   💔 ${p.name} · M${p.signedM}→M${p.doneM} · УШЁЛ (NPS ${p.nps}, фаза ${p.phase||'?'}) · выплата 0`);
      } else {
        console.log(`   ✔ ${p.name} · M${p.signedM}→M${p.doneM} (${p.months} мес.) · +${fmtK(p.revenue)} · NPS ${p.nps}` +
          ` · mood ${p.mood} · risk ${p.risk} · правок ${p.revisions}`);
      }
    });
  } else {
    console.log('   (ни один LC-проект не завершён)');
  }
  if (r.errors.length) r.errors.forEach(e => console.log(`   ⚠ ${e}`));
});

// Сводка по типам проектов
console.log('\n──────────────────────────────────────────────────────────────────────────────');
const flat = results.flatMap(r => r.completed);
['lc_simple','lc_full','lc_risky'].forEach(id => {
  const ps   = flat.filter(p => p.defId === id);
  if (!ps.length) { console.log(`▸ ${id}: завершений нет`); return; }
  const ok   = ps.filter(p => !p.churned);
  const ch   = ps.filter(p => p.churned);
  const avg  = (a,k) => a.length ? Math.round(a.reduce((s,p)=>s+(p[k]||0),0)/a.length) : 0;
  console.log(`▸ ${id.padEnd(10)} сдано ${ok.length} / ушло ${ch.length}` +
    (ok.length ? ` · сданные: ${avg(ok,'months')} мес., +${fmtK(avg(ok,'revenue'))}, NPS ${avg(ok,'nps')}, правок ${(ok.reduce((s,p)=>s+p.revisions,0)/ok.length).toFixed(1)}` : '') +
    (ch.length ? ` · ушедшие гибнут к M${avg(ch,'doneM')}` : ''));
});

const totErr = results.flatMap(r => r.errors);
const delivered = flat.filter(p=>!p.churned).length, churned = flat.filter(p=>p.churned).length;
console.log(`\nИТОГО: сдано ${delivered} · ушло по NPS ${churned} · ошибок/софтлоков: ${totErr.length}`);
const errCounts = {};
totErr.forEach(e => { const k = e.slice(0, 60); errCounts[k] = (errCounts[k]||0)+1; });
Object.entries(errCounts).slice(0, 8).forEach(([k,n]) => console.log(`  ⚠ ×${n} ${k}`));

// Пример цепочки решений первого рана
if (results[0] && results[0].sampleDecisions.length) {
  console.log('\nПример решений (ран #1):');
  results[0].sampleDecisions.forEach(d => console.log(`  M${d.m} «${d.modal}» → ${d.pick}`));
}
console.log('');
