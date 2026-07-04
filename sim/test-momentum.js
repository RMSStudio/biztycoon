'use strict';
// ══════════════════════════════════════════════════════
//  Тест opportunity-cost: «разгон» спеца на проекте (v3.104)
//  Перевод на другой проект сбрасывает разгон → штраф скорости; сидит на одном —
//  набирает до полной. Гейт: только rogue-lite (Unlocks.isActive). Вне режима no-op.
// ══════════════════════════════════════════════════════
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function makeClassList(){ const s=new Set(); return {add:c=>s.add(c),remove:c=>s.delete(c),toggle:c=>s.has(c)?s.delete(c):s.add(c),contains:c=>s.has(c)}; }
function makeEl(id){ const el={id:id||'',textContent:'',value:'',className:'',title:'',style:{},dataset:{},children:[],disabled:false,onclick:null,parentElement:null,
  appendChild(c){this.children.push(c);return c;},removeChild(){},remove(){},insertBefore(c){return c;},setAttribute(){},getAttribute(){return null;},removeAttribute(){},
  addEventListener(){},removeEventListener(){},querySelector(){return makeEl();},querySelectorAll(){return[];},closest(){return null;},focus(){},blur(){},click(){},getBoundingClientRect(){return{top:0,left:0,width:0,height:0};},scrollIntoView(){}};
  el.classList=makeClassList(); let _h=''; Object.defineProperty(el,'innerHTML',{get(){return _h;},set(v){_h=v;el.children.length=0;}}); return el; }
const REG=new Map(); const byId=id=>{if(!REG.has(id))REG.set(id,makeEl(id));return REG.get(id);};
const fakeDoc={getElementById:byId,createElement:()=>makeEl(),querySelector(){return makeEl();},querySelectorAll:()=>[],body:makeEl('body'),addEventListener(){},removeEventListener(){}};
function makeSandbox(modeOn){ REG.clear(); const _ls={};
  if(modeOn){ _ls['bt_enabled_dlcs_v1']=JSON.stringify(['unlocks']);
              _ls['bt_unlocks_v1']=JSON.stringify({opened:['hire'],exp:0,firsts:{},runs:0}); } // hire открыт → НЕ голый ран
  const sb={console,Math,Date,JSON,Intl,setTimeout,clearTimeout,document:fakeDoc,
    localStorage:{getItem(k){return Object.prototype.hasOwnProperty.call(_ls,k)?_ls[k]:null;},setItem(k,v){_ls[k]=String(v);},removeItem(k){delete _ls[k];}},
    navigator:{},renderPortfolioTab(){},__TR:{pass:0,fail:0,log:[]}}; sb.window=sb; sb.globalThis=sb; return sb; }
function loadSrc(){ const F=['src/constants.js','src/events.js','scenarios/agency.data.js','src/scenario-loader.js','src/engine.js','src/projects.js','src/staff.js','src/livingmarket.js','src/unlocks.js'];
  return F.map(f=>'// ===== '+f+' =====\n'+fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n'); }
const HARNESS=String.raw`
function _ok(c,m){if(c){__TR.pass++;__TR.log.push('✅ '+m);}else{__TR.fail++;__TR.log.push('❌ '+m);}}
function _setup(){ initState(); selectSpec('smm'); startGame(); }
`;
function run(name,modeOn,body){ const sb=makeSandbox(modeOn); const src=loadSrc()+'\n;\n'+HARNESS+'\n;\n'+body; vm.createContext(sb);
  try{vm.runInContext(src,sb);}catch(e){console.log('💥 ['+name+']:',e.message);sb.__TR.fail++;}
  console.log('── '+name+' ──'); sb.__TR.log.forEach(l=>console.log(l)); return sb.__TR; }
const totals={pass:0,fail:0}; function add(r){totals.pass+=r.pass;totals.fail+=r.fail;}

// ── 1: В РЕЖИМЕ — разгон работает ──────────────────────────────────────
add(run('Разгон в режиме rogue-lite', true, `
_setup();
_ok(Unlocks.isActive(), 'режим активен');
_ok(_rampActive(), '_rampActive true');
var sp = { _iid:'sp1', id:'sp1', role:'developer', grade:'senior', qStat:7, mood:80, status:'active' };
G.staff = [sp];
var A = { id:'prA', _assignedStaff:[], tier:2 }, B = { id:'prB', _assignedStaff:[], tier:2 };
G.activeClients = [A, B];
var wu = calcStaffWorkUnit(sp);

assignStaffToProject('sp1','prA');
_ok(sp._rampMo===0, 'после назначения разгон = 0');
_ok(Math.abs(rampMult(sp)-0.5)<1e-9, 'разгон 0 → ×0.5');
_ok(Math.abs(getProjectThroughput(A) - (2 + wu*0.5))<1e-6, 'throughput = 2 + wu×0.5');

sp._rampMo = 1; _ok(Math.abs(rampMult(sp)-0.75)<1e-9, 'разгон 1 → ×0.75');
sp._rampMo = 2; _ok(Math.abs(rampMult(sp)-1)<1e-9, 'разгон 2 → ×1.0 (полный)');
_ok(Math.abs(getProjectThroughput(A) - (2 + wu))<1e-6, 'полный throughput при разгоне 2');

// повторное назначение на ТОТ ЖЕ проект — разгон сохраняется
assignStaffToProject('sp1','prA');
_ok(sp._rampMo===2, 'повтор на тот же проект → разгон сохранён (2)');
// перевод на ДРУГОЙ проект — сброс
assignStaffToProject('sp1','prB');
_ok(sp._rampMo===0, 'перевод на другой проект → сброс в 0');
_ok(B._assignedStaff.includes('sp1') && !A._assignedStaff.includes('sp1'), 'спец перемещён A→B');
// снятие — очистка
sp._rampMo=2; unassignStaff('sp1');
_ok(sp._rampMo===0 && sp._assignedProjectId===null, 'снятие сбрасывает разгон');

// месячный инкремент через advanceMonth (hire открыт → не голый ран, конца не будет)
assignStaffToProject('sp1','prA'); sp._rampMo=0;
advanceMonth(); _ok(sp._rampMo===1, 'месяц: разгон 0→1');
advanceMonth(); _ok(sp._rampMo===2, 'месяц: разгон 1→2');
advanceMonth(); _ok(sp._rampMo===2, 'разгон капится на 2');
`));

// ── 2: ВНЕ РЕЖИМА — no-op (классика не тронута) ────────────────────────
add(run('Вне режима — разгон no-op', false, `
_setup();
_ok(!(_rampActive()), '_rampActive false вне режима');
var sp = { _iid:'s2', id:'s2', role:'developer', grade:'senior', qStat:7, mood:80, status:'active' };
G.staff = [sp]; var A = { id:'pA', _assignedStaff:[], tier:2 }; G.activeClients=[A];
assignStaffToProject('s2','pA');
_ok(Math.abs(rampMult(sp)-1)<1e-9, 'вне режима rampMult=1 (штрафа нет)');
var wu = calcStaffWorkUnit(sp);
_ok(Math.abs(getProjectThroughput(A) - (2 + wu))<1e-6, 'вне режима throughput полный сразу');
`));

console.log('\nИтог: ' + totals.pass + '/' + (totals.pass + totals.fail) + ' проверок прошли');
if (totals.fail > 0) process.exit(1);
