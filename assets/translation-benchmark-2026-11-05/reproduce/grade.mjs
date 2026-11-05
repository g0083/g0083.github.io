import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// These are Codex's source-to-output review judgments, NOT an automatic judge.
// This script applies the declared deductions and aggregates the reviewed cells.
const dir='results/comparison';
const standard=JSON.parse(readFileSync(`${dir}/dataset.json`));
const extra=JSON.parse(readFileSync('results/stress/dataset.json'));
const inputs=[...standard,...extra];
const allStandardRuns=JSON.parse(readFileSync(`${dir}/compact-runs.json`));
const raw=allStandardRuns.filter(r=>r.rep===1);
const stress=readFileSync('results/stress/runs.jsonl','utf8').trim().split('\n').map(JSON.parse);
const runs=[...raw,...stress];
const conditions=JSON.parse(readFileSync(`${dir}/summary.json`)).conditions;
const [p08,p2,p8,e2off,e2on,e4off,e4on,g12off,g12on]=conditions;
const labels={'plamo-0.8b':'PLaMo 0.8B','plamo-2b':'PLaMo 2B','plamo-8b':'PLaMo 8B','gemma-e2b-think-off':'Gemma E2B 思考なし','gemma-e2b-think-on':'Gemma E2B 思考あり','gemma-e4b-think-off':'Gemma E4B 思考なし','gemma-e4b-think-on':'Gemma E4B 思考あり','gemma-12b-think-off':'Gemma 12B 思考なし','gemma-12b-think-on':'Gemma 12B 思考あり'};
const deductions=new Map();
function add(models,id,category,points,reason,quote=''){
 for(const condition of Array.isArray(models)?models:[models]){
  const key=`${condition}/${id}`;
  if(!deductions.has(key))deductions.set(key,[]);
  const r=runs.find(r=>r.condition===condition&&r.caseId===id);
  assert.ok(r,`Missing reviewed output ${key}`);
  if(quote)assert.ok(r.translation.includes(quote),`Evidence not present: ${key}: ${quote}`);
  deductions.get(key).push({category,points,reason,quote});
 }
}
// Short texts: every model preserves the EN-S1 constraints. Japanese source does
// not identify Tanaka's/Sato's gender, so explicit Mr. assumptions are one 0.5
// entity-information deduction per question, not one deduction per occurrence.
add(conditions,'EN-S2','meaning',1,'after November 12を11月12日以降とし、12日当日を返金対象に含めた。','11月12日以降');
add(p08,'EN-S2','meaning',2,'元値の15%になったわけではない、という対比を15%に届かなかったという到達不足に変えた。','元の価値の15%には届きませんでした');
add([p08,p2,p8,e2off,e4off,g12off,g12on],'JA-S1','entities',0.5,'原文が指定していない田中・佐藤の性別をMr.で確定した。','Mr.');
add([p08,p2,e2off,g12off],'JA-S2','meaning',2,'後続の試作品の文脈で「採用」を雇用・採用人事として訳した。','hir');

// Medium texts. Retry once is syntactically ambiguous without source quotation
// marks; treating it as a button label is recorded as ambiguity, not penalized.
add([p8,e2off],'JA-M1','completeness',0.5,'今月中の契約受領「の場合に限り」の明示的な限定onlyが弱まった。');
add(p08,'EN-M2','meaning',0.5,'笑いに安堵が感じられないという描写を、笑っても安心できなかったという因果に寄せた。','それで安心することはなかった');
add([e2off,g12off,g12on],'EN-M2','meaning',0.5,'バスが走り去りつつある進行中の描写を、すでに去った完了状態に寄せた。');
add(e4off,'EN-M2','entities',0.5,'Maraの名前をマーとし、語末の音を落とした。','マーは');
add(e4on,'EN-M2','meaning',1,'見つける対象が手紙である関係節を、青いカップを見つける構文に付け替えた。','見つけるであろう青いカップ');
add(e4on,'EN-M2','meaning',2,'手紙の日付を出発日と取り違えたことを、手紙の日に出発日を間違えたという時間関係に変えた。','手紙の日に出発日を間違えていた');

