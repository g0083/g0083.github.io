const short=['P0.8','P2','P8','E2無','E2有','E4無','E4有','12無','12有'];
const n=v=>Number(v).toFixed(1);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function renderScoresMarkdown(a,details=false){
 let md='## 各問の正確性採点\n\n各問10点（意味保持6、情報の完全性3、数値・固有表現・指定言語1）。文体の好みは減点しない。最終訳なしは0点、部分訳は訳出範囲比を反映。**Codexの単独AI参考採点**であり、100点換算は得点の換算値。\n\n';
 md+='P=PLaMo、E2/E4/12=Gemma QAT、無=思考なし、有=思考あり。Gemmaは全条件MTP有効。\n\n';
 for(const suite of ['standard','stress']){
  md+=`### ${suite==='standard'?'通常12問':'追加長文2問'}\n\n| 問題 | ${short.join(' | ')} |\n|---|${short.map(()=>'---:').join('|')}|\n`;
  for(const q of a.questions.filter(q=>suite==='stress'?q.id.endsWith('XL'):!q.id.endsWith('XL'))){md+=`| ${q.id} | `+a.conditions.map(c=>n(a.scores.find(s=>s.condition===c&&s.caseId===q.id).score)).join(' | ')+' |\n';}
  md+=`| 合計（${suite==='standard'?120:20}点） | `+a.summary.map(s=>n(s[suite].points)).join(' | ')+' |\n\n';
 }
 md+='### 集計\n\n| 条件 | 通常 /120 | 通常100点換算 | 英→日 /60 | 日→英 /60 | 通常長文 /40 | 追加長文 /20 | 全14問100点換算 | 訳出ありのみ100点換算 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
 for(const s of [...a.summary].sort((x,y)=>y.standard.points-x.standard.points))md+=`| ${s.label} | ${n(s.standard.points)} | ${n(s.standard.scaled100)} | ${n(s.byDirection['en-ja'].points)} | ${n(s.byDirection['ja-en'].points)} | ${n(s.byLength.long.points)} | ${n(s.stress.points)} | ${n(s.all.scaled100)} | ${n(s.answeredOnly.scaled100)} (${s.answeredOnly.n}問) |\n`;
 md+='\n「訳出ありのみ」は通常12問から最終訳なしを除いた参考値であり、完走性能を含める全問点と併せて読む。小さな点差は採点者・基準により逆転し得る。\n\n';
 if(!details)return md+'各問の区分別得点、減点理由、原文と訳文の照合情報は`accuracy-scores.md` / `accuracy-scores.json`に記録。\n\n';
 md+='## 採点基準\n\n'+a.rubric.assessor+'\n\n';
 for(const [key,d]of Object.entries(a.rubric.dimensions))md+=`- ${key}（${d.max}点）: ${d.description}\n`;
 md+='\n'+a.rubric.rules.map(r=>'- '+r).join('\n')+'\n';
 md+='\n## 各問の減点理由\n\n各問の得点は同じ最終訳1件に対して付けた。通常比較は3回の最終訳一致を確認済み。原文と訳文は比較レポートの問題選択から表示できる。\n';
 for(const q of a.questions){
  md+=`\n### ${q.id} — ${q.direction} / ${q.length}\n\n確認項目: ${q.checks.join(' / ')}\n\n| 条件 | 意味 /6 | 完全性 /3 | 固有情報 /1 | 合計 /10 | 理由 |\n|---|---:|---:|---:|---:|---|\n`;
  for(const condition of a.conditions){const s=a.scores.find(s=>s.condition===condition&&s.caseId===q.id);const component=k=>Number.isInteger(s.components[k]*10)?n(s.components[k]):s.components[k].toFixed(3);md+=`| ${a.labels[condition]} | ${component('meaning')} | ${component('completeness')} | ${component('entities')} | **${n(s.score)}** | ${s.reason.replaceAll('|','／')}${s.coverageFraction>0&&s.coverageFraction<1?' '+s.coverageNote+` 範囲比${s.coverageFraction}。`:''} |\n`;}
 }
 return md+'\n部分訳の区分得点は範囲比を乗じた値のため、表示桁によって合計に丸め差が生じる。合計はJSONの元値から小数1桁へ丸めている。\n';
}
export function renderScoresHTML(a){
 let h='<style>.gradecell{border:0;background:none;font:inherit;text-decoration:underline;cursor:pointer;padding:4px 8px;border-radius:5px}.gradecell:focus-visible{outline:2px solid #075985}.scorehi{color:#116149}.scoremid{color:#935c09}.scorelow{color:#ad3030}.scorematrix th:first-child,.scorematrix td:first-child{position:sticky;left:0;background:#f5f8fa}.scorematrix th,.scorematrix td{white-space:nowrap}.scoreintro{max-width:1000px}</style><h2>各問の正確性スコア</h2><section class="scoreintro"><p>各問10点：意味6・情報の完全性3・固有表現等1。最終訳なしは0点。CodexによるAI参考採点で、文体だけでは減点しません。<strong>数字を押すと、その問とモデルの訳文を表示します。</strong></p><p class="note">P=PLaMo、E2/E4/12=Gemma QAT。無=思考なし、有=思考あり。部分訳は訳出範囲を反映。小差は採点者や基準で逆転し得ます。</p>';
 for(const suite of ['standard','stress']){
  h+='<h3>'+ (suite==='standard'?'通常12問':'追加長文2問')+'</h3><div class="table-wrap"><table class="scorematrix"><thead><tr><th>問題</th>'+short.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>';
  for(const q of a.questions.filter(q=>suite==='stress'?q.id.endsWith('XL'):!q.id.endsWith('XL'))){h+='<tr><td>'+q.id+'</td>'+a.conditions.map(c=>{const s=a.scores.find(s=>s.condition===c&&s.caseId===q.id);const cls=s.score>=9?'scorehi':s.score>=7?'scoremid':'scorelow';return `<td><button class="gradecell ${cls}" data-score-case="${q.id}" data-score-condition="${c}" title="${esc(s.reason)}">${n(s.score)}</button></td>`;}).join('')+'</tr>';}
  h+='<tr><th>合計 /'+(suite==='standard'?120:20)+'</th>'+a.summary.map(s=>'<th>'+n(s[suite].points)+'</th>').join('')+'</tr></tbody></table></div>';
 }
 h+='<h3>100点換算（通常12問）</h3><div class="table-wrap"><table><thead><tr><th>条件</th><th>全問</th><th>訳出ありのみ</th><th>全14問・参考</th></tr></thead><tbody>';
 for(const s of [...a.summary].sort((x,y)=>y.standard.points-x.standard.points))h+=`<tr><td>${s.label}</td><td>${n(s.standard.scaled100)}</td><td>${n(s.answeredOnly.scaled100)} (${s.answeredOnly.n}問)</td><td>${n(s.all.scaled100)}</td></tr>`;
 return h+'</tbody></table></div><p class="note">100点換算は得点の換算値です。訳出ありのみの列は最終訳がなかった問題を除いています。詳細な採点基準・減点理由はaccuracy-scores.mdとJSONに保存。</p></section>';
}
