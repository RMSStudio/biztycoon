'use strict';
// ══════════════════════════════════════════════════════════════════════
//  Тест Ф.6 — Сезонность (стиль HoMM3): темы, годовой шаффл, эффекты,
//  тематический наплыв проектов, сезонные события.
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function makeClassList(){ const s=new Set(); return {add:c=>s.add(c),remove:c=>s.delete(c),toggle:c=>s.has(c)?s.delete(c):s.add(c),contains:c=>s.has(c)}; }
function makeEl(id){ const el={id:id||'',textContent:'',value:'',className:'',title:'',style:{},dataset:{},children:[],disabled:false,onclick:null,parentElement:null,
  appendChild(c){this.children.push(c);c.parentElement=this;return c;},removeChild(c){this.children=this.children.filter(x=>x!==c);},remove(){},insertBefore(c){this.children.push(c);return c;},
  setAttribute(){},getAttribute(){return null;},removeAttribute(){},addEventListener(){},removeEventListener(){},querySelector(){return makeEl();},querySelectorAll(){return[];},closest(){return null;},focus(){},blur(){},click(){if(this.onclick)this.onclick();},getBoundingClientRect(){return{top:0,left:0,width:0,height:0};},scrollIntoView(){}};
  el.classList=makeClassList(); let _h=''; Object.defineProperty(el,'innerHTML',{get(){return _h;},set(v){_h=v;el.children.length=0;}}); return el; }
const REG=new Map(); const byId=id=>{if(!REG.has(id))REG.set(id,makeEl(id));return REG.get(id);};
const fakeDoc={getElementById:byId,createElement:()=>makeEl(),querySelector(s){if(s==='.game-header .game-logo')return byId('__l');return makeEl();},querySelectorAll:()=>[],body:makeEl('body'),addEventListener(){},removeEventListener(){}};
function makeSandbox(){ REG.clear(); const _ls={}; const sb={console,Math,Date,JSON,Intl,setTimeout,clearTimeout,document:fakeDoc,
  localStorage:{getItem(k){return Object.prototype.hasOwnProperty.call(_ls,k)?_ls[k]:null;},setItem(k,v){_ls[k]=String(v);},removeItem(k){delete _ls[k];}},
  navigator:{},renderPortfolioTab(){},__TR:{pass:0,fail:0,log:[]}}; sb.window=sb; sb.globalThis=sb; return sb; }
