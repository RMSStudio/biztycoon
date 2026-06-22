'use strict';
// ══════════════════════════════════════════════════════════════════════
//  Тест ребаланса M&A (Ф.8, фикс абуза поглощений 2026-06-22)
//
//  Проверяем:
//   - competitorValuation > старой «цены выкупа» — нет дешёвого добора остатка
//   - цикл купил-долю → выкупил → ликвидировал НЕ в плюс (был критический абуз)
//   - покупка доли / выкуп / ликвидация тратят рабочие дни (G.actions)
//   - ликвидация под локом 12 мес (reason 'locked'), после — даёт 0.5×valuation
//   - захват всего ростера НЕ регенерит 18 новых (_initMarket не плодит)
//   - opts {costMult,yieldMult,extraDays} из ветвистого процесса применяются
// ══════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const ROOT = path.join(__dirname, '..');

function makeClassList() {
  const set = new Set();
  return { add:c=>set.add(c), remove:c=>set.delete(c), toggle:c=>set.has(c)?set.delete(c):set.add(c), contains:c=>set.has(c) };
}
function makeEl(id) {
  const el = { id:id||'', textContent:'', value:'', className:'', title:'', style:{}, dataset:{}, children:[], disabled:false, onclick:null, parentElement:null,
    appendChild(c){this.children.push(c);c.parentElement=this;return c;}, removeChild(c){this.children=this.children.filter(x=>x!==c);}, remove(){},
    insertBefore(c){this.children.push(c);return c;}, setAttribute(){}, getAttribute(){return null;}, removeAttribute(){},
    addEventListener(){}, removeEventListener(){}, querySelector(){return makeEl();}, querySelectorAll(){return[];},
    closest(){return null;}, focus(){}, blur(){}, click(){if(this.onclick)this.onclick();}, getBoundingClientRect(){return{top:0,left:0,width:0,height:0};}, scrollIntoView(){} };
  el.classList = makeClassList();
  let _html=''; Object.defineProperty(el,'innerHTML',{get(){return _html;},set(v){_html=v;el.children.length=0;}});
  return el;
}
const REGISTRY = new Map();
const byId = id => { if(!REGISTRY.has(id)) REGISTRY.set(id, makeEl(id)); return REGISTRY.get(id); };
const fakeDocument = { getElementById:byId, createElement:()=>makeEl(),
  querySelector(sel){ if(sel==='.game-header .game-logo') return byId('__game-logo'); return makeEl(); },
  querySelectorAll:()=>[], body:makeEl('body'), addEventListener(){}, removeEventListener(){} };

