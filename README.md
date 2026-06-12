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

- ステータス・本能・コンボ: [fieryhenry/BCData](https://github.com/fieryhenry/BCData) の日本版 15.0.0jp
- 攻撃頻度・後隙: [battlecatsinfo](https://github.com/battlecatsinfo/battlecatsinfo.github.io) の catstat.tsv
- 列定義の参考: [fieryhenry/tbcml](https://github.com/fieryhenry/tbcml)

`raw_data/` に元CSVを同梱。データ更新時は新しいバージョンのCSVに差し替えて:

```bash
node scripts/build-data.mjs   # public/data/*.json を再生成
```

## 開発

```bash
npm install
npm run dev
```

## 計算式メモ

- レベル倍率は整数%で累積(`unitlevel.csv` の10レベル毎成長率)。浮動小数だと公表値と1ズレる
- 表示ステータス = floor(floor(基礎値 × 倍率%/100) × お宝倍率) → 本能% → コンボ%
- 検証済み: 覚醒のネコムート Lv30/Lv50、ゼロカムイ Lv50 が battlecats-db の公表値と一致
