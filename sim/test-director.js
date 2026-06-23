'use strict';
// ══════════════════════════════════════════════════════════════════════
//  Тест Р.4 — «Директор давления» (динамическая сложность).
//  Индекс комфорта, эскалация давления, кризисы в комфорте, пороги по
//  сложности, «невидимая рука» (подрезка офферов), overhead-скачок.
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
function makeSandbox(diff){ REG.clear(); const _ls={}; if(diff)_ls['bt_difficulty_v1']=diff; const sb={console,Math,Date,JSON,Intl,setTimeout,clearTimeout,document:fakeDoc,
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
function run(name,body,diff){ const sb=makeSandbox(diff); const src=loadSrc()+'\n;\n'+HARNESS+'\n;\n'+body; vm.createContext(sb);
  try{vm.runInContext(src,sb);}catch(e){console.log('💥 ['+name+']:',e.message,'\n',e.stack);sb.__TR.fail++;}
  console.log('── '+name+' ──'); sb.__TR.log.forEach(l=>console.log(l)); return sb.__TR; }
const totals={pass:0,fail:0}; function add(r){totals.pass+=r.pass;totals.fail+=r.fail;}

// 1: API
add(run('Тест 1: API директора', `
_ok(typeof computeComfort==='function','computeComfort есть');
_ok(typeof _directorTick==='function','_directorTick есть');
_ok(typeof _rollCrisis==='function','_rollCrisis есть');
_ok(typeof getDirectorOverhead==='function','getDirectorOverhead есть');
_ok(typeof _directorOfferPenalty==='function','_directorOfferPenalty есть');
_setup();
_ok(G.director && typeof G.director.comfort==='number','G.director инициализирован');
`));

// 2: индекс комфорта — богатый vs на мели
add(run('Тест 2: индекс комфорта', `
_setup();
G.staff=[]; G.activeClients=[]; G.reputation=90; G.money=50000000;
const rich=computeComfort(G);
_ok(rich>=80,'богатый старт → высокий комфорт ('+rich+')');
G.money=10000; G.reputation=35;
const poor=computeComfort(G);
_ok(poor<40,'на мели → низкий комфорт ('+poor+')');
_ok(rich>poor,'богатый комфортнее, чем на мели');
`));

// 3: эскалация давления при длительном комфорте
add(run('Тест 3: давление растёт в комфорте', `
_setup();
G.staff=[]; G.activeClients=[]; G.reputation=90; G.money=50000000;
G.director.lastCrisisMonth=99999; // блокируем кризис, смотрим только давление
for(let i=0;i<9;i++){ G.month=i; _directorTick(G); }
_ok(G.director.streak>=6,'streak накопился ('+G.director.streak+')');
_ok(G.director.pressure>=2,'давление выросло ('+G.director.pressure+')');
`));

// 4: дискомфорт быстро снимает давление
add(run('Тест 4: дискомфорт снимает давление', `
_setup();
G.staff=[]; G.activeClients=[]; G.reputation=90; G.money=50000000;
G.director.lastCrisisMonth=99999;
for(let i=0;i<9;i++){ G.month=i; _directorTick(G); }
const peak=G.director.pressure;
// уходим в минус
G.money=5000; G.reputation=30;
for(let i=9;i<14;i++){ G.month=i; _directorTick(G); }
_ok(G.director.pressure<peak,'давление спало после дискомфорта ('+peak+'→'+G.director.pressure+')');
`));

// 5: кризис срабатывает в комфорте
add(run('Тест 5: кризис в комфорте', `
_setup();
G.staff=[]; G.activeClients=[]; G.reputation=90; G.money=50000000;
let events=0; EventBus.on('show_event',()=>events++);
let logs=0; const _ol=window.addLog; // считаем кризис-логи косвенно через G.director.crises
G.director.lastCrisisMonth=-99;
for(let i=0;i<12;i++){ G.month=i; _directorTick(G); }
_ok(G.director.crises>=1,'за 12 комфортных месяцев брошен хотя бы 1 кризис ('+G.director.crises+')');
`));

// 6: пороги по сложности (nightmare срабатывает раньше easy)
add(run('Тест 6a: nightmare cap ниже', `
_setup();
_eq(DIRECTOR_COMFORT_CAP.nightmare<DIRECTOR_COMFORT_CAP.easy,true,'cap nightmare < cap easy');
_ok(_directorDifficulty()==='nightmare','сложность nightmare прочитана');
// комфорт 50: выше порога nightmare(45), ниже easy(85)
G.staff=[]; G.activeClients=[]; G.director.lastCrisisMonth=99999;
G.reputation=60; G.money=Math.round((-getCashflow(G))*3); // ~3 мес runway
const cm=computeComfort(G); G.director.comfort=cm;
_ok(cm>DIRECTOR_COMFORT_CAP.nightmare,'комфорт '+cm+' > порога nightmare 45');
`,'nightmare'));

add(run('Тест 6б: тот же комфорт на easy — спокойно', `
_setup();
G.staff=[]; G.activeClients=[]; G.director.lastCrisisMonth=99999;
G.reputation=60; G.money=Math.round((-getCashflow(G))*3);
for(let i=0;i<6;i++){ G.month=i; _directorTick(G); }
_ok(G.director.pressure===0,'на easy умеренный комфорт не поднимает давление (pressure='+G.director.pressure+')');
`,'easy'));

// 7: невидимая рука — усушка бюджета в комфорте
add(run('Тест 7: невидимая рука режет бюджет', `
_setup();
G.director.comfort=95; G.director.pressure=3;  // глубокий комфорт
const pen=_directorOfferPenalty(G);
_ok(pen.budgetMult<1,'budgetMult<1 в комфорте ('+pen.budgetMult+')');
// в офферах появляется отрицательный _seasonBoost (нейтральный сезон report)
G.reputation=95; G.portfolio=90; G.activeClients=[];
const y=Math.floor((G.month||0)/12); G.seasons[y]=['report','report','report','report']; G.month=0;
let trimmed=0,total=0;
for(let i=0;i<50;i++){ const offs=_generateOffers(); offs.forEach(o=>{ total++; if((o._seasonBoost||0)<0) trimmed++; }); }
_ok(total>0 && trimmed>0,'часть офферов с урезанным бюджетом ('+trimmed+'/'+total+')');
`));

// 8: обвал спроса режет офферы; overhead-скачок добавляет расход
add(run('Тест 8: demand crash + overhead spike', `
_setup();
G.reputation=95; G.portfolio=90; G.activeClients=[];
G.director.comfort=0; G.director.pressure=0; // рука выключена
const y=Math.floor((G.month||0)/12); G.seasons[y]=['report','report','report','report']; G.month=0;
let base=0; for(let i=0;i<30;i++) base+=_generateOffers().length;
G.director.demandCrashUntil=G.month+2;
let crashed=0; for(let i=0;i<30;i++) crashed+=_generateOffers().length;
_ok(crashed<base,'обвал спроса режет число офферов ('+crashed+' < '+base+')');
// overhead-скачок
G.director.overheadSpikePct=0.2; G.director.overheadSpikeUntil=G.month+1;
_ok(getDirectorOverhead(G)>0,'getDirectorOverhead>0 во время скачка ('+getDirectorOverhead(G)+')');
G.director.overheadSpikeUntil=G.month-1;
_ok(getDirectorOverhead(G)===0,'после истечения скачка overhead=0');
`));

// 9: advanceMonth с директором не падает
add(run('Тест 9: advanceMonth с директором', `
_setup();
let err=null;
try { for(let i=0;i<24;i++){ G.money=8000000; advanceMonth(); } } catch(e){ err=e; }
_ok(!err,'24 мес advanceMonth без ошибок'+(err?': '+err.message:''));
_ok(G.director && G.director.crises>=1,'директор бросал кризисы за 24 комфортных мес ('+(G.director&&G.director.crises)+')');
`));

console.log('\n══════════════════════════════════════');
console.log('ИТОГО: '+totals.pass+' ✅  /  '+totals.fail+' ❌');
process.exit(totals.fail?1:0);