function makeSandbox() {
  REGISTRY.clear();
  const _ls = {};
  const sb = { console, Math, Date, JSON, Intl, setTimeout, clearTimeout, document:fakeDocument,
    localStorage:{ getItem(k){return Object.prototype.hasOwnProperty.call(_ls,k)?_ls[k]:null;}, setItem(k,v){_ls[k]=String(v);}, removeItem(k){delete _ls[k];} },
    navigator:{}, renderPortfolioTab(){}, __TR:{pass:0,fail:0,log:[]} };
  sb.window = sb; sb.globalThis = sb;
  return sb;
}
function loadSrc() {
  const FILES = ['src/constants.js','src/events.js','scenarios/agency.data.js','src/scenario-loader.js','src/engine.js','src/projects.js','src/staff.js'];
  let src = FILES.map(f=>'// ===== '+f+' =====\n'+fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
  src += '\n;\n// ===== src/livingmarket.js =====\n' + fs.readFileSync(path.join(ROOT,'src/livingmarket.js'),'utf8');
  return src;
}
const HARNESS = String.raw`
function _ok(c,m){ if(c){__TR.pass++;__TR.log.push('✅ '+m);} else {__TR.fail++;__TR.log.push('❌ '+m);} }
function _eq(a,b,m){ _ok(a===b, m+' ('+JSON.stringify(a)+' === '+JSON.stringify(b)+')'); }
// общий сетап: запускаем партию, форсим стадию «Сеть», даём денег и дней
function _setup(){
  initState(); selectSpec('smm'); startGame();
  LivingMarket._initMarket();
  G.living.stage = 3;          // «Сеть» — поглощения открыты
  G.money   = 200000000;       // денег с запасом
  G.actions = 30;              // дней с запасом
  G.month   = 0;
}
`;
function run(name, body) {
  const sb = makeSandbox();
  const src = loadSrc() + '\n;\n' + HARNESS + '\n;\n' + body;
  vm.createContext(sb);
  try { vm.runInContext(src, sb); }
  catch(e){ console.log('💥 ['+name+']:', e.message, '\n', e.stack); sb.__TR.fail++; }
  console.log('── '+name+' ──');
  sb.__TR.log.forEach(l=>console.log(l));
  return sb.__TR;
}
const totals = { pass:0, fail:0 };
function add(r){ totals.pass+=r.pass; totals.fail+=r.fail; }

// ── 1: API ребаланса доступно ──
add(run('Тест 1: API ребаланса', `
_ok(typeof LivingMarket.liquidateSubsidiary === 'function', 'liquidateSubsidiary экспортирован');
_ok(typeof LivingMarket.liquidationValue === 'function', 'liquidationValue экспортирован');
_ok(typeof LivingMarket.getSubsidiaries === 'function', 'getSubsidiaries экспортирован');
`));

// ── 2: цена выкупа контроля привязана к оценке (V), не «дешёвый добор» ──
add(run('Тест 2: acquisitionCost ≈ V × remaining × premium', `
_setup();
const comp = G.market.competitors[0];
const V = LivingMarket.competitorValuation(comp);
const full = LivingMarket.acquisitionCost(comp);   // доля 0% → ~V×1.2
_ok(full >= V, 'цена выкупа (100%) ≥ оценки V (премия за контроль): '+full+' vs '+V);
// купим 25% и проверим, что остаток считается от 75%, а не «фикс. цена со скидкой»
LivingMarket.buyEquity(comp.id, 25);
const rest = LivingMarket.acquisitionCost(comp);
_ok(rest < full, 'после 25% доли — выкуп остатка дешевле полного: '+rest+' < '+full);
_ok(rest > V * 0.5, 'но остаток всё ещё дорогой (не копеечный добор): '+rest+' > '+(V*0.5));
`));

// ── 3: ГЛАВНОЕ — цикл купил-выкупил-ликвидировал НЕ в плюс ──
add(run('Тест 3: абуз-цикл доля→выкуп→ликвидация убыточен', `
_setup();
const comp = G.market.competitors[0];
const m0 = G.money;
const eq = LivingMarket.buyEquity(comp.id, 25);
_ok(eq.ok, 'куплено 25%');
const acq = LivingMarket.acquireCompetitor(comp.id, 'integrate');
_ok(acq.ok, 'компания поглощена (выкуп остатка)');
const spent = m0 - G.money;
// промотаем лок и ликвидируем
G.month = 12; G.actions = 30;
const liq = LivingMarket.liquidateSubsidiary(comp.id);
_ok(liq.ok, 'ликвидация прошла после лока');
const recovered = liq.cash;
_ok(recovered < spent, 'возврат ('+recovered+') МЕНЬШЕ вложенного ('+spent+') — абуза нет');
const net = G.money - m0;
_ok(net < 0, 'итоговый баланс цикла отрицательный (net='+net+')');
`));

// ── 4: рабочие дни тратятся на каждой операции ──
add(run('Тест 4: операции тратят G.actions', `
_setup();
const comp = G.market.competitors[0];
let d = G.actions;
LivingMarket.buyEquity(comp.id, 10);
_ok(G.actions === d - 2, 'покупка доли: −2 дня'); d = G.actions;
LivingMarket.sellEquity(comp.id, 5);
_ok(G.actions === d - 2, 'продажа доли: −2 дня'); d = G.actions;
LivingMarket.acquireCompetitor(comp.id, 'integrate');
_ok(G.actions === d - 6, 'поглощение: −6 дней'); d = G.actions;
G.month = 12;
LivingMarket.liquidateSubsidiary(comp.id);
_ok(G.actions === d - 3, 'ликвидация: −3 дня');
`));

// ── 5: лок ликвидации 12 мес ──
add(run('Тест 5: лок ликвидации', `
_setup();
const comp = G.market.competitors[0];
LivingMarket.acquireCompetitor(comp.id, 'integrate');
G.month = 5;
const early = LivingMarket.liquidateSubsidiary(comp.id);
_ok(!early.ok && early.reason === 'locked', 'до 12 мес — заблокировано (locked)');
_ok(early.monthsLeft === 7, 'осталось 7 мес лока');
G.month = 12;
const ok = LivingMarket.liquidateSubsidiary(comp.id);
_ok(ok.ok, 'на 12-м мес — разрешено');
`));

// ── 6: захват всего ростера НЕ регенерит новых ──
add(run('Тест 6: пустой ростер не регенерится', `
_setup();
G.actions = 999; G.money = 9e9;
const ids = G.market.competitors.map(c => c.id);
for (const id of ids) { G.actions = 999; LivingMarket.acquireCompetitor(id, 'integrate'); }
_eq(G.market.competitors.length, 0, 'ростер опустошён захватом');
LivingMarket._initMarket();        // раньше тут респаунились 18
_eq(G.market.competitors.length, 0, 'после _initMarket ростер остаётся пустым (без конвейера)');
`));

// ── 7: opts ветвистого процесса применяются ──
add(run('Тест 7: opts {costMult, extraDays} в acquireCompetitor', `
_setup();
const comp = G.market.competitors[0];
const base = LivingMarket.acquisitionCost(comp);
const m0 = G.money, a0 = G.actions;
const res = LivingMarket.acquireCompetitor(comp.id, 'integrate', { costMult: 0.9, extraDays: 2 });
_ok(res.ok, 'поглощение с opts прошло');
const paid = m0 - G.money;
_ok(Math.abs(paid - Math.round(base*0.9/1000)*1000) <= 1000, 'списана цена ×0.9: '+paid);
_ok(a0 - G.actions === 8, 'списано 6+2 дня (extraDays): '+(a0-G.actions));
`));

// ── 8: DEV/тест-тумблер разблокирует рынок без стадии «Сеть» ──
add(run('Тест 8: dev-тумблер открывает поглощения/доли до стадии «Сеть»', `
initState(); selectSpec('smm'); startGame();
LivingMarket._initMarket();
G.living.stage = 0;            // гараж — рынок по правилам закрыт
G.money = 200000000; G.actions = 30; G.month = 0;
const comp = G.market.competitors[0];
// без тумблера — поглощение заблокировано стадией, доля под потолком 25
_eq(LivingMarket.equityCap(), 25, 'до «Сети» потолок долей = 25');
const blocked = LivingMarket.acquireCompetitor(comp.id, 'integrate');
_ok(!blocked.ok && blocked.reason === 'stage_required', 'поглощение заблокировано (stage_required)');
// включаем тумблер
LivingMarket.setMarketDevUnlocked(true);
_ok(LivingMarket.isMarketDevUnlocked(), 'тумблер ВКЛ');
_eq(LivingMarket.equityCap(), 100, 'с тумблером потолок долей = 100');
const ok = LivingMarket.acquireCompetitor(comp.id, 'integrate');
_ok(ok.ok, 'поглощение проходит с тумблером на стадии 0');
// саббренд (требует «Холдинг» ≥4) тоже открыт
const comp2 = G.market.competitors[0];
G.actions = 30;
const sb = LivingMarket.acquireCompetitor(comp2.id, 'subbrand');
_ok(sb.ok && sb.mode === 'subbrand', 'саббренд доступен с тумблером (mode=subbrand)');
// выключаем — снова закрыто, реальная стадия не тронута
LivingMarket.setMarketDevUnlocked(false);
_eq(G.living.stage, 0, 'реальная стадия осталась 0 (тумблер прогрессию не трогал)');
_ok(!LivingMarket.acquireCompetitor(G.market.competitors[0].id, 'integrate').ok, 'после выкл — снова заблокировано');
`));

console.log('\n══════════════════════════════════════');
console.log('ИТОГО: '+totals.pass+' ✅  /  '+totals.fail+' ❌');
process.exit(totals.fail ? 1 : 0);
