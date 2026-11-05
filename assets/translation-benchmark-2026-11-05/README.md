# 翻訳LLM比較・公開データ（2026-11-05）

検証記事: https://g0083.github.io/posts/lmstudio-plamo3-gemma4-translation-benchmark.html

- viewer.html: 原文、全モデルの最終訳、各問の点数と減点理由を比較。
- dataset.json: 自作の通常12問と追加長文2問。
- runs-summary.json: 全342回の時間、最終訳、トークン数、停止理由、MTP採用統計。
- runs.jsonl: 上記に加え、各ローカルモデルが出力した思考文と主要設定。1行1測定。
- accuracy-scores.json / .md: 126件のAI参考採点、採点規則、区分別点数、減点理由、照合ハッシュ。
- timing-summary.json: 各原文3回中央値から集計した通常比較。
- metadata.json: ハードウェア、モデル識別子、量子化、推論条件、設定差。
- validation.json: 件数・設定・MTP動作・採点算術の検証結果と末尾照合。
- checksums.sha256: 公開ファイルのSHA-256（このファイルとZIP自身を除く）。
- reproduce/: 測定スクリプトと、今回の訳文に対するレビュー判断を記録した採点スクリプト。

342回は速度計測の繰り返しを含む。品質は同一訳を3問に数えず14問×9条件=126件。
通常比較の全最終訳は同条件内3回で一致。追加長文は各1回で、通常比較と別集計。
思考文は最終訳と区別し、最終訳なしは0点。途中訳には訳出範囲比を反映。
得点はCodexによる単独AI参考採点。人間の独立採点、COMET、正答率ではない。
入力に対して普遍的なモデルランキングを示すものではない。

## 再実行の注意

reproduceフォルダには、主要設定へ整理した公開キャプチャを元コードの形式へ配置したresultsも含む。
集計・採点の再計算はnode summarize.mjs、node grade.mjs、node report.mjs、
node validate.mjs、node validate-grades.mjsの順に実行できる（これらはNode標準機能のみ）。
新規実測は空の作業フォルダにreproduce直下のスクリプトとpackage.jsonをコピーしてから、
npm installを実行し、LM Studioのローカルサーバーと対象モデルを用意する。
LM_MODELS_DIRをモデル保存先に設定し、必要に応じてLMS_EXEをlms実行ファイルへ設定する。
モデルキーやドラフターの相対パスはbenchmark.mjsのmodels配列で手元の配布物に合わせる。
node benchmark.mjsで通常比較、LLM_BENCH_STRESS=1を設定して実行すると追加試験になる。
既存のresultsがある場合は未測定の組み合わせだけ再開する。
公開用の主要設定JSONLを元形式へ配置したものがreproduce/results。内部プロンプトテンプレート等は
省略し、runtime.jsonlもMTP採用行の抜粋であるため、完全な診断キャプチャの代替ではない。
新規実測のresultsには元の内部設定が記録される。測定時と同じロード条件にするには、後述の
保存済み設定の差も手元のLM Studio側で合わせる必要がある。
grade.mjsは今回の訳に対して判断済みの減点を計算する。新しい訳を自動評価する採点モデルではない。

測定当時、物理マイクロバッチは12Bが1120、他が512。ロード時CPUプールはGemma10、PLaMo7、
予測時CPUスレッドは全て7。保存済みロード設定の影響を含む。厳密な追試はこれらも設定する。
モデルファイルのハッシュは採取していないため、同名の後日更新を完全には識別できない。
