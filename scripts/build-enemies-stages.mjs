// 敵データ + ステージ出現敵/倍率を public/data/{enemies,stages}.json に変換する。
// 出典:
//   敵ステータス/名前 … battlecatsinfo enemy.json(HPはBCData t_unit.csv と一致を検証=正本相当)
//   ステージ構成・倍率・日本語名 … battlecatsinfo stage.json / map.json
// 実HP = round(敵の基礎HP × HP倍率/100) × ステージ倍率/100  (ステージ倍率は★無し=100%基準)
// ソースは raw_data/stages/ に同梱(再取得不要)。 使い方: node scripts/build-enemies-stages.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "raw_data/stages");
const OUT = path.join(ROOT, "public/data");
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");

// ── 1) 敵データ ───────────────────────────────────────────────
const enemyRaw = JSON.parse(read("enemy.json"));
// BCData t_unit.csv で HP を検証(敵id i → row i+2, col0=HP)
const tunit = read("t_unit.csv")
  .trim()
  .split(/\r?\n/)
  .map((l) => l.split(","));
let hpMismatch = 0;
for (const e of enemyRaw) {
  const row = tunit[e.i + 2];
  if (row && Number(row[0]) !== e.hp) hpMismatch++;
}

// trait ビットマスク(units_scheme と同順)
const TRAIT_BITS = [
  "赤", "浮", "黒", "メタル", "天使", "エイリアン", "ゾンビ", "古代種",
  "無", "使徒", "魔女", "悪魔", "道場", "超獣", "超生命体", "超賢者", "怪",
];
const traitsOf = (mask) =>
  TRAIT_BITS.filter((_, b) => mask & (1 << b));

const enemies = enemyRaw.map((e) => ({
  id: e.i,
  name: e.jp_name || e.name,
  hp: e.hp,
  atk: e.atk,
  range: e.range,
  traits: traitsOf(e.trait || 0),
}));

// ── 2) ステージ + マップ ───────────────────────────────────────
const stageData = JSON.parse(read("stage.json"));
const mapData = JSON.parse(read("map.json"));
const d36 = (s) => parseInt(s, 36);
// 倍率トークン "hp+atk"(36進, 既定 "2s"=100) → [hpMag, atkMag]
function decodeMag(tok) {
  tok = tok || "2s";
  let d, r;
  if (tok.includes("+")) [d, r] = tok.split("+");
  else d = r = tok;
  return [d36(d || "2s"), d36(r || "2s")];
}

// stageId = mapId*1000 + stageIndex、 mapId = grp*1000 + mapIndex
const maps = new Map();
for (const key in stageData) {
  const st = stageData[key];
  if (!st.enemyLines) continue;
  const sid = Number(key);
  const mapId = Math.floor(sid / 1000);
  const stageIdx = sid % 1000;

  const enemyList = [];
  for (const line of st.enemyLines.split("|")) {
    const A = line.split(",");
    const eid = parseInt(A[0], 36);
    if (Number.isNaN(eid)) continue; // "l"等の特殊行を除外
    const [hpMag] = decodeMag(A[7]);
    enemyList.push([eid, hpMag]);
  }
  if (enemyList.length === 0) continue;

  if (!maps.has(mapId)) {
    const m = mapData[mapId];
    maps.set(mapId, {
      id: mapId,
      grp: Math.floor(mapId / 1000),
      name: m?.nameJp || m?.name || `マップ${mapId}`,
      stages: [],
    });
  }
  maps.get(mapId).stages.push({
    idx: stageIdx,
    name: st.nameJp || st.name || `ステージ${stageIdx}`,
    hp: st.hp, // 拠点(城)HP
    enemies: enemyList,
  });
}
const mapsOut = [...maps.values()].sort((a, b) => a.id - b.id);
for (const m of mapsOut) m.stages.sort((a, b) => a.idx - b.idx);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "enemies.json"), JSON.stringify(enemies));
fs.writeFileSync(path.join(OUT, "stages.json"), JSON.stringify(mapsOut));

const enemyLineCount = mapsOut.reduce(
  (n, m) => n + m.stages.reduce((s, st) => s + st.enemies.length, 0),
  0
);
console.log(`敵: ${enemies.length}体 (HP不一致 ${hpMismatch}体)`);
console.log(`マップ: ${mapsOut.length} / ステージ: ${mapsOut.reduce((n, m) => n + m.stages.length, 0)} / 敵ライン: ${enemyLineCount}`);
console.log(
  `出力: enemies.json ${(fs.statSync(path.join(OUT, "enemies.json")).size / 1024).toFixed(0)}KB, ` +
    `stages.json ${(fs.statSync(path.join(OUT, "stages.json")).size / 1024).toFixed(0)}KB`
);
