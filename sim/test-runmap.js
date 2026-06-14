'use strict';
// ══════════════════════════════════════════════════════
//  Тест карты рана (src/runmap.js)
//  Проверяем:
//   - модуль грузится при включённом DLC и регистрирует API
//   - стартовый этап = Гараж, всего этапов 5
//   - на границе monthEnd выскакивает milestone с 3 бонусами
//   - выбор бонуса применяет эффект к G и продвигает этап
//   - milestone не дублируется при повторных тиках того же месяца
//   - финальный этап (endgame) больше не показывает milestone
//   - G.runMap переносится через snapshot (саунд _restore)
//   - без DLC roguelite модуль не активируется
//   - hard kill-switch RUN_MAP_ENABLED=false выключает
// ══════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');

function makeClassList() {
  const set = new Set();
  return {
    add: c => set.add(c), remove: c => set.delete(c),
    toggle: c => set.has(c) ? set.delete(c) : set.add(c),
    contains: c => set.has(c),
  };
}
function makeEl(id) {
  const el = {
    id: id || '', textContent: '', value: '', className: '', title: '',
    style: {}, dataset: {}, children: [], disabled: false, onclick: null,
    appendChild(c){ this.children.push(c); return c; },
    removeChild(c){ this.children = this.children.filter(x => x !== c); },
    remove(){}, insertBefore(c){ this.children.push(c); return c; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){ if (this.onclick) this.onclick(); },
    getBoundingClientRect(){ return {top:0,left:0,width:0,height:0}; },
    scrollIntoView(){},
  };
  el.classList = makeClassList();
  let _html = '';
  Object.defineProperty(el, 'innerHTML', { get(){ return _html; }, set(v){ _html = v; el.children.length = 0; } });
  return el;
}
const REGISTRY = new Map();
const byId = id => { if (!REGISTRY.has(id)) REGISTRY.set(id, makeEl(id)); return REGISTRY.get(id); };
const fakeDocument = {
  getElementById: byId,
  createElement: () => makeEl(),
  querySelector(sel) { if (sel === '.game-header .game-logo') return byId('__game-logo'); return makeEl(); },
  querySelectorAll: () => [],
  body: makeEl('body'),
  addEventListener(){}, removeEventListener(){},
};

function makeSandbox(opts) {
  opts = opts || {};
  REGISTRY.clear();
  const _fakeLS = opts.noRoguelite
    ? {}
    : { 'bt_enabled_dlcs_v1': JSON.stringify(['roguelite']) };
  const sb = {
    console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
    document: fakeDocument,
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(_fakeLS, k) ? _fakeLS[k] : null; },
      setItem(k, v){ _fakeLS[k] = String(v); },
      removeItem(k){ delete _fakeLS[k]; },
    },
    navigator: {},
    renderPortfolioTab(){},
    __TR: { pass: 0, fail: 0, log: [] },
  };
  sb.window = sb; sb.globalThis = sb;
  return sb;
}

