import { LMStudioClient } from '@lmstudio/sdk';
import { appendFileSync, writeFileSync, mkdirSync, existsSync, readFileSync, createWriteStream } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { dataset as standardDataset } from './dataset.mjs';
const stress=process.env.LLM_BENCH_STRESS==='1';
const dataset=stress?['en-ja','ja-en'].map(direction=>({id:direction==='en-ja'?'EN-XL':'JA-XL',direction,length:'long-stress',genre:'mixed-document',text:standardDataset.filter(x=>x.direction===direction&&x.length==='long').map(x=>x.text).join('\n\n---\n\n'),checks:['2文書の全段落を末尾まで翻訳','否定・数値・例外条件を保持']})):standardDataset;
const REPS=stress?1:3,TOTAL=dataset.length*9*REPS;
const dir=stress?'results/stress':'results/comparison'; mkdirSync(dir,{recursive:true});
const client=new LMStudioClient();
const modelRoot=process.env.LM_MODELS_DIR;
if(!modelRoot)throw new Error('Set LM_MODELS_DIR to your LM Studio model directory before running.');
const models=[
 {id:'plamo-0.8b',key:'plamo-3-translate-0.8b'},
 {id:'plamo-2b',key:'plamo-3-translate-2b'},
 {id:'plamo-8b',key:'plamo-3-translate-8b'},
 {id:'gemma-e2b',key:'gemma-4-e2b-it-qat',draft:path.join(modelRoot,"amaranus/Gemma-4-E2B-it-qat-assistant-MTP-Q8_0-GGUF/gemma-4-E2B-it-qat-assistant-MTP-Q8_0.gguf")},
 {id:'gemma-e4b',key:'gemma-4-e4b-it-qat',draft:path.join(modelRoot,"unsloth/gemma-4-E4B-it-GGUF/mtp-gemma-4-E4B-it-Q8_0.gguf")},
 {id:'gemma-12b',key:'google/gemma-4-12b-qat',draft:path.join(modelRoot,"yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF/gemma-4-12B-it-MTP-Q8_0.gguf")},
];
const dataPath=`${dir}/runs.jsonl`;
const completed=new Set(existsSync(dataPath)?readFileSync(dataPath,'utf8').trim().split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return `${r.condition}/${r.caseId}/${r.rep}`;}):[]);
writeFileSync(`${dir}/dataset.json`,JSON.stringify(dataset,null,2));
writeFileSync(`${dir}/protocol.json`,JSON.stringify({created:new Date().toISOString(),contextLength:4096,repetitions:REPS,temperature:0,seed:42,reasoningBudget:false,contextOverflowPolicy:'stopAtLimit',maxTokens:'4096 minus measured prompt tokens minus 32 reserve; same total context for all',cachePolicy:'Before EVERY warmup/measured translation: raw completion of unrelated cache-reset text with 1 output token replaces active slot; no conversation history; context checkpoints disabled.',warmup:'one short translation in each direction for each condition; excluded',models,notes:[stress?'Extra context-capacity probe: concatenates the two existing long texts per direction, one trial each; not a repeated timing benchmark.':'Synthetic original corpus, 12 texts, 4 short/4 medium/4 long. Not a standardized external translation benchmark.','Quality assessed separately from timing; context/output exhaustion is a failure, never silently truncated input.','All Gemma runs use external assistant head via --spec-type draft-mtp.','All models use one slot, full requested GPU offload, Flash Attention, f16 KV; record actual GPU data and runtime logs.','Model order fixed; text order deterministically rotated/reversed per repetition. Results are within this session, not thermal-order-controlled.']},null,2));
const log=spawn(process.env.LMS_EXE || 'lms',['log','stream','--source','runtime','--json'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
const logFile=createWriteStream(`${dir}/runtime.jsonl`,{flags:'a'});log.stdout.pipe(logFile);log.stderr.pipe(logFile);
function gpu(){try{return execFileSync('nvidia-smi',['--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,pstate','--format=csv,noheader'],{encoding:'utf8',windowsHide:true}).trim();}catch{return null;}}
async function reset(model){await model.complete('UNRELATED CACHE RESET '+Date.now()+' '+Math.random().toString(36),{maxTokens:1,temperature:0,contextOverflowPolicy:'stopAtLimit'});}
function sourcePrompt(item){const [src,tgt]=item.direction.split('-');return `<|plamo:tag|>dataset<|plamo:msg|>translation<|plamo:tag|>input<|plamo:key|>lang<|plamo:val|>${src}<|plamo:msg|>${item.text}<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>${tgt}<|plamo:msg|>`;}
function history(item){return [{role:'user',content:`Translate the following ${item.direction==='en-ja'?'English text into Japanese':'Japanese text into English'}. Translate the entire text faithfully, preserving all facts, conditions, numbers, names, and paragraph structure. Do not summarize or add commentary. Output only the translation.\n\n${item.text}`}];}
async function predict(model,spec,item,thinking){
 const prompt=spec.draft?await model.applyPromptTemplate(history(item)):sourcePrompt(item);
 const inputTokens=await model.countTokens(prompt);
 if(inputTokens>4000)throw new Error(`Input too large ${inputTokens} for ${item.id}`);
 await reset(model);
 const opts={temperature:0,seed:42,maxTokens:4096-inputTokens-32,contextOverflowPolicy:'stopAtLimit',repeatPenalty:1,topKSampling:1,topPSampling:false,minPSampling:false,enableThinking:thinking==='on',reasoningBudget:false};
 if(!spec.draft)opts.stopStrings=['<|plamo:tag|>','<|plamo:bos|>'];
 const before=gpu();let peak=before;const samples=[];
 const sampler=setInterval(()=>{const s=gpu();if(s)samples.push(s);},1000);
 const begin=performance.now();let firstAny=null,firstFinal=null;
 const prediction=spec.draft?model.respond(history(item),opts):model.complete(prompt,opts);
 const timer=setTimeout(()=>prediction.cancel(),180000);
 let result;
 try {for await(const fragment of prediction){if(fragment.content&&firstAny===null)firstAny=(performance.now()-begin)/1000;if(fragment.content&&fragment.reasoningType==='none'&&!fragment.isStructural&&firstFinal===null)firstFinal=(performance.now()-begin)/1000;}result=await prediction;}
 finally{clearTimeout(timer);clearInterval(sampler);}
 const seconds=(performance.now()-begin)/1000;
 return {promptTokensEstimate:inputTokens,maxOutputTokens:opts.maxTokens,seconds,firstAnySeconds:firstAny,firstFinalSeconds:firstFinal,translation:spec.draft?result.nonReasoningContent:result.content,reasoning:result.reasoningContent,stats:result.stats,loadConfig:result.loadConfig,predictionConfig:result.predictionConfig,gpuBefore:before,gpuAfter:gpu(),gpuSamples:samples};
}
try{
 for(const spec of models){
  let model;
  try{
   const config={contextLength:4096,maxParallelPredictions:1,gpu:{ratio:1},flashAttention:true,contextCheckpoints:0,speculativeDraftMtp:false,speculativeDraftSimple:false};
   if(spec.draft)config.llamaCppArgumentsOverride={enabled:true,excludeAllConfig:false,disabledParameters:[],overrideParameters:[{key:'--model-draft',value:spec.draft},{key:'--spec-type',value:'draft-mtp'},{key:'--spec-draft-n-max',value:'4'}]};
   console.log('LOAD',spec.id);
   model=await client.llm.load(spec.key,{identifier:`bench-${spec.id}`,config,verbose:false,signal:AbortSignal.timeout(120000)});
   if(await model.getContextLength()!==4096)throw new Error('Context length mismatch');
   writeFileSync(`${dir}/${spec.id}-load.json`,JSON.stringify(await model.getLoadConfig(),null,2));
   for(const thinking of spec.draft?['off','on']:['na']){
    const condition=spec.id+(spec.draft?`-think-${thinking}`:'');
    if(dataset.every(item=>Array.from({length:REPS},(_,i)=>i+1).every(rep=>completed.has(`${condition}/${item.id}/${rep}`))))continue;
    console.log('WARMUP',condition);
    for(const item of [standardDataset[0],standardDataset[2]])await predict(model,spec,item,thinking);
    for(let rep=1;rep<=REPS;rep++){
     const order=rep===2?[...dataset].reverse():[...dataset.slice((rep-1)*3),...dataset.slice(0,(rep-1)*3)];
     for(const item of order){
      const runId=`${condition}/${item.id}/${rep}`;if(completed.has(runId))continue;
      const row={schemaVersion:2,condition,caseId:item.id,direction:item.direction,length:item.length,genre:item.genre,rep,timestamp:new Date().toISOString()};
      try{Object.assign(row,await predict(model,spec,item,thinking));}catch(error){row.error=String(error);}
      appendFileSync(dataPath,JSON.stringify(row)+'\n');completed.add(runId);
      writeFileSync(`${dir}/progress.json`,JSON.stringify({last:runId,completed:completed.size,total:TOTAL,time:new Date().toISOString()},null,2));
      console.log('DONE',runId,row.seconds?.toFixed(2),row.stats?.stopReason,row.error??'');
      if(row.error)throw new Error(row.error);
     }
    }
   }
  }finally{if(model)await model.unload();}
 }
}finally{log.kill();logFile.end();}
console.log('ALL COMPLETE');process.exit(0);
