import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {renderScoresMarkdown,renderScoresHTML} from './render-grades.mjs';
const dir='results/comparison';
const summary=JSON.parse(readFileSync(`${dir}/summary.json`));
const quality=JSON.parse(readFileSync(`${dir}/quality-review.json`));
const dataset=JSON.parse(readFileSync(`${dir}/dataset.json`));
const runs=JSON.parse(readFileSync(`${dir}/compact-runs.json`));
const accuracy=existsSync(`${dir}/accuracy-scores.json`)?JSON.parse(readFileSync(`${dir}/accuracy-scores.json`)):null;
const labels={'plamo-0.8b':'PLaMo 0.8B','plamo-2b':'PLaMo 2B','plamo-8b':'PLaMo 8B','gemma-e2b-think-off':'Gemma E2B / 思考なし','gemma-e2b-think-on':'Gemma E2B / 思考あり','gemma-e4b-think-off':'Gemma E4B / 思考なし','gemma-e4b-think-on':'Gemma E4B / 思考あり','gemma-12b-think-off':'Gemma 12B / 思考なし','gemma-12b-think-on':'Gemma 12B / 思考あり'};
const groups=summary.groups;
const metric=(c,d,l)=>groups.find(g=>g.condition===c&&g.direction===d&&g.length===l);
const f=n=>Number(n).toFixed(2);
let md=`# ローカル翻訳比較 — RTX 4070 12GB\n\n測定日: 2026-11-05（日本時間）。${summary.runs}/324回。\n\n## 条件\n\n全モデル4096トークン、単一モデル・単一リクエスト、全層GPU配置を要求、Flash Attention、f16 KV。PLaMoはQ4_K_M、GemmaはQAT Q4_0と別配布MTPヘッド（Q8_0）を使用。Gemmaは思考あり・なしを分離。temperature=0、top-k=1、seed=42、思考予算は無制限。入力＋思考＋訳文で4096を共有し、入力切り捨てを禁止。\n\nPLaMoは公式PFML3翻訳プロンプト、Gemmaは組み込みチャットテンプレートと共通の忠実翻訳指示を使用。各条件で英日・日英のウォームアップを行い、各測定前に無関係な1トークン生成を挟んでスロットの前回プロンプトを置き換え、文脈チェックポイントを無効化。各原文3回の中央値を取り、同じ長さ・方向内で平均。モデルロード、ウォームアップ、キャッシュ置換、GPU計測呼び出しの前後は翻訳時間から除外。生成中の1秒間隔GPU計測の負荷は含む。\n\n原文は自作12本（英日6、日英6）。短文4、中程度4、長文4。英語長文は486/491語、日本語長文は1250/1176字。公開ベンチマーク・人間独立採点ではなく、この原文セットでの比較。GPUを専有せず、既存アプリのVRAM使用は残した。同じ順序でモデルを測定しているため、温度・順序効果を完全には除いていない。\n\n## 速度\n\n単位は秒。「長文」は4本の各3回中央値を平均。「12本合計」は各原文の中央値を合計。思考ありは思考時間を含む。終了理由が正常でも意味の正しさは保証しない。\n\n| 条件 | 短文平均 | 中程度平均 | 長文平均 | 12本合計 | 正常終了回数 |\n|---|---:|---:|---:|---:|---:|\n`;
md=md.replace('## 速度','保存済みロード設定で差がある項目: 物理マイクロバッチはGemma 12Bが1120、他モデルが512。ロード時CPUプールはGemmaが10、PLaMoが7。予測設定のCPUスレッド数は全条件7。これらの解決後設定は各`*-load.json`と`runs.jsonl`に記録した。\n\n## 速度');
md=md.replace('終了理由が正常でも意味の正しさは保証しない。','失敗したケースは停止までの時間を含み、翻訳完了時間ではない。正常終了回数と併せて読む。終了理由が正常でも意味の正しさは保証しない。');
md=md.replace('## 条件','## 観測された差\n\n- PLaMo 0.8Bが最速。ただし値下げ表現や試作品の採用に意味の変わる誤訳があった。\n- PLaMo 8Bは今回の原文では意味保持と完走が安定していた。返金条件の境界日を含める誤訳は残る。\n- Gemma E2Bは思考ありで採用／雇用の誤訳が改善した一方、長文の年齢条件・期限の誤りは残った。E4Bでは他部門を指す範囲限定の欠落が見られた。\n- Gemma 12Bの思考なしは長文を完走。思考ありは通常長文のEN-L1・JA-L2で思考中に出力上限へ到達し、最終訳が出なかった。\n- これらは自作原文と今回の設定で観察した差であり、モデル全般の絶対的な正確率や順位を表すものではない。\n\n## 条件');
for(const c of summary.conditions){const g=metric(c,'all','all');md+=`| ${labels[c]} | ${f(metric(c,'all','short')?.secondsMeanOfCaseMedians)} | ${f(metric(c,'all','medium')?.secondsMeanOfCaseMedians)} | ${f(metric(c,'all','long')?.secondsMeanOfCaseMedians)} | ${f(g.secondsSumOfCaseMedians)} | ${g.successful}/${g.n} |\n`;}
md+='\n## 長文の方向別結果\n\n| 条件 | 英→日・平均秒 | 日→英・平均秒 | 長文正常終了 |\n|---|---:|---:|---:|\n';
for(const c of summary.conditions){const g=metric(c,'all','long');md+=`| ${labels[c]} | ${f(metric(c,'en-ja','long')?.secondsMeanOfCaseMedians)} | ${f(metric(c,'ja-en','long')?.secondsMeanOfCaseMedians)} | ${g.successful}/${g.n} |\n`;}
let stressRows=[],stressDataset=[];
if(existsSync('results/stress/runs.jsonl')){
 stressRows=readFileSync('results/stress/runs.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 stressDataset=JSON.parse(readFileSync('results/stress/dataset.json'));
 md+='\n## 追加長文・容量試験\n\n通常の長文2本を連結した原文（英語約978語、日本語2426字＋区切り）を、同じ4096トークンで各条件1回。中央値による速度比較とは別の容量確認。終了理由と末尾到達を確認する。\n\n| 条件 | 英→日・秒 / 終了理由 | 日→英・秒 / 終了理由 |\n|---|---:|---:|\n';
 for(const c of summary.conditions){const rs=stressRows.filter(r=>r.condition===c);md+=`| ${labels[c]} | `+['en-ja','ja-en'].map(d=>{const r=rs.find(r=>r.direction===d);return r?`${f(r.seconds)} / ${r.stats?.stopReason??r.error}`:'未測定';}).join(' | ')+' |\n';}
 md+='\n追加試験の全文・設定・思考文は`../stress/runs.jsonl`、原文は`../stress/dataset.json`に保存。\n';
}
if(accuracy){md+='\n'+renderScoresMarkdown(accuracy);writeFileSync(`${dir}/accuracy-scores.md`,'# 翻訳正確性・各問採点表\n\n'+renderScoresMarkdown(accuracy,true));}
md+='\n## 正確性レビュー\n\n'+quality.method+'\n\n';
for(const c of summary.conditions){md+=`### ${labels[c]}\n\n`;const notes=quality.observations.filter(n=>n.condition===c);md+=notes.length?notes.map(n=>`- **${n.caseId} / ${n.severity}**: 原文「${n.source}」→訳「${n.output}」。${n.issue}`).join('\n')+'\n':'記録された具体的な誤りなし。無誤訳を保証するものではない。\n';}
md+='\n## MTP・コンテキスト・再現性\n\n| 条件 | ドラフト採用あり | 思考文あり | 最大使用トークン | 訳文が複数になった原文数 | 実測VRAM最大(MiB・端末全体) |\n|---|---:|---:|---:|---:|---:|\n';
for(const c of summary.conditions){const rs=runs.filter(r=>r.condition===c);const vram=rs.flatMap(r=>[r.gpuBefore,r.gpuAfter,...r.gpuSamples??[]]).filter(Boolean).map(s=>Number(s.split(',')[1].replace(/[^0-9.]/g,'')));const varies=metric(c,'all','all').caseMetrics.filter(x=>x.translationVariants>1).length;md+=`| ${labels[c]} | ${rs.filter(r=>r.stats?.acceptedDraftTokensCount>0).length}/${rs.length} | ${rs.filter(r=>r.reasoningCharacters>0).length}/${rs.length} | ${Math.max(...rs.map(r=>r.stats?.totalTokensCount??0))} | ${varies} | ${Math.max(...vram)} |\n`;}
md+='\nMTPは起動引数だけでなく、各生成の`acceptedDraftTokensCount`とランタイムログで確認。Gemmaの思考トークンは速度のtokens/sには含まれるため、思考ありのtokens/sが高くても訳が早く終わるとは限らない。モデル間のトークン分割も異なるため、判断の主指標は同じ原文の翻訳完了時間。\n\n## ファイル\n\n- `dataset.json`: 原文と確認項目\n- `runs.jsonl`: 全測定、思考文、設定、統計\n- `compact-runs.json`: 設定・思考本文を除いた測定結果\n- `runtime.jsonl`: MTP等の推論ログ\n- `summary.json`: 集計結果\n- `translations.md`: 初回の全訳文\n- `quality-review.json`: 照合した誤訳例\n- `report.html`: 原文・訳文を比較できるローカルレポート\n';
writeFileSync(`${dir}/report.md`,md);
const payload=JSON.stringify({summary,quality,accuracy,dataset:[...dataset,...stressDataset],runs:[...runs,...stressRows].map(({gpuSamples,loadConfig,predictionConfig,reasoning,...r})=>r),labels}).replace(/</g,'\\u003c');
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RTX 4070 翻訳比較</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#182430;font:15px/1.7 system-ui,sans-serif}main{max-width:1280px;margin:auto;padding:32px 24px}h1{font-size:30px;margin:0 0 8px}h2{font-size:22px;margin:32px 0 12px}.sub{color:#566574}section,.card{background:white;border:1px solid #dce2e8;border-radius:12px;padding:22px;margin:16px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:right;padding:11px 12px;border-bottom:1px solid #e6ebef}th:first-child,td:first-child{text-align:left}th{background:#eef3f7;color:#405363}select{max-width:100%;padding:9px;border:1px solid #acbac6;border-radius:6px;background:white;color:#182430;font:inherit}label{display:block;font-weight:600;margin:8px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}.text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.9}.bad{color:#a32424}.note{font-size:13px;color:#5a6976}details{margin-top:12px}summary{cursor:pointer}#source{max-height:420px;overflow:auto}.table-wrap{overflow-x:auto}@media(max-width:760px){.pair{grid-template-columns:1fr}main{padding:20px 12px}h1{font-size:24px}}
</style><main><h1>RTX 4070 12GB · 翻訳比較</h1><div class="sub">PLaMo 3 Translate × Gemma 4 QAT + MTP · 4096 tokens · 英日 / 日英 · 2026-11-05</div><section><strong id="count"></strong><p class="note">自作原文12本を各3回。各原文の中央値を長さ別に平均。思考ありは思考時間を含みます。ロード・ウォームアップは除外。品質の注記はCodexによる原文照合で、人間独立採点ではありません。</p><div class="table-wrap"><table id="speed"></table></div></section><h2>原文と訳文を比較</h2><label for="sample">原文</label><select id="sample"></select><section><div id="checks" class="note"></div><details open><summary>原文を表示</summary><div id="source" class="text"></div></details></section><div class="pair"><div class="card"><label for="modelA">条件 A</label><select id="modelA"></select><p id="metaA" class="note"></p><div id="outA" class="text"></div><div id="notesA" class="bad"></div></div><div class="card"><label for="modelB">条件 B</label><select id="modelB"></select><p id="metaB" class="note"></p><div id="outB" class="text"></div><div id="notesB" class="bad"></div></div></div><p class="note">訳文は初回測定。各回の時間はrawデータに保存しています。英語長文486/491語、日本語長文1250/1176字。この長さを超える文書への一般化には追加測定が必要です。</p></main><script type="application/json" id="data">${payload}</script><script>
const D=JSON.parse(document.getElementById('data').textContent),$=id=>document.getElementById(id),fmt=n=>Number(n).toFixed(2),metric=(c,l)=>D.summary.groups.find(g=>g.condition===c&&g.direction==='all'&&g.length===l);
$('count').textContent=D.summary.runs+' / 324 回測定';
$('speed').innerHTML='<thead><tr><th>条件</th><th>短文 / 秒</th><th>中程度 / 秒</th><th>長文 / 秒</th><th>12本合計 / 秒</th><th>正常終了</th></tr></thead><tbody>'+D.summary.conditions.map(c=>{const g=metric(c,'all');return '<tr><td>'+D.labels[c]+'</td>'+['short','medium','long'].map(l=>'<td>'+fmt(metric(c,l).secondsMeanOfCaseMedians)+'</td>').join('')+'<td>'+fmt(g.secondsSumOfCaseMedians)+'</td><td>'+g.successful+'/'+g.n+'</td></tr>'}).join('')+'</tbody>';
for(const item of D.dataset){const option=new Option(item.id+' · '+item.direction+' · '+item.length,item.id);$('sample').add(option)}
for(const c of D.summary.conditions){$('modelA').add(new Option(D.labels[c],c));$('modelB').add(new Option(D.labels[c],c))}$('modelB').value=D.summary.conditions.find(c=>c==='gemma-12b-think-off')||D.summary.conditions.at(-1);
function update(){const item=D.dataset.find(d=>d.id===$('sample').value);$('source').textContent=item.text;$('checks').textContent='確認項目: '+item.checks.join(' / ');for(const side of ['A','B']){const c=$('model'+side).value,r=D.runs.find(r=>r.condition===c&&r.caseId===item.id&&r.rep===1);$('out'+side).textContent=r?.translation||'訳文なし';$('meta'+side).textContent=r?fmt(r.seconds)+'秒 / '+r.stats?.stopReason+' / '+r.stats?.predictedTokensCount+'生成トークン / MTP採用 '+(r.stats?.acceptedDraftTokensCount??0):'未測定';$('notes'+side).textContent=D.quality.observations.filter(n=>n.condition===c&&n.caseId===item.id).map(n=>'⚑ '+n.issue).join(' ');}}
for(const id of ['sample','modelA','modelB'])$(id).addEventListener('change',update);update();
</script></html>`;
let rendered=html;
if(accuracy){
 rendered=rendered.replace('<section><strong id="count">',renderScoresHTML(accuracy)+'<section><strong id="count">');
 const extras=`
function updateGradeDetails(){if(!D.accuracy)return;for(const side of ['A','B']){const s=D.accuracy.scores.find(s=>s.condition===$('model'+side).value&&s.caseId===$('sample').value);if(!s)continue;$('meta'+side).textContent+=' / 正確性 '+s.score.toFixed(1)+'/10';$('notes'+side).textContent='採点: '+s.reason+(s.coverageFraction>0&&s.coverageFraction<1?' '+s.coverageNote:'');}}
for(const id of ['sample','modelA','modelB'])$(id).addEventListener('change',updateGradeDetails);
for(const button of document.querySelectorAll('[data-score-case]'))button.addEventListener('click',()=>{$('sample').value=button.dataset.scoreCase;$('modelA').value=button.dataset.scoreCondition;update();updateGradeDetails();$('sample').scrollIntoView({behavior:'smooth',block:'start'});});
updateGradeDetails();
`;
 rendered=rendered.replace('</script></html>',extras+'</script></html>');
}
if(stressRows.length){
 const status=r=>!r?'未測定':['eosFound','stopStringFound'].includes(r.stats?.stopReason)?'完走':r.translation?.trim()?'途中で上限':'訳なし・上限';
 const extra='<h2>追加長文・容量試験</h2><section><p class="note">英語約978語／日本語約2400字。4096トークン、各1回。失敗の秒数は停止までの時間です。</p><div class="table-wrap"><table><thead><tr><th>条件</th><th>英→日 / 秒・状態</th><th>日→英 / 秒・状態</th></tr></thead><tbody>'+summary.conditions.map(c=>'<tr><td>'+labels[c]+'</td>'+['en-ja','ja-en'].map(d=>{const r=stressRows.find(r=>r.condition===c&&r.direction===d);return '<td>'+(r?f(r.seconds):'—')+' / '+status(r)+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div></section>';
 rendered=rendered.replace('<h2>原文と訳文を比較</h2>',extra+'<h2>原文と訳文を比較</h2>');
}
writeFileSync(`${dir}/report.html`,rendered);
console.log('Wrote report.md and report.html');