function loadEngineSrc(opts) {
  opts = opts || {};
  const scenarioFile = opts.scenario === 'bank' ? 'scenarios/bank.data.js' : 'scenarios/agency.data.js';
  const FILES = [
    'src/constants.js', 'src/events.js',
    scenarioFile, 'src/scenario-loader.js',
    'src/engine.js', 'src/projects.js', 'src/staff.js',
  ];
  let src = FILES
    .map(f => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  let rm = fs.readFileSync(path.join(ROOT, 'src/runmap.js'), 'utf8');
  if (opts.killSwitch) rm = rm.replace('const RUN_MAP_ENABLED = true;', 'const RUN_MAP_ENABLED = false;');
  src += '\n;\n// ===== src/runmap.js =====\n' + rm;
  return src;
}

const HARNESS = String.raw`
function _ok(c, m) { if (c) { __TR.pass++; __TR.log.push('✅ ' + m); } else { __TR.fail++; __TR.log.push('❌ ' + m); } }
function _eq(a, b, m) { _ok(a === b, m + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')'); }
var __lastEv = null;
EventBus.on('show_event', function (p) { __lastEv = p.ev; });
function _pickChoice(idx) {
  if (!__lastEv) throw new Error('show_event ещё не выстрелил');
  const ch = (__lastEv.choices || [])[idx];
  if (!ch || typeof ch.fn !== 'function') throw new Error('choice без fn (idx=' + idx + ')');
  ch.fn(G);
  __lastEv = null;
}
`;

function run(name, body, opts) {
  opts = opts || {};
  const sb = makeSandbox({ noRoguelite: opts.noRoguelite });
  const src = loadEngineSrc(opts) + '\n;\n' + HARNESS + '\n;\n' + body;
  vm.createContext(sb);
  try { vm.runInContext(src, sb); }
  catch (e) { console.log('💥 [' + name + ']:', e.message); sb.__TR.fail++; }
  console.log('── ' + name + ' ──');
  sb.__TR.log.forEach(l => console.log(l));
  return sb.__TR;
}

const totals = { pass: 0, fail: 0 };
function add(r) { totals.pass += r.pass; totals.fail += r.fail; }

// ── 1: API доступно, этапы и бонусы ──
// С v3.15 этапы и бонусы вынесены в данные сценария (Тип C).
// Сценарий agency имеет свои id: studio_garage..studio_endgame.
add(run('Тест 1: модуль активирован, API доступно', `
_ok(typeof RunMap === 'object', 'window.RunMap объявлен');
_ok(typeof RunMap.getStages === 'function', 'RunMap.getStages есть');
const stages = RunMap.getStages();
_eq(stages.length, 5, 'в карте 5 этапов');
_eq(stages[0].id, 'studio_garage', 'первый этап agency = studio_garage');
_eq(stages[stages.length - 1].id, 'studio_endgame', 'последний agency = studio_endgame');
const bonuses = RunMap.getBonuses();
_ok(bonuses.length >= 10, 'пул бонусов ≥ 10 (' + bonuses.length + ')');
// Бонусы переехали с inline apply() на массив effects[] (DSL),
// чтобы данные сценария оставались чистым JSON (правило Godot-portability).
_ok(bonuses.every(b => Array.isArray(b.effects) && b.effects.length >= 1),
    'у каждого бонуса есть effects[] для applyOps');
`));

// ── 2: стартовый этап и пилюля ──
add(run('Тест 2: стартовый этап = первый этап, состояние инициализируется', `
initState(); selectSpec('smm'); startGame();
const cur = RunMap.getCurrent();
_eq(cur.id, 'studio_garage', 'на старте agency — этап studio_garage');
// G.runMap появляется после первого тика (advanceMonth)
advanceMonth();
_ok(G.runMap, 'G.runMap инициализирован');
_eq(G.runMap.stageIdx, 0, 'stageIdx = 0');
`));

// ── 3: milestone на границе monthEnd ──
add(run('Тест 3: на M6 (граница 1-го этапа) выстреливает milestone', `
initState(); selectSpec('smm'); startGame();
G.month = 6;
__lastEv = null;
advanceMonth();
_ok(__lastEv && __lastEv._runmap === true, 'выстрелил milestone-модал');
const stages = RunMap.getStages();
_ok((__lastEv.title || '').includes(stages[1].name), 'заголовок содержит название нового этапа (' + stages[1].name + ')');
_eq((__lastEv.choices || []).length, 3, 'ровно 3 варианта бонуса');
`));

// ── 4: выбор бонуса применяет эффект ──
add(run('Тест 4: выбор бонуса применяет эффект и продвигает этап', `
initState(); selectSpec('smm'); startGame();
G.month = 6;
advanceMonth();
const before = G.money;
// Берём первый бонус — какой бы он ни был, побочный эффект должен быть
const evRef = __lastEv;
_pickChoice(0);
_eq(G.runMap.stageIdx, 1, 'этап продвинулся на foothold');
_ok(G.runMap.choicesTaken.length === 1, 'выбор записан в choicesTaken');
// Какой-то G-канал должен был измениться (money/rep/perkPayoutMult/etc) — собирательная проверка
const changed = G.money !== before
  || G.reputation !== 60
  || (G.perkPayoutMult || 0) > 0
  || (G.runeOverheadBump || 0) !== 0
  || (G.caseQBonus || 0) > 0
  || (G.caseScoutBonus || 0) > 0
  || (G.caseRepBonus || 0) > 0
  || (G.speedUpgrades || 0) > 0
  || (G.perkPrepayBonus || 0) > 0
  || G.perkPenaltyShield === true
  || (G.portfolio || 0) > 0;
_ok(changed, 'хотя бы один G-канал изменился после применения бонуса');
`));

// ── 5: дубль milestone не выстреливает ──
add(run('Тест 5: повторные тики того же месяца не дублируют milestone', `
initState(); selectSpec('smm'); startGame();
G.month = 6;
advanceMonth();
const first = __lastEv;
_ok(first && first._runmap, 'первый тик: milestone выстрелил');
__lastEv = null;
// Повторный тик без выбора бонуса
G.month = 6;
RunMap._tick();
_ok(!__lastEv, 'повторный тик того же месяца — milestone НЕ дублируется');
`));

// ── 6: финальный этап не выкидывает milestone ──
add(run('Тест 6: финальный этап (endgame) — milestone больше не нужен', `
initState(); selectSpec('smm'); startGame();
advanceMonth();
// Проходим все этапы forced'ом
for (let i = 0; i < 4; i++) {
  _ok(RunMap.forceMilestone(), 'forceMilestone[' + i + '] вызвался');
  _pickChoice(0);
}
_eq(G.runMap.stageIdx, 4, 'дошли до endgame (idx=4)');
__lastEv = null;
G.month = 40;
advanceMonth();
_ok(!__lastEv || !__lastEv._runmap, 'на эндгейме milestone не выстреливает');
_ok(!RunMap.forceMilestone(), 'forceMilestone на эндгейме возвращает false');
`));

// ── 7: snapshot переносит G.runMap ──
add(run('Тест 7: G.runMap переносится через snapshot/restore', `
initState(); selectSpec('smm'); startGame();
G.month = 6; advanceMonth();
_pickChoice(0);
const snapshot = JSON.parse(JSON.stringify({ G: G, DECISIONS: DECISIONS }));
initState(); selectSpec('smm'); startGame();
_ok(!G.runMap || G.runMap.stageIdx === 0, 'после reset stageIdx=0');
Object.keys(snapshot.G).forEach(k => { G[k] = snapshot.G[k]; });
_eq(G.runMap.stageIdx, 1, 'после restore stageIdx=1');
`));

// ── 8: без DLC roguelite — модуль не активируется ──
add(run('Тест 8: без DLC roguelite — модуль не активируется', `
_ok(typeof RunMap === 'undefined', 'window.RunMap НЕ объявлен');
initState(); selectSpec('smm'); startGame();
__lastEv = null;
G.month = 6; advanceMonth();
_ok(!__lastEv || !__lastEv._runmap, 'milestone не выстреливает');
_ok(typeof G.runMap === 'undefined', 'G.runMap не появилась');
`, { noRoguelite: true }));

// ── 9: hard kill-switch ──
add(run('Тест 9: RUN_MAP_ENABLED=false — модуль выключен', `
_ok(typeof RunMap === 'undefined', 'window.RunMap НЕ объявлен (kill-switch)');
initState(); selectSpec('smm'); startGame();
G.month = 6; advanceMonth();
_ok(typeof G.runMap === 'undefined', 'G.runMap не появилась');
`, { killSwitch: true }));

// ── 10: bank-сценарий имеет свой тематический runMap (Тип C) ──
add(run('Тест 10: bank — свои этапы (bank_license..bank_topten) и тематические бонусы', `
_ok(typeof SCENARIO === 'object', 'SCENARIO загружен');
_eq(SCENARIO.id, 'bank', 'SCENARIO.id = bank');
_ok(SCENARIO.runMap && Array.isArray(SCENARIO.runMap.stages), 'SCENARIO.runMap.stages есть');
const stages = RunMap.getStages();
_eq(stages.length, 5, 'у банка 5 этапов');
_eq(stages[0].id, 'bank_license', 'первый этап = bank_license (Получили лицензию)');
_eq(stages[stages.length - 1].id, 'bank_topten', 'последний = bank_topten (Топ-10)');
const bonuses = RunMap.getBonuses();
// С v3.19 в банке 12 универсальных + 11 этап-эксклюзивов (license×2 + retail×2 + corp×2 + private×2 + topten×3) = 23.
_eq(bonuses.length, 23, 'у банка 12 универсальных + 11 этап-эксклюзивов = 23');
const ids = bonuses.map(b => b.id);
_ok(ids.includes('deposit_base'), 'есть deposit_base (Депозитная база)');
_ok(ids.includes('scoring'),      'есть scoring (Скоринг-модель)');
_ok(ids.includes('regulator'),    'есть regulator (Лобби в регуляторе)');
_ok(!ids.includes('cash'),        'нет агентского cash — банк свой пул');
// Этап-эксклюзивы
_ok(ids.includes('core_banking'),    'есть core_banking (эксклюзив bank_retail)');
_ok(ids.includes('spo_capital'),     'есть spo_capital (эксклюзив bank_topten)');
_ok(ids.includes('vip_office'),      'есть vip_office (эксклюзив bank_private)');
_ok(ids.includes('systemic_status'), 'есть systemic_status (эксклюзив bank_topten)');
`, { scenario: 'bank' }));

// ── 11: DSL-эффекты применяются — money, gAdd, gSet, overheadBump ──
add(run('Тест 11: DSL-эффекты бонусов через applyOps реально мутируют G', `
initState(); selectSpec('smm'); startGame();
const baseOverhead = SCENARIO.settings.overhead;
// money +250 000
ScenarioLoader.applyOps([{ money: 250000 }], G);
_eq(G.money, SCENARIO.settings.startMoney + 250000, 'money +250 000');
// gAdd: perkPayoutMult +0.05
const beforeMult = G.perkPayoutMult || 0;
ScenarioLoader.applyOps([{ gAdd: { perkPayoutMult: 0.05 } }], G);
_ok(Math.abs((G.perkPayoutMult || 0) - (beforeMult + 0.05)) < 1e-9, 'perkPayoutMult +0.05');
// gAdd: caseQBonus +5 (целочисленный канал)
ScenarioLoader.applyOps([{ gAdd: { caseQBonus: 5 } }], G);
_eq(G.caseQBonus, 5, 'caseQBonus = 5');
// gSet: perkPenaltyShield = true
_ok(!G.perkPenaltyShield, 'до gSet: shield не выставлен');
ScenarioLoader.applyOps([{ gSet: { perkPenaltyShield: true } }], G);
_eq(G.perkPenaltyShield, true, 'gSet → perkPenaltyShield = true');
// overheadBump -0.10 → runeOverheadBump = -round(base * 0.10)
ScenarioLoader.applyOps([{ overheadBump: -0.10 }], G);
_eq(G.runeOverheadBump, -Math.round(baseOverhead * 0.10), 'overheadBump -10% → runeOverheadBump = -base×0.10');
`));

// ── 12: фолбэк на DEFAULT_STAGES при пустом SCENARIO.runMap ──
add(run('Тест 12: если SCENARIO.runMap не задан → берём встроенные дефолты', `
// Стираем runMap из SCENARIO «как будто сценарий не описал его»
delete SCENARIO.runMap;
const stages  = RunMap.getStages();
const bonuses = RunMap.getBonuses();
_eq(stages.length,  5,  'fallback: 5 встроенных этапов');
_eq(stages[0].id,   'startup',  'fallback: первый этап = startup (DEFAULT_STAGES)');
_eq(stages[4].id,   'endgame',  'fallback: последний = endgame');
_eq(bonuses.length, 12, 'fallback: 12 встроенных бонусов');
_ok(bonuses.find(b => b.id === 'cash'), 'fallback: есть cash');
_ok(bonuses.every(b => Array.isArray(b.effects)), 'дефолтные бонусы тоже на effects[]');
`));

// ── 13: этап-эксклюзивы — bonusFitsStage / getBonusesForStage ──
add(run('Тест 13: bonusFitsStage / getBonusesForStage — фильтр по этапу', `
_ok(typeof RunMap.bonusFitsStage === 'function', 'API bonusFitsStage есть');
_ok(typeof RunMap.getBonusesForStage === 'function', 'API getBonusesForStage есть');
const bank_retail  = RunMap.getBonusesForStage('bank_retail').map(b => b.id);
const bank_topten  = RunMap.getBonusesForStage('bank_topten').map(b => b.id);
const bank_private = RunMap.getBonusesForStage('bank_private').map(b => b.id);
// На retail видим универсальные + retail-эксклюзивы, без top-/private-эксклюзивов
_ok(bank_retail.includes('deposit_base'),  'retail: universal deposit_base виден');
_ok(bank_retail.includes('core_banking'),  'retail: эксклюзив core_banking виден');
_ok(!bank_retail.includes('spo_capital'),  'retail: SPO (топ-10 эксклюзив) НЕ виден');
_ok(!bank_retail.includes('vip_office'),   'retail: VIP (private эксклюзив) НЕ виден');
// На топ-10 видим SPO/SZKO, но НЕ core_banking
_ok(bank_topten.includes('spo_capital'),     'top-10: SPO виден');
_ok(bank_topten.includes('systemic_status'), 'top-10: SZKO виден');
_ok(!bank_topten.includes('core_banking'),   'top-10: core_banking (retail) НЕ виден');
// На private видим VIP/wealth, но НЕ spo
_ok(bank_private.includes('vip_office'),      'private: VIP виден');
_ok(bank_private.includes('wealth_advisors'), 'private: wealth_advisors виден');
_ok(!bank_private.includes('spo_capital'),    'private: SPO НЕ виден');
`, { scenario: 'bank' }));

// ── 14: milestone на bank_retail предлагает универсальные + retail-эксклюзивы ──
add(run('Тест 14: milestone на bank_retail — выбор только из retail-подходящих', `
initState(); selectSpec('retail'); startGame();
G.month = 6; // граница bank_license (monthEnd:6) → next stage bank_retail
__lastEv = null;
advanceMonth();
_ok(__lastEv && __lastEv._runmap, 'milestone выстрелил');
_eq(__lastEv.id, 'runmap_bank_retail', 'переход именно на bank_retail');
const offered = (__lastEv.choices || []).map(c => c.text);
// Каждый из 3 предложенных должен быть валидным для bank_retail (универсал или retail-эксклюзив)
const validIds = new Set(RunMap.getBonusesForStage('bank_retail').map(b => b.id));
const bonusList = RunMap.getBonuses();
const offeredValid = (__lastEv.choices || []).every(c => {
  const found = bonusList.find(b => c.text.includes(b.name));
  return found && validIds.has(found.id);
});
_ok(offeredValid, 'все 3 предложенных бонуса подходят bank_retail');
`, { scenario: 'bank' }));

// ── 15: агентство — на studio_brand видны brand-эксклюзивы, без endgame ──
add(run('Тест 15: агентство studio_brand — brand-эксклюзивы видны, endgame нет', `
const onBrand   = RunMap.getBonusesForStage('studio_brand').map(b => b.id);
const onEndgame = RunMap.getBonusesForStage('studio_endgame').map(b => b.id);
_ok(onBrand.includes('thought_leader'),  'studio_brand: thought_leader виден');
_ok(onBrand.includes('design_awards'),   'studio_brand: design_awards виден');
_ok(!onBrand.includes('boutique_premium'),'studio_brand: бутик (endgame) НЕ виден');
_ok(!onBrand.includes('agency_franchise'),'studio_brand: франшиза (endgame) НЕ виден');
_ok(onEndgame.includes('boutique_premium'),'studio_endgame: бутик виден');
_ok(onEndgame.includes('agency_franchise'),'studio_endgame: франшиза виден');
_ok(!onEndgame.includes('thought_leader'), 'studio_endgame: thought_leader (brand) НЕ виден');
// Универсальные доступны на обоих
_ok(onBrand.includes('cash')   && onEndgame.includes('cash'),   'универсальный cash виден на обоих');
_ok(onBrand.includes('payout') && onEndgame.includes('payout'), 'универсальный payout виден на обоих');
`));

// ── 16: v3.19 агентство — эксклюзивы новых этапов ──
add(run('Тест 16: v3.19 агентство — studio_garage/team/growth эксклюзивы', `
const onGarage = RunMap.getBonusesForStage('studio_garage').map(b => b.id);
const onTeam   = RunMap.getBonusesForStage('studio_team').map(b => b.id);
const onGrowth = RunMap.getBonusesForStage('studio_growth').map(b => b.id);
// studio_garage: word_of_mouth, startup_grant
_ok(onGarage.includes('word_of_mouth'),   'studio_garage: word_of_mouth виден');
_ok(onGarage.includes('startup_grant'),   'studio_garage: startup_grant виден');
_ok(!onGarage.includes('team_spirit'),    'studio_garage: team_spirit (team) НЕ виден');
_ok(!onGarage.includes('design_awards'),  'studio_garage: design_awards (brand) НЕ виден');
// studio_team: team_spirit, process_standards
_ok(onTeam.includes('team_spirit'),       'studio_team: team_spirit виден');
_ok(onTeam.includes('process_standards'), 'studio_team: process_standards виден');
_ok(!onTeam.includes('word_of_mouth'),    'studio_team: word_of_mouth (garage) НЕ виден');
_ok(!onTeam.includes('media_feature'),    'studio_team: media_feature (growth) НЕ виден');
// studio_growth: media_feature, strategic_partner
_ok(onGrowth.includes('media_feature'),     'studio_growth: media_feature виден');
_ok(onGrowth.includes('strategic_partner'), 'studio_growth: strategic_partner виден');
_ok(!onGrowth.includes('startup_grant'),    'studio_growth: startup_grant (garage) НЕ виден');
_ok(!onGrowth.includes('boutique_premium'), 'studio_growth: boutique (endgame) НЕ виден');
// Универсальные — везде
_ok(onGarage.includes('cash') && onTeam.includes('cash') && onGrowth.includes('cash'),
    'универсальный cash виден на всех трёх');
`));

// ── 17: v3.19 банк — эксклюзивы bank_license и третий bank_topten ──
add(run('Тест 17: v3.19 банк — bank_license эксклюзивы + новый bank_topten', `
const onLicense = RunMap.getBonusesForStage('bank_license').map(b => b.id);
const onTopten  = RunMap.getBonusesForStage('bank_topten').map(b => b.id);
// bank_license: gov_contract, initial_capital
_ok(onLicense.includes('gov_contract'),    'bank_license: gov_contract виден');
_ok(onLicense.includes('initial_capital'), 'bank_license: initial_capital виден');
_ok(!onLicense.includes('core_banking'),   'bank_license: core_banking (retail) НЕ виден');
_ok(!onLicense.includes('spo_capital'),    'bank_license: SPO (topten) НЕ виден');
// bank_topten: уже было 2, теперь +1 (mna_acquisition)
_ok(onTopten.includes('spo_capital'),     'bank_topten: SPO (старый) виден');
_ok(onTopten.includes('systemic_status'), 'bank_topten: systemic_status (старый) виден');
_ok(onTopten.includes('mna_acquisition'), 'bank_topten: mna_acquisition (новый) виден');
_ok(!onTopten.includes('gov_contract'),   'bank_topten: gov_contract (license) НЕ виден');
// Универсальные — везде
_ok(onLicense.includes('deposit_base') && onTopten.includes('deposit_base'),
    'универсальный deposit_base виден на обоих');
`, { scenario: 'bank' }));

// ── 18: milestone на studio_garage — выбор только из garage-подходящих ──
add(run('Тест 18: milestone studio_garage — только garage-подходящие', `
initState(); selectSpec('web'); startGame();
G.month = 6; // граница studio_garage (monthEnd:6) → переход на studio_team
__lastEv = null;
advanceMonth();
_ok(__lastEv && __lastEv._runmap, 'milestone выстрелил при переходе с garage');
// Переход именно на studio_team
_eq(__lastEv.id, 'runmap_studio_team', 'переход на studio_team (после garage)');
// Все предложенные должны подходить новому этапу studio_team (не предыдущему garage)
const validIds = new Set(RunMap.getBonusesForStage('studio_team').map(b => b.id));
const bonusList = RunMap.getBonuses();
const offeredValid = (__lastEv.choices || []).every(c => {
  const found = bonusList.find(b => c.text.includes(b.name));
  return found && validIds.has(found.id);
});
_ok(offeredValid, 'все 3 бонуса на milestone подходят studio_team');
`));

console.log(`\nИтог: ${totals.pass}/${totals.pass + totals.fail} проверок прошли`);
if (totals.fail > 0) process.exit(1);
