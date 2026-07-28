# にゃんこステータス計算機

にゃんこ大戦争のキャラステータス計算ツール。キャラ名で検索して、レベル・本能・にゃんコンボを選ぶと体力・攻撃力・DPSなどを自動計算します。

## 機能

- キャラ名のインクリメンタル検索(ひらがな/カタカナどちらでも可)
- 形態切替(第1〜第4形態)
- レベル+値、日本編お宝(×2.5)の反映
- 本能のレベル別効果(体力/攻撃力/速度/コスト/生産スピード/攻撃間隔 + 能力解放系)
- にゃんコンボ(攻撃力/体力/移動速度アップ系を数値反映、構成キャラ表示つき)
- battlecats-db と同じ基準の表示(コストは第2章基準、再生産は研究力MAX込み)

## データソース

正本は BCData。そこに無い情報だけ battlecatsinfo から補完する方針(BCData以外は補助扱い)。

- ステータス・本能・コンボ(正本): [fieryhenry/BCData](https://github.com/fieryhenry/BCData) の日本版 15.0.0jp
- 攻撃頻度・後隙: [battlecatsinfo](https://github.com/battlecatsinfo/battlecatsinfo.github.io) の catstat.tsv
- **補完**(`raw_data/bci/`): BCDataに無い新規ユニット(ルーノス等)と、BCDataで欠けている本能(セイバー等)のみ battlecatsinfo の catstat.tsv / cat.tsv / units_scheme.json から取得。既存ユニットのステータスは上書きしない
- 列定義の参考: [fieryhenry/tbcml](https://github.com/fieryhenry/tbcml)

補完の仕組み: build-data.mjs 末尾で、BCDataに無いidのユニットを battlecatsinfo から丸ごと追加(ability文字列・trait/immunityビットマスク・成長カーブをデコード)し、本能が欠けている既存ユニットには cat.tsv の talents 列(SkillAcquisitionと同形式)を補完する。

### アプデ時の更新手順

battlecatsinfo の最新データを取り直して再生成する:

```bash
cd raw_data/stages && for f in enemy.json stage.json map.json rewards.json; do curl -sO "https://battlecatsinfo.github.io/$f"; done
cd ../bci && for f in cat.json units_scheme.json; do curl -sO "https://battlecatsinfo.github.io/$f"; done
cd ../.. && node scripts/build-data.mjs && node scripts/build-enemies-stages.mjs
node scripts/fetch-icons.mjs && node scripts/fetch-enemy-icons.mjs   # 新規分のアイコン(冪等)
```

新規ユニットは `raw_data/bci/cat.json` から自動で追加される(BCDataに無いidのみ。
既存ユニットのステータスは上書きしない)。フィールド対応は build-data.mjs の
「(3) cat.json からの追加」を参照。敵のJP名は `jpName`(旧 `jp_name`)。

## 開発

```bash
npm install
npm run dev
```

## 計算式メモ

- レベル倍率は整数%で累積(`unitlevel.csv` の10レベル毎成長率)。浮動小数だと公表値と1ズレる
- 表示ステータス = floor(floor(基礎値 × 倍率%/100) × お宝倍率) → 本能% → コンボ%
- 検証済み: 覚醒のネコムート Lv30/Lv50、ゼロカムイ Lv50 が battlecats-db の公表値と一致
