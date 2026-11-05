import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dataset} from './dataset.mjs';
const dir='results/comparison';
const rows=readFileSync(`${dir}/runs.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
// Legacy capture accepted reasoning delimiters as a final-text candidate. Preserve
// that raw observation under an accurate name; it is not a final-translation TTFT.
if(rows.some(r=>r.schemaVersion===undefined)){
 for(const r of rows){if(r.schemaVersion===undefined){r.schemaVersion=1;r.firstNonReasoningFragmentCandidateSeconds=r.firstFinalSeconds;delete r.firstFinalSeconds;}}
 writeFileSync(`${dir}/runs.jsonl`,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
}
const conditions=[...new Set(rows.map(r=>r.condition))];
const median=a=>{a=[...a].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const success=r=>!r.error&&r.translation?.trim()&&['eosFound','stopStringFound'].includes(r.stats?.stopReason);
const groups=[];
for(const condition of conditions){
 const cr=rows.filter(r=>r.condition===condition);
 for(const direction of ['all','en-ja','ja-en'])for(const length of ['all','short','medium','long']){
  const subset=cr.filter(r=>(direction==='all'||r.direction===direction)&&(length==='all'||r.length===length));
  if(!subset.length)continue;
  const cases=[...new Set(subset.map(r=>r.caseId))].map(caseId=>{
   const rs=subset.filter(r=>r.caseId===caseId);const valid=rs.filter(r=>r.seconds!==undefined);
   return {caseId,runs:rs.length,successful:rs.filter(success).length,seconds:median(valid.map(r=>r.seconds)),ttft:median(valid.map(r=>r.stats.timeToFirstTokenSec)),outputTokens:median(valid.map(r=>r.stats.predictedTokensCount)),tokensPerSecond:median(valid.map(r=>r.stats.tokensPerSecond)),translationVariants:new Set(valid.map(r=>r.translation)).size};
  });
  groups.push({condition,direction,length,n:subset.length,successful:subset.filter(success).length,cases:cases.length,secondsMeanOfCaseMedians:mean(cases.map(c=>c.seconds)),secondsSumOfCaseMedians:cases.reduce((s,c)=>s+c.seconds,0),ttftMeanOfCaseMedians:mean(cases.map(c=>c.ttft)),tokensPerSecondMeanOfCaseMedians:mean(cases.map(c=>c.tokensPerSecond)),caseMetrics:cases});
 }
}
const runtime=readFileSync(`${dir}/runtime.jsonl`,'utf8').split('\n').flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});
const evidence=runtime.filter(r=>/draft acceptance/.test(r.data?.message??''));
const summary={runs:rows.length,conditions,groups,mtpEvidence:evidence.map(r=>({model:r.data.modelIdentifier,message:r.data.message.split('\n').filter(l=>l.includes('draft acceptance')).join('\n')})),failures:rows.filter(r=>!success(r)).map(r=>({condition:r.condition,caseId:r.caseId,rep:r.rep,stopReason:r.stats?.stopReason,error:r.error,translationCharacters:r.translation?.length})),gpu:[...new Set(rows.flatMap(r=>[r.gpuBefore,r.gpuAfter,...r.gpuSamples??[]]).filter(Boolean))]};
writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2));
const flat=groups.filter(g=>g.direction==='all'&&g.length==='all').map(g=>({condition:g.condition,runs:g.n,successful:g.successful,totalSeconds:g.secondsSumOfCaseMedians,meanSeconds:g.secondsMeanOfCaseMedians,longSeconds:groups.find(x=>x.condition===g.condition&&x.direction==='all'&&x.length==='long')?.secondsMeanOfCaseMedians}));
console.log(JSON.stringify({runs:rows.length,flat,failures:summary.failures},null,2));
let translated='# 翻訳出力と評価チェック項目\n\n初回測定の訳文。原文は自作。チェック項目は意味の確認用であり、自動採点の正解文字列ではありません。\n';
for(const item of dataset){translated+=`\n## ${item.id} (${item.direction}, ${item.length})\n\n${item.text}\n\n確認項目: ${item.checks.join(' / ')}\n`;for(const condition of conditions){const r=rows.find(r=>r.condition===condition&&r.caseId===item.id&&r.rep===1);if(r)translated+=`\n### ${condition}\n\n終了理由: ${r.stats?.stopReason??r.error} / ${(r.seconds??0).toFixed(3)}秒\n\n${r.translation||'（訳文なし）'}\n`;}}
writeFileSync(`${dir}/translations.md`,translated);
writeFileSync(`${dir}/compact-runs.json`,JSON.stringify(rows.map(({loadConfig,predictionConfig,reasoning,firstFinalSeconds,firstNonReasoningFragmentCandidateSeconds,...r})=>({...r,reasoningCharacters:reasoning?.length,thinkingEnabled:predictionConfig?.fields?.find(f=>f.key==='llm.prediction.reasoning.enableThinking')?.value})),null,2));
// Hashes establish source corpus identity for reruns.
writeFileSync(`${dir}/dataset.sha256`,createHash('sha256').update(readFileSync(`${dir}/dataset.json`)).digest('hex')+'\n');
