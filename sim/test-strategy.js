'use strict';
// Смоук-тест Strategy DLC: seed-детерминизм, импорт двойника, ветки
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function makeCL(){ const s=new Set(); return {add:c=>s.add(c),remove:c=>s.delete(c),toggle:c=>s.has(c)?s.delete(c):s.add(c),contains:c=>s.has(c)}; }
function makeEl(id){ const el={ id:id||'',textContent:'',value:'',className:'',style:{cssText:''},dataset:{},children:[],disabled:false,onclick:null,
  appendChild(c){el.children.push(c);return c;},removeChild(){},remove(){},insertBefore(c){el.children.push(c);return c;},
  setAttribute(){},getAttribute(){return null;},removeAttribute(){},addEventListener(){},removeEventListener(){},
  querySelector(){return makeEl();},querySelectorAll(){return [];},closest(){return null;},focus(){},blur(){},click(){} };
  el.classList=makeCL(); let h=''; Object.defineProperty(el,'innerHTML',{get(){return h;},set(v){h=v;el.children.length=0;}}); return el; }
const REG=new Map(); const byId=id=>{ if(!REG.has(id)) REG.set(id,makeEl(id)); return REG.get(id); };
const store={};
const sandbox={ console,Math,Date,JSON,Intl,setTimeout,clearTimeout,
  document:{ getElementById:byId, createElement:()=>makeEl(), querySelector:()=>makeEl(), querySelectorAll:()=>[], body:makeEl('body'), addEventListener(){},removeEventListener(){} },
  localStorage:{ getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  navigator:{}, renderPortfolioTab(){},
  prompt:()=> 'Тестовая развилка',
};
sandbox.window=sandbox; sandbox.globalThis=sandbox;
sandbox.FileReader=function(){ this.readAsText=f=>{ this.result=f._content; this.onload&&this.onload(); }; };
vm.createContext(sandbox);

const FILES=['src/constants.js','src/events.js','scenarios/agency.js','src/engine.js','src/projects.js','src/staff.js','src/saves.js','dlc/strategy/strategy.js'];
const src=FILES.map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');

const TWIN = fs.readFileSync(path.join(ROOT,'dlc/strategy/twin_example.json'),'utf8');

const TEST = String.raw`
const out = [];
function ok(name, cond){ out.push((cond?'✅':'❌')+' '+name); if(!cond) __FAIL.push(name); }

// ── 1. Импорт двойника + старт сессии ──
initState();
document.getElementById('strat-seed').value='42';
document.getElementById('strat-months').value='6';
STRAT.loadTwinFile({ files:[{ _content: __TWIN }] });
STRAT.startSession();
ok('двойник: баланс 850K',            G.money === 850000);
ok('двойник: штат 5 чел.',            G.staff.length === 5);
ok('двойник: 3 активных контракта',   G.activeClients.length === 3);
ok('двойник: контракт в work-фазе',   G.activeClients.every(c => c._lcPhase === 'work_0'));
ok('двойник: бюджеты-остатки',        G.activeClients.reduce((s,c)=>s+c._totalBudget,0) === 1920000);
ok('режим: seed 42 в стейте',         G._strategyMode && G._strategyMode.seed === 42 && G._rngState != null);
ok('режим: win-условие отключено',    SCENARIO.settings.winCondition === Infinity);

// ── 2. Seed-детерминизм: два потока с одним seed идентичны ──
G._rngState = 12345;
const a = [Math.random(), Math.random(), Math.random()];
G._rngState = 12345;
const b = [Math.random(), Math.random(), Math.random()];
ok('RNG: одинаковый seed → одинаковый поток', JSON.stringify(a) === JSON.stringify(b));
ok('RNG: значения в [0,1)', a.every(v => v >= 0 && v < 1));

// ── 3. Месяц играется без ошибок, RNG-состояние двигается ──
const rs0 = G._rngState;
G.staff.forEach(s => assignStaffToProject(s._iid, G.activeClients[0].id));
advanceMonth();
ok('месяц сыгран (month=1)',          G.month === 1);
ok('RNG-состояние продвинулось',      G._rngState !== rs0);

// ── 4. Ветки: развилка → изменение → возврат ──
STRAT.branchPrompt();                       // создаёт ветку + помечает линию
const moneyAtFork = G.money;
G.money -= 200000; advanceMonth();
STRAT.stampCurrentLine && (sandbox => {})(); // фиксация — через openBranch ниже
const brs = JSON.parse(localStorage.getItem('bt_strategy_branches_v1'));
ok('ветка создана',                   brs.length === 1 && brs[0].month === 1);
STRAT.openBranch(brs[0].id);
ok('возврат: баланс на развилке',     G.money === moneyAtFork);
ok('возврат: месяц на развилке',      G.month === 1);
ok('исход прошлой линии зафиксирован', (JSON.parse(localStorage.getItem('bt_strategy_branches_v1'))[0].results||[]).length === 1);
ok('RNG жив после рестора',           typeof Math.random() === 'number' && G._rngState != null);

__OUT.push(...out);
`;

sandbox.__TWIN = TWIN;
sandbox.__OUT = [];
sandbox.__FAIL = [];
try { vm.runInContext(src + '\n;\n' + TEST, sandbox, { filename: 'test-strategy.js' }); }
catch (e) { console.error('💥', e); process.exit(1); }
console.log('\n— Strategy DLC smoke —');
sandbox.__OUT.forEach(l => console.log(' ' + l));
console.log(sandbox.__FAIL.length ? `\n❌ Провалов: ${sandbox.__FAIL.length}` : '\n✅ Все проверки пройдены');
process.exit(sandbox.__FAIL.length ? 1 : 0);
