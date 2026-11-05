import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const dir='results/comparison';
const a=JSON.parse(readFileSync(`${dir}/accuracy-scores.json`));
const sources=[...JSON.parse(readFileSync(`${dir}/dataset.json`)),...JSON.parse(readFileSync('results/stress/dataset.json'))];
const standard=JSON.parse(readFileSync(`${dir}/compact-runs.json`));
const outputs=[...standard.filter(r=>r.rep===1),...readFileSync('results/stress/runs.jsonl','utf8').trim().split('\n').map(JSON.parse)];
const sha=s=>createHash('sha256').update(s).digest('hex');
const round=n=>Math.round((n+Number.EPSILON)*10)/10;
assert.equal(a.scores.length,126);assert.equal(a.questions.length,14);assert.equal(a.conditions.length,9);
assert.equal(new Set(a.scores.map(s=>`${s.condition}/${s.caseId}`)).size,126);
for(const q of sources)for(const c of a.conditions){
 const s=a.scores.find(s=>s.condition===c&&s.caseId===q.id),r=outputs.find(r=>r.condition===c&&r.caseId===q.id);
 assert.ok(s);assert.ok(r);assert.equal(s.sourceSha256,sha(q.text));assert.equal(s.translationSha256,sha(r.translation));
 assert.ok(s.score>=0&&s.score<=10);assert.ok(s.coverageFraction>=0&&s.coverageFraction<=1);
 for(const [cat,{max}]of Object.entries(a.rubric.dimensions)){
  const subtotal=Math.max(0,max-s.deductions.filter(d=>d.category===cat).reduce((n,d)=>n+d.points,0));
  assert.equal(s.availableTextSubtotal[cat],subtotal);assert.equal(s.components[cat],subtotal*s.coverageFraction);
 }
 assert.equal(s.score,round(Object.values(s.components).reduce((n,v)=>n+v,0)));
 if(!r.translation.trim())assert.equal(s.score,0);
 for(const d of s.deductions){assert.ok(d.points>0);assert.ok(d.category in a.rubric.dimensions);if(d.quote)assert.ok(r.translation.includes(d.quote));}
 const repeats=standard.filter(r=>r.condition===c&&r.caseId===q.id);
 if(repeats.length){assert.equal(repeats.length,3);assert.equal(new Set(repeats.map(r=>r.translation)).size,1);assert.equal(s.repeatOutputIdentical,true);}
}
for(const s of a.summary){
 const cells=a.scores.filter(x=>x.condition===s.condition);
 for(const [name,select]of [['standard',cells.filter(c=>c.suite==='standard')],['stress',cells.filter(c=>c.suite==='stress')],['all',cells]]){
  const sum=round(select.reduce((n,c)=>n+c.score,0));assert.equal(s[name].points,sum);assert.equal(s[name].scaled100,round(sum/(select.length*10)*100));
 }
 for(const d of ['en-ja','ja-en'])assert.equal(s.byDirection[d].points,round(cells.filter(c=>c.suite==='standard'&&c.direction===d).reduce((n,c)=>n+c.score,0)));
 for(const l of ['short','medium','long'])assert.equal(s.byLength[l].points,round(cells.filter(c=>c.suite==='standard'&&c.length===l).reduce((n,c)=>n+c.score,0)));
}
// Exercise the generated report's selection behavior using a minimal local DOM.
// This checks integration of scores, source selection, and translation output.
const html=readFileSync(`${dir}/report.html`,'utf8');
const embedded=html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1];
const payload=JSON.parse(embedded);assert.deepEqual(payload.accuracy,a);
const nodes=new Map();
function element(){return {value:'',textContent:'',innerHTML:'',handlers:{},options:[],add(o){this.options.push(o);if(this.options.length===1)this.value=o.value;},addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);},scrollIntoView(){}};}
const buttons=[...html.matchAll(/data-score-case="([^"]+)" data-score-condition="([^"]+)"/g)].map(m=>({...element(),dataset:{scoreCase:m[1],scoreCondition:m[2]}}));
assert.equal(buttons.length,126);
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll(selector){assert.equal(selector,'[data-score-case]');return buttons;}};
document.getElementById('data').textContent=embedded;
const context=vm.createContext({document,Option:class Option{constructor(text,value){this.text=text;this.value=value;}}});
for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]).runInContext(context);
for(const b of buttons){
 assert.equal(b.handlers.click.length,1);b.handlers.click[0]();
 assert.equal(nodes.get('sample').value,b.dataset.scoreCase);assert.equal(nodes.get('modelA').value,b.dataset.scoreCondition);
 const r=outputs.find(r=>r.caseId===b.dataset.scoreCase&&r.condition===b.dataset.scoreCondition),s=a.scores.find(s=>s.caseId===r.caseId&&s.condition===r.condition);
 assert.equal(nodes.get('outA').textContent,r.translation||'訳文なし');
 assert.ok(nodes.get('metaA').textContent.includes(`正確性 ${s.score.toFixed(1)}/10`));
 assert.ok(nodes.get('notesA').textContent.includes(s.reason));
}
const result={scoredCells:126,questions:14,conditions:9,sourceAndOutputHashesVerified:true,componentsAndTotalsVerified:true,standardRepetitionEqualityVerified:true,interactiveScoreSelectionsVerified:buttons.length,assessor:'Codex AI review; not independent human validation'};
writeFileSync(`${dir}/grading-validation.json`,JSON.stringify(result,null,2));console.log(result);