// Migration texts. Do not double-charge a missing qualifier as both a meaning
// error and an omission: scope expansion is meaning; a missing standalone fact
// is completeness. Pronunciation of 北港 is unspecified; Hokkou, Beigang,
// North Port, Kitport, Kitako are not penalized solely for their spelling.
add([p08,e4off,e4on],'EN-L1','meaning',1,'第2段階のall other departmentsからotherを落とし、研究部門も含む範囲へ広げた。','財務部門を除くすべての部門');
add(e2off,'EN-L1','completeness',0.5,'判断者がベンダーではないという明示的な対比を省いた。');
add([p08,p2,p8],'JA-L1','meaning',1,'任意の説明欄という限定optionalを落とし、説明欄一般についてロールバック不要とした。');
add(p08,'JA-L1','meaning',1,'財務部門が移行済みだと記載しないという禁止を、財務部門への通知内容の禁止に変えた。','do not state to the Finance Division');
add([e2off,e2on,e4off,e4on],'JA-L1','meaning',1,'残りの部門という限定を落とし、第2段階を財務以外の全部門へ広げた。');
add(e2off,'JA-L1','meaning',1,'財務部門が移行済みという主張を禁じる箇所で、財務部門への移行という異なる移行先を作った。','migrated to the finance department');
add([e2off,e2on],'JA-L1','entities',0.5,'北港をKitamigawaという原文に対応しない名称へ変えた。','Kitamigawa');
add(e4off,'JA-L1','entities',0.5,'北港をKitami（北見に相当）へ変え、港を保持しなかった。','Kitami');
add([e4off,e4on],'JA-L1','completeness',0.5,'財務承認用の「別の」検証報告であるという限定を省いた。','a verification report');
add(g12off,'JA-L1','meaning',0.5,'UTCを現地時刻に置き換える際の明示表示を、明示指示・許可の必要性に寄せた。','explicit instruction');

// Date boundaries are important: a full-day eligibility change costs 1 point;
// the inclusive/exclusive instant at 19:00 costs 0.5 as a finer time nuance.
add(conditions.filter(c=>c!==g12on),'EN-L2','meaning',0.5,'after 19:00を19時以降とし、厳密な時刻境界の包含を変えた。');
add(g12on,'EN-L2','meaning',0.5,'after 19:00を19時以降とし、厳密な時刻境界の包含を変えた。','19時以降');
add([e2off,e2on],'EN-L2','completeness',1,'同伴が必要なのは12歳未満という年齢条件を落とした。');
add(e2off,'EN-L2','meaning',1,'1月について決定する前に試行結果を検討する順序を、結果検討後に決定を見直すという表現へ変えた。','決定も試験結果がレビューされた後に見直される');
add(e2off,'EN-L2','entities',0.5,'日本語訳の中にタイ語表記が混入した。','ประกาศ');
add(e4off,'EN-L2','meaning',0.5,'同伴する成人という条件を保護者に限定した。','保護者の同伴');
add(conditions.filter(c=>c!==g12on),'JA-L2','meaning',0.5,'19:00以降（当該時刻を含む）をafter 19:00 / after 7 PMとし、厳密な境界を変えた。');
add([p08,p2,e2off,e2on,e4off,g12off],'JA-L2','entities',0.5,'原文にない野村さん等の性別をMr./Ms./he/sheで確定した。');
add([e2off,e2on],'JA-L2','meaning',2,'金曜までに利用開始できるbyを、金曜まで利用可能というuntilへ反転した。','until next Friday');

