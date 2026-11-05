import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
function rows(dir){return readFileSync(`${dir}/runs.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}
const main=rows('results/comparison');
assert.equal(main.length,324);
assert.equal(new Set(main.map(r=>`${r.condition}/${r.caseId}/${r.rep}`)).size,324);
const conditions=[...new Set(main.map(r=>r.condition))];assert.equal(conditions.length,9);
for(const r of main){
 assert.equal(r.error,undefined,JSON.stringify([r.condition,r.caseId,r.error]));
 assert.equal(r.loadConfig.fields.find(f=>f.key==='llm.load.contextLength')?.value,4096);
 assert.equal(r.predictionConfig.fields.find(f=>f.key==='llm.prediction.temperature')?.value,0);
 assert.equal(r.predictionConfig.fields.find(f=>f.key==='llm.prediction.contextOverflowPolicy')?.value,'stopAtLimit');
 for(const field of r.predictionConfig.fields){if(field.key==='llm.prediction.contextPrefill')assert.deepEqual(field.value,[]);if(field.key==='llm.prediction.systemPrompt')assert.equal(field.value,'');}
 assert.ok(r.stats.totalTokensCount<=4096,`${r.condition}/${r.caseId} exceeds context`);
 if(r.condition.startsWith('gemma')){
  assert.ok(r.stats.totalDraftTokensCount>0,`${r.condition}/${r.caseId} MTP inactive`);
  const thinking=r.condition.endsWith('-on');
  assert.equal(r.predictionConfig.fields.find(f=>f.key==='llm.prediction.reasoning.enableThinking')?.value,thinking);
  assert.equal(Boolean(r.reasoning?.length),thinking);
 }
}
const review=JSON.parse(readFileSync('results/comparison/quality-review.json'));
assert.deepEqual(new Set(review.reviewed),new Set(conditions));
const quotes=[];
for(const n of review.observations){const r=main.find(r=>r.condition===n.condition&&r.caseId===n.caseId&&r.rep===1);if(!r.translation.includes(n.output))quotes.push(n);if(n.severity==='incomplete'){assert.equal(r.translation.trim(),'');assert.equal(r.stats.stopReason,'maxPredictedTokensReached');}}
assert.equal(quotes.length,0,'Review quotation mismatch: '+JSON.stringify(quotes));
const result={mainRuns:main.length,conditions:conditions.length,context:4096,gemmaMtpVerifiedRuns:main.filter(r=>r.condition.startsWith('gemma')).length,reasoningModesVerified:true,reviewQuotesVerified:review.observations.length};
if(existsSync('results/stress/runs.jsonl')){const extra=rows('results/stress');assert.equal(extra.length,18);result.stressRuns=extra.length;for(const r of extra){assert.equal(r.error,undefined);assert.ok(r.stats.totalTokensCount<=4096);assert.equal(r.loadConfig.fields.find(f=>f.key==='llm.load.contextLength')?.value,4096);if(r.condition.startsWith('gemma'))assert.ok(r.stats.totalDraftTokensCount>0);}result.stressSuccessful=extra.filter(r=>['eosFound','stopStringFound'].includes(r.stats.stopReason)&&r.translation.trim()).length;}
if(existsSync('results/comparison/report.html')){
 const html=readFileSync('results/comparison/report.html','utf8');
 const payload=JSON.parse(html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1]);
 assert.equal(payload.summary.runs,324);assert.equal(payload.summary.conditions.length,9);assert.equal(payload.runs.length,342);assert.equal(payload.dataset.length,14);
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 result.reportDataAndJavascriptVerified=true;
}
writeFileSync('results/comparison/validation.json',JSON.stringify(result,null,2));console.log(result);