function loadSrc(){ const F=['src/constants.js','src/events.js','scenarios/agency.data.js','src/scenario-loader.js','src/engine.js','src/projects.js','src/staff.js'];
  let src=F.map(f=>'// ===== '+f+' =====\n'+fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
  src+='\n;\n// ===== src/livingmarket.js =====\n'+fs.readFileSync(path.join(ROOT,'src/livingmarket.js'),'utf8'); return src; }
const HARNESS=String.raw`
function _ok(c,m){if(c){__TR.pass++;__TR.log.push('✅ '+m);}else{__TR.fail++;__TR.log.push('❌ '+m);}}
function _eq(a,b,m){_ok(a===b,m+' ('+JSON.stringify(a)+' === '+JSON.stringify(b)+')');}
function _setup(){ initState(); selectSpec('smm'); startGame(); }
`;
function run(name,body){ const sb=makeSandbox(); const src=loadSrc()+'\n;\n'+HARNESS+'\n;\n'+body; vm.createContext(sb);
  try{vm.runInContext(src,sb);}catch(e){console.log('💥 ['+name+']:',e.message,'\n',e.stack);sb.__TR.fail++;}
  console.log('── '+name+' ──'); sb.__TR.log.forEach(l=>console.log(l)); return sb.__TR; }
const totals={pass:0,fail:0}; function add(r){totals.pass+=r.pass;totals.fail+=r.fail;}

// 1: API + темы
add(run('Тест 1: API сезонов', `
_ok(typeof getActiveSeason==='function','getActiveSeason есть');
_ok(typeof getSeasonMod==='function','getSeasonMod есть');
_ok(typeof getNextSeason==='function','getNextSeason есть');
_ok(Array.isArray(SEASON_THEMES) && SEASON_THEMES.length>=6,'SEASON_THEMES >=6 ('+SEASON_THEMES.length+')');
_setup();
const s=getActiveSeason();
_ok(s && s.id && s.label && s.icon,'активная тема валидна: '+s.label);
const mod=getSeasonMod();
_ok('offerBonus'in mod && 'budgetBoost'in mod && 'npsNudge'in mod && 'speedMod'in mod && 'pool'in mod,'getSeasonMod back-compat+новые поля');
`));

// 2: годовой шаффл + детерминизм/персистентность
add(run('Тест 2: шаффл порядка тем по годам', `
_setup();
const o0=getActiveSeason().id;
const order0=G.seasons[0];
_ok(Array.isArray(order0) && order0.length===4,'порядок года 0 — 4 темы');
// повторный вызов даёт тот же порядок (персистентность)
const again=getActiveSeason().id;
_eq(o0,again,'активная тема стабильна при повторе');
// все 4 — валидные id из SEASON_THEMES
const ids=SEASON_THEMES.map(t=>t.id);
_ok(order0.every(x=>ids.includes(x)),'все темы года из пула');
_ok(new Set(order0).size===4,'в году 4 РАЗНЫЕ темы');
`));

// 3: активная тема меняется по кварталам
add(run('Тест 3: квартальная смена темы', `
_setup();
G.seasons[0]=['sport','sale','report','startup'];
G.month=0;  _eq(getActiveSeason().id,'sport','Q0 (мес 0) = sport');
G.month=2;  _eq(getActiveSeason().id,'sport','Q0 (мес 2) = sport');
G.month=3;  _eq(getActiveSeason().id,'sale','Q1 (мес 3) = sale');
G.month=6;  _eq(getActiveSeason().id,'report','Q2 (мес 6) = report');
G.month=9;  _eq(getActiveSeason().id,'startup','Q3 (мес 9) = startup');
`));

// 4: сезонный модификатор скорости
add(run('Тест 4: speedMod в getSpeed', `
_setup();
G.staff=[]; G.speedUpgrades=0;
G.seasons[0]=['sport','sale','report','startup']; G.month=0; // sport speedMod -0.05
const sp=getSpeed();
_ok(Math.abs(sp-0.95)<1e-6,'sport: скорость 0.95 ('+sp+')');
G.month=3; // sale speedMod 0
_ok(Math.abs(getSpeed()-1.0)<1e-6,'sale: скорость 1.0');
`));

// 5: тематический наплыв проектов в офферах
add(run('Тест 5: сёрдж тематических офферов', `
_setup();
G.reputation=95; G.portfolio=90; G.activeClients=[];
G.seasons[0]=['ecom','ecom','ecom','ecom']; G.month=0; // активна ecom
let hot=0,total=0;
for(let i=0;i<200;i++){ const offs=_generateOffers(); total+=offs.length; hot+=offs.filter(o=>o._seasonHot).length; }
_ok(total>0,'офферы генерируются ('+total+')');
const ratio=hot/total;
_ok(ratio>0.4,'доля тематических (ecom) офферов > 40%: '+(ratio*100).toFixed(0)+'%');
`));

// 6: сезонный бюджет-множитель на офферах
add(run('Тест 6: budgetBoost на офферах', `
_setup();
G.reputation=95; G.portfolio=90; G.activeClients=[];
G.seasons[0]=['sale','sale','sale','sale']; G.month=0; // sale budgetMult 1.2 -> boost 0.2
const offs=_generateOffers();
_ok(offs.length>0,'офферы есть');
_ok(offs.every(o=>Math.abs((o._seasonBoost||0)-0.2)<1e-9),'у всех офферов _seasonBoost=0.2 (sale +20%)');
G.seasons[0]=['report','report','report','report']; // budgetMult 1.0 -> boost 0
const offs2=_generateOffers();
_ok(offs2.every(o=>!o._seasonBoost),'report (×1.0): _seasonBoost отсутствует');
`));

// 7: сезонное событие при смене квартала
add(run('Тест 7: событие-вилка при смене сезона', `
_setup();
G.seasons[0]=['sport','sale','report','startup'];
G.month=2; G._lastSeasonKey = 0*4+0; // в Q0
let shown=null;
EventBus.on('show_event', ({ev})=>{ shown=ev; });
G.month=3;  // теперь Q1
const fired=_maybeFireSeasonEvent();
_ok(fired===true,'_maybeFireSeasonEvent вернул true при смене квартала');
_ok(shown && shown.title && Array.isArray(shown.choices) && shown.choices.length>=2,'событие показано с >=2 выборами: '+(shown&&shown.title));
// повторный вызов в том же квартале — без события
shown=null;
_ok(_maybeFireSeasonEvent()===false && shown===null,'в том же квартале повторно не срабатывает');
`));

// 8: advanceMonth через границу сезона не падает
add(run('Тест 8: advanceMonth через смену сезона', `
_setup();
let err=null;
try { for(let i=0;i<14;i++){ G.money=5000000; advanceMonth(); } } catch(e){ err=e; }
_ok(!err,'14 месяцев advanceMonth без ошибок'+(err?': '+err.message:''));
_ok(G.seasons && Object.keys(G.seasons).length>=1,'G.seasons заполнен ('+Object.keys(G.seasons||{}).join(',')+')');
`));

console.log('\n══════════════════════════════════════');
console.log('ИТОГО: '+totals.pass+' ✅  /  '+totals.fail+' ❌');
process.exit(totals.fail?1:0);