// Extra-long texts are assessed from their actual outputs, not copied from
// the shorter source tests: several errors change with the longer context.
add(conditions.filter(c=>c!==g12on),'EN-XL','meaning',0.5,'after 19:00を19:00以降とし、厳密な時刻境界の包含を変えた。');
add([p08,e4off,e4on],'EN-XL','meaning',1,'第2段階のotherを落とし、研究部門も含む範囲へ広げた。');
add([e2off,e2on],'EN-XL','completeness',0.5,'判断者がベンダーではないという明示的な対比を省いた。');
add([p08,p2,p8],'JA-XL','meaning',1,'任意の説明欄という限定optionalを落とし、説明欄一般にロールバック不要とした。');
add(p08,'JA-XL','meaning',1,'財務移行済みという一般的な誤記禁止を、財務部門への通知内容の禁止に変えた。','do not state to the Finance Division');
add([p08,p2,p8,e2off,e4off,e4on,g12off],'JA-XL','meaning',0.5,'19:00以降をafter 19:00 / after 7 PMとし、厳密な時刻境界の包含を変えた。');
add([p08,p2,p8,e2off,e2on,e4off,g12off],'JA-XL','entities',0.5,'原文未指定の野村さん等の性別をMr./Ms./he/sheで確定した。');
add([e2off,e2on,e4off,e4on],'JA-XL','meaning',1,'残りの部門という限定を落とし、研究部門も第2段階へ含めた。');
add([e2off,e2on],'JA-XL','completeness',1,'任意説明欄の欠落だけではロールバック不要という独立した例外規則を省いた。');
add(e2off,'JA-XL','entities',0.5,'北港をKitamigawaへ変えた。','Kitamigawa');
add(e2off,'JA-XL','meaning',2,'金曜までに利用開始するbyをuntilへ反転した。','until next Friday');
add(e4off,'JA-XL','entities',0.5,'北港をKitamiへ変えた。','Kitami');
add([e4off,e4on],'JA-XL','completeness',0.5,'財務用に別の検証報告が必要であるという限定を省いた。','a verification report');
add(g12off,'JA-XL','meaning',1,'財務部門が移行済みと述べる禁止を、財務部門を移行先とする文へ変えた。','migrated to the Finance Department');

