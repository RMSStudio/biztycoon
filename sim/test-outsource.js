'use strict';
// Смоук-тест Outsource DLC (п.3):
//  • найм 3 типов подрядчиков
//  • разовая оплата (G.money уменьшается)
//  • подрядчик попадает в G.staff с _outsource-маркером
//  • вклад в throughput / capacity
//  • декремент monthsLeft при advanceMonth
//  • авто-удаление по истечении срока
//  • назначение на проект и отвязка при уходе
//  • salary=0 → не считается в getTotalStaffCost

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function makeCL(){ const s=new Set(); return {add:c=>s.add(c),remove:c=>s.delete(c),toggle:c=>s.has(c)?s.delete(c):s.add(c),contains:c=>s.has(c)}; }
function makeEl(id){
  const el = { id:id||'', textContent:'', value:'', className:'', style:{cssText:''}, dataset:{}, children:[], disabled:false, onclick:null,
    appendChild(c){ el.children.push(c); return c; },
    removeChild(){}, remove(){}, insertBefore(c){ el.children.push(c); return c; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, focus(){}, blur(){}, click(){}
  };
  el.classList = makeCL();
  let h = '';
  Object.defineProperty(el, 'innerHTML', { get(){ return h; }, set(v){ h=v; el.children.length=0; } });
  return el;
}
const REG = new Map();
const byId = id => { if (!REG.has(id)) REG.set(id, makeEl(id)); return REG.get(id); };
const store = {};
const sandbox = {
  console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
  document: {
    getElementById: byId,
    createElement: () => makeEl(),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    body: makeEl('body'),
    addEventListener(){}, removeEventListener(){},
  },
  localStorage: { getItem: k=>store[k]??null, setItem: (k,v)=>{ store[k]=String(v); }, removeItem: k=>{ delete store[k]; } },
  navigator: {}, renderPortfolioTab(){},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const FILES = [
  'src/constants.js',
  'src/events.js',
  'scenarios/agency.data.js',
  'src/scenario-loader.js',
  'src/engine.js',
  'src/projects.js',
  'src/staff.js',
  'src/saves.js',
  'dlc/outsource/outsource.js',
];
const src = FILES.map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

const TEST = String.raw`
const out = [];
const __FAIL = [];
function ok(name, cond) { out.push((cond?'✅':'❌') + ' ' + name); if (!cond) __FAIL.push(name); }

// ── 1. Загрузка DLC и старт стейта ──
initState();
G.spec = Object.keys(SPECS)[0];           // любой спец — для getTotalStaffCost
SCENARIO.settings.startMoney = 5000000;   // достаточно денег на всех 3 подрядчиков
G.money = 5000000;
ok('OS публичный API доступен',           typeof OS === 'object' && typeof OS.hire === 'function');
ok('advanceMonth обёрнут',                advanceMonth.__osWrapped === true);
ok('renderTeamCards обёрнут',             renderTeamCards.__osWrapped === true);
ok('3 типа подрядчиков в каталоге',       Object.keys(OS.getTypes()).length === 3);

const moneyBefore = G.money;
const staffBefore = G.staff.length;

// ── 2. Найм трёх типов ──
OS.hire('studio');
OS.hire('copywriters');
OS.hire('extPM');
ok('подрядчики в G.staff (3 шт.)',        G.staff.length === staffBefore + 3);
ok('все имеют маркер _outsource',         G.staff.slice(-3).every(s => s._outsource));
ok('списано ровно стоимость трёх контр.', moneyBefore - G.money === 480000 + 360000 + 620000);

// ── 3. Salary=0 → не учитывается в ФОТ ──
ok('подрядчики не в ФОТ',                 getTotalStaffCost() === 0);

// ── 4. Вклад в throughput / Q / V / capacity ──
const tt = getTeamThroughput();
const qq = getQuality();
const vv = getVolume();
const cc = getCapacity();
ok('throughput вырос (подрядчики дают мощн.)', tt > 2);
ok('Q +22 (9+7+6)',                       qq >= 22);
ok('V +39 (5+30+4)',                      vv === 39);
ok('Capacity +1 (extPM)',                 cc === 3);  // 2 базовых + 1 от extPM

// ── 5. Декремент срока через advanceMonth (мокаем кнопку «Закончить мес.») ──
const studio  = G.staff.find(s => s._outsource && s._outsource.type === 'studio');
const writers = G.staff.find(s => s._outsource && s._outsource.type === 'copywriters');
const extpm   = G.staff.find(s => s._outsource && s._outsource.type === 'extPM');
ok('studio: 3 мес.',                      studio._outsource.monthsLeft === 3);
ok('extPM:  4 мес.',                      extpm._outsource.monthsLeft === 4);

// Тик 1 месяц
advanceMonth();
ok('после M+1 studio: 2 мес.',            studio._outsource.monthsLeft === 2);
ok('после M+1 extPM:  3 мес.',            extpm._outsource.monthsLeft === 3);
ok('подрядчики ещё в команде',            G.staff.includes(studio) && G.staff.includes(writers) && G.staff.includes(extpm));

// Назначаем studio на первый клиент через signProject
G.reputation = 60; G.qualityBonus = 80; G.staff.push(__makeFakeStaff('s_fake_dev'));
// Стартуем простой проект из пула: создадим заглушку через подпись напрямую
const fakeProject = {
  id: 'fp_test_' + Date.now(),
  name: 'Тестовый проект', icon:'🧪', tier:1, type:'corp', oneTime:false,
  npsStart: 70, modifier:{ type:'none', val:0, label:'—' }, modBadge:'mb-green',
  prepayChance: 0, _monthsSigned: 0, _duration: 6,
  _originalBudget: 1000000, _totalBudget: 1000000, _prepaidAmount: 0, _progress: 10,
  _milestones: [], _milestonePcts: [], _milestonesPaid: [], _assignedStaff: [],
};
G.activeClients.push(fakeProject);
G.clientNPS[fakeProject.id] = 70; G.clientEarnings[fakeProject.id] = 0;
if (typeof Projects !== 'undefined') Projects.initLCState(fakeProject);
const w0 = (fakeProject._lcChain || []).indexOf('work_0');
if (w0 >= 0) { fakeProject._lcPhaseIdx = w0; fakeProject._lcPhase = 'work_0'; fakeProject._workStartMonth = 0; }
assignStaffToProject(studio._iid, fakeProject.id);
ok('studio назначен на проект',           fakeProject._assignedStaff.includes(studio._iid));

// Тик ещё 2 месяца → studio.monthsLeft=0 → уход
advanceMonth();
ok('после M+2 studio: 1 мес.',            studio._outsource.monthsLeft === 1);
advanceMonth();
ok('после M+3 studio удалён',             !G.staff.includes(studio));
ok('studio отвязан от проекта',           !fakeProject._assignedStaff.includes(studio._iid));
ok('writers (3 мес.) тоже ушёл',          !G.staff.includes(writers));
ok('extPM ещё работает (4 мес.)',         G.staff.includes(extpm) && extpm._outsource.monthsLeft === 1);

// Ещё месяц → extPM уходит
advanceMonth();
ok('после M+4 extPM удалён',              !G.staff.includes(extpm));
ok('подрядчиков больше нет',              G.staff.every(s => !s._outsource));

// ── 6. Недостаток денег → найм блокируется ──
G.money = 100000;
const beforeCnt = G.staff.length;
OS.hire('studio');
ok('блок найма при нехватке денег',       G.staff.length === beforeCnt && G.money === 100000);

// ── 7. Несколько подрядчиков одного типа разрешены ──
G.money = 2000000;
OS.hire('copywriters');
OS.hire('copywriters');
const writers2 = G.staff.filter(s => s._outsource && s._outsource.type === 'copywriters');
ok('два контракта copywriters одновременно', writers2.length === 2);

console.log(out.join('\n'));
console.log('\nИтог: ' + (out.length - __FAIL.length) + '/' + out.length + ' проверок прошли');
if (__FAIL.length) { console.log('Провалы:'); __FAIL.forEach(n => console.log('  • ' + n)); process.exit(1); }

function __makeFakeStaff(iid) {
  return {
    uid: iid, id: iid, _iid: iid,
    name: 'Fake Dev', role: 'developer', roleLabel: 'Разработчик',
    grade: 'middle', gradeLabel: 'Middle', icon: '💻',
    cost: 80000, salary: 80000, salaryAsk: 80000, salaryMin: 70000,
    qStat: 6, speedStat: 6, quality: 6, volume: 4, capacity: 0,
    speedBonus: 0, npsBonus: 0,
    traits: [], experience: 4,
    mood: 80, fatigue: 0, loyalty: 70,
    monthsWithAgency: 6, projectsCompleted: 0, starLevel: 0,
    state: 'hired', status: 'active', _assignedProjectId: null,
  };
}
`;

try {
  vm.runInContext(src + '\n;\n' + TEST, sandbox);
} catch (e) {
  console.error('❌ Ошибка выполнения:', e.message);
  console.error(e.stack);
  process.exit(1);
}
