'use strict';
// Точечный дебаг одного LC-проекта: помесячный дамп стейта
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function makeClassList() { const s = new Set(); return { add:c=>s.add(c), remove:c=>s.delete(c), toggle:c=>s.has(c)?s.delete(c):s.add(c), contains:c=>s.has(c) }; }
function makeEl(id) {
  const el = { id:id||'', textContent:'', value:'', className:'', style:{}, dataset:{}, children:[], disabled:false, onclick:null,
    appendChild(c){ el.children.push(c); return c; }, removeChild(){}, remove(){}, insertBefore(c){ el.children.push(c); return c; },
    setAttribute(){}, getAttribute(){return null;}, removeAttribute(){}, addEventListener(){}, removeEventListener(){},
    querySelector(){return makeEl();}, querySelectorAll(){return [];}, closest(){return null;}, focus(){}, blur(){}, click(){},
    getBoundingClientRect(){return {top:0,left:0,width:0,height:0};}, scrollIntoView(){} };
  el.classList = makeClassList();
  let h=''; Object.defineProperty(el,'innerHTML',{ get(){return h;}, set(v){ h=v; el.children.length=0; } });
  return el;
}
const REG = new Map();
const byId = id => { if (!REG.has(id)) REG.set(id, makeEl(id)); return REG.get(id); };
const sandbox = { console, Math, Date, JSON, Intl, setTimeout, clearTimeout,
  document: { getElementById: byId, createElement: ()=>makeEl(), querySelector: ()=>makeEl(), querySelectorAll: ()=>[], body: makeEl('body'), addEventListener(){}, removeEventListener(){} },
  localStorage: { getItem(){return null;}, setItem(){}, removeItem(){} }, navigator: {}, renderPortfolioTab(){} };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const FILES = ['src/constants.js','src/events.js','scenarios/agency.js','src/engine.js','src/projects.js','src/staff.js'];
const src = FILES.map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');

const DBG = String.raw`
Math.random = (() => { let seed = 42; return () => { seed = (seed*1103515245+12345) % 2147483648; return seed/2147483648; }; })();
initState(); selectSpec(Object.keys(SPECS)[0]); startGame();

const lcModal = document.getElementById('lc-modal');
const lcChoices = document.getElementById('lc-modal-choices');
function pump(pickIdx) {
  let g = 30;
  while (lcModal.classList.contains('active') && g-- > 0) {
    const btns = lcChoices.children.filter(b => b.onclick && !b.disabled)
      .filter(b => !(b.innerHTML||'').includes('Отказаться'));
    if (!btns.length) { console.log('  !! нет кнопок'); break; }
    const btn = btns[Math.min(pickIdx, btns.length-1)];
    const t = document.getElementById('lc-modal-title').textContent;
    const l = ((btn.innerHTML.match(/choice-title">([^<]*)</)||[])[1]||'?').trim();
    console.log('  [клик] «'+t+'» → '+l);
    btn.onclick();
  }
}

doLifecycleScouting();
const def = G.scoutPool.find(p => p.id === 'lc_full');
console.log('=== ПОДПИСЫВАЕМ lc_full ===');
signProject(def.id);
pump(0); // всегда первый вариант
const c = G.activeClients.find(a => a.id.startsWith('lc_full'));
console.log('после подписания: budget=' + c._totalBudget + ' оригинал=' + c._originalBudget +
  ' duration=' + c._duration + ' chain=' + JSON.stringify(c._lcChain) + ' phase=' + c._lcPhase +
  ' milestones=' + JSON.stringify(c._milestones) + ' pcts=' + JSON.stringify(c._milestonePcts));

for (let m = 0; m < 12; m++) {
  const before = G.money;
  advanceMonth();
  pump(0);
  const cc = G.activeClients.find(a => a.id.startsWith('lc_full'));
  if (cc) {
    console.log('M'+G.month+': phase='+cc._lcPhase+' прогресс='+Math.round(cc._progress||0)+
      '% budget='+cc._totalBudget+' Δденьги='+Math.round(G.money-before)+
      ' monthsSigned='+cc._monthsSigned+' workStart='+cc._workStartMonth+
      ' pending='+!!cc._lcPendingDecision);
    if (cc._lcPendingDecision) { Projects.resolveWorkEvent(cc.id); pump(0); }
  } else {
    console.log('M'+G.month+': ЗАВЕРШЁН. Δденьги='+Math.round(G.money-before)+
      ' запись: '+JSON.stringify((G.completedProjects||[]).slice(-1)[0]));
    break;
  }
}
`;
try { vm.runInContext(src + '\n;\n' + DBG, sandbox, { filename: 'debug-lc.js' }); }
catch (e) { console.error('💥', e); }