const rubric={
 version:'accuracy-10-v1',assessor:'Codexによる原文対照のAI参考採点。モデル名を知った状態での単独採点。独立した人間採点・自動翻訳評価モデルのスコアではない。',
 dimensions:{meaning:{max:6,description:'事実・否定・因果・人物関係・条件の意味保持。主要な解釈変更2点、局所的な条件変更1点、微細な意味差0.5点を減点。'},completeness:{max:3,description:'原文の情報の網羅と余計な情報の抑制。重要な独立情報の脱落1点、補足・明示対比・限定の脱落0.5点。意味変化として減点した同じ欠落を再度減点しない。'},entities:{max:1,description:'数字・識別子・明らかな固有名・指定言語の保持。1種類の問題につき0.5点、上限1点。同種の反復は問内1回。未指定の性別の追加も問内0.5点。'}},
 rules:['文体・敬体常体・不自然さだけでは減点しない。意味が変わった場合のみ対象。','EN-M1のRetry onceのボタン名／回数の区切りは原文の引用記号が曖昧なので減点しない。','北港の読みは指定がないためHokkou/Beigang/North Port/Kitport/Kitakoの差だけでは減点しない。Kitami/Kitamigawaの明らかな別名化は減点。','19時の包含境界は微細差として0.5点。11月12日全体を返金対象へ含める境界変更は1点。EN-L2の事前の概略チェックでは19時以降と表記したが、本採点では原文after 19:00の厳密な境界を優先して全モデルを同じ基準で評価した。','初回の最終訳のみ採点し、思考文を訳として数えない。通常比較は3回の最終訳一致を照合し、同じ訳を3問に水増ししない。','最終訳なしは0点。部分訳は訳出済み範囲に対する3区分の得点に訳出範囲比を乗じる。','追加長文の範囲比は12内容段落を単位に、全文1、半分0.5、未訳0で確認。E2B思考ありJA-XLは7.5/12、12B思考ありJA-XLは1.5/12。','各問は小数1桁。合計は表示した各問の点数を加算。100点換算は合計/満点×100であり、正答率・確率ではない。','短文・中程度・通常長文を各4問、英日・日英を各6問として等重み集計。追加2問は通常12問と別集計し、全14問の参考値も併記。','10点は本基準による原文照合で減点を確認しなかったという意味で、無誤訳の保証ではない。小差は採点者や採点基準で逆転し得る。']
};
const sha=s=>createHash('sha256').update(s).digest('hex');
const round=n=>Math.round((n+Number.EPSILON)*10)/10;
const scores=[];
for(const item of inputs)for(const condition of conditions){
 const r=runs.find(r=>r.condition===condition&&r.caseId===item.id);assert.ok(r);
 const ds=deductions.get(`${condition}/${item.id}`)??[];
 let fraction=1,coverageNote='原文末尾まで訳出。';
 if(!r.translation?.trim()){fraction=0;coverageNote='最終訳なし。思考文は翻訳出力として加点しない。';}
 else if(condition===e2on&&item.id==='JA-XL'){fraction=7.5/12;coverageNote='移行計画6段落＋会議記録1段落＋次段落の約半分を訳出。補助金計算の途中で切断。';}
 else if(condition===g12on&&item.id==='JA-XL'){fraction=1.5/12;coverageNote='移行計画の第1段落＋第2段落の約半分を訳出。隔離試験環境への復元説明の途中で切断。';}
 const subtotal={};
 for(const [cat,{max}] of Object.entries(rubric.dimensions))subtotal[cat]=Math.max(0,max-ds.filter(d=>d.category===cat).reduce((s,d)=>s+d.points,0));
 const components=Object.fromEntries(Object.entries(subtotal).map(([k,n])=>[k,n*fraction]));
 const score=round(Object.values(components).reduce((a,b)=>a+b,0));
 const all=allStandardRuns.filter(x=>x.condition===condition&&x.caseId===item.id);
 scores.push({condition,caseId:item.id,direction:item.direction,length:item.length,suite:item.id.endsWith('XL')?'stress':'standard',rep:1,score,max:10,components,availableTextSubtotal:subtotal,coverageFraction:fraction,coverageNote,stopReason:r.stats.stopReason,translationCharacters:r.translation.length,sourceSha256:sha(item.text),translationSha256:sha(r.translation),deductions:ds,reason:!fraction?coverageNote:ds.length?ds.map(d=>d.reason).join(' '):'確認項目と全文を原文照合し、本採点基準での減点は確認しなかった。',repeatOutputIdentical:all.length?new Set(all.map(x=>x.translation)).size===1:null});
}
assert.equal(scores.length,126);assert.equal(new Set(scores.map(s=>`${s.condition}/${s.caseId}`)).size,126);
const sum=ss=>round(ss.reduce((a,s)=>a+s.score,0));
const summary=conditions.map(condition=>{
 const cells=scores.filter(s=>s.condition===condition),normal=cells.filter(s=>s.suite==='standard'),stress=cells.filter(s=>s.suite==='stress');
 const group=ss=>({n:ss.length,points:sum(ss),max:ss.length*10,scaled100:round(sum(ss)/(ss.length*10)*100)});
 return {condition,label:labels[condition],standard:group(normal),stress:group(stress),all:group(cells),byDirection:Object.fromEntries(['en-ja','ja-en'].map(d=>[d,group(normal.filter(s=>s.direction===d))])),byLength:Object.fromEntries(['short','medium','long'].map(l=>[l,group(normal.filter(s=>s.length===l))])),answeredOnly:group(normal.filter(s=>s.coverageFraction>0)),noFinalTranslation:normal.filter(s=>s.coverageFraction===0).length};
});
writeFileSync(`${dir}/accuracy-scores.json`,JSON.stringify({rubric,labels,questions:inputs.map(({id,direction,length,genre,checks})=>({id,direction,length,genre,checks})),conditions,scores,summary},null,2));
console.log(JSON.stringify(summary.map(s=>({condition:s.condition,standard:s.standard,stress:s.stress,all:s.all})),null,2));
