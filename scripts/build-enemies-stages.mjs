// 敵データ + ステージ出現敵/倍率を public/data/{enemies,stages}.json に変換する。
// 出典:
//   敵ステータス/名前 … battlecatsinfo enemy.json(HPはBCData t_unit.csv と一致を検証=正本相当)
//   ステージ構成・倍率・日本語名 … battlecatsinfo stage.json / map.json
//   クリア報酬(ユニット) … battlecatsinfo rewards.json(報酬id→アイコン)でcatId解決→cats.jsonでJP名
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

// 能力ID(battlecatsinfo unit.mjs の AB_* 準拠) → 日本語名。enemy.json の e.ab を解析。
const AB_NAME = {
  1: "強化", 2: "生き残る", 4: "クリティカル", 7: "バリア割り", 8: "シールド貫通",
  9: "渾身の一撃", 10: "お金アップ", 11: "メタル", 12: "小波動", 13: "波動",
  14: "小烈波", 15: "烈波", 16: "波動ストッパー", 21: "攻撃力ダウン", 22: "動きを止める",
  23: "動きを遅くする", 30: "ふっとばす", 31: "ワープ", 33: "呪い", 34: "もぐる",
  35: "復活", 36: "毒撃", 37: "自爆", 38: "バリア", 39: "悪魔シールド", 40: "反撃",
  41: "死後烈波", 43: "取り巻き", 45: "爆波", 47: "ドレイン",
};
// 無効(imu)ビット順(units_scheme immunes と同順)
const IMU_NAME = [
  "波動", "停止", "遅化", "ふっとばし", "烈波", "攻撃力ダウン",
  "ワープ", "古代の呪い", "毒撃", "魔王震波", "爆波",
];
function abilitiesOf(e) {
  const out = [];
  const ab = e.ab || {};
  for (const k in ab) {
    const id = +k;
    const name = AB_NAME[id];
    if (!name) continue;
    const p = ab[k];
    let label = name;
    if (Array.isArray(p) && p.length) {
      if (id === 13 || id === 12) label = `${name} Lv${p[1] ?? ""} ${p[0]}%`.trim();
      else if (id === 15 || id === 14) label = `${name} Lv${p[3] ?? p[p.length - 1]} ${p[0]}%`.trim();
      else if (id === 38) label = `${name} ${p[0]}`; // バリアHP
      else if (typeof p[0] === "number") label = `${name} ${p[0]}%`;
    }
    out.push(label);
  }
  const imuList = IMU_NAME.filter((_, b) => (e.imu || 0) & (1 << b));
  if (imuList.length) out.push(`無効: ${imuList.join("・")}`);
  return out;
}
// atkType ビット: 単体1 / 範囲2 / 遠方4 / 全方位8
const rangeTypeOf = (t) =>
  t & 8 ? "全方位" : t & 4 ? "遠方" : t & 2 ? "範囲" : "単体";

const enemies = enemyRaw.map((e) => ({
  id: e.i,
  name: e.jp_name || e.name,
  hp: e.hp,
  atk: (e.atk || 0) + (e.atk1 || 0) + (e.atk2 || 0), // 多段は合計
  range: e.range,
  speed: e.speed,
  kb: e.kb,
  money: e.earn,
  rangeType: rangeTypeOf(e.atkType || 0),
  traits: traitsOf(e.trait || 0),
  abilities: abilitiesOf(e),
}));

// ── 2) ステージ + マップ ───────────────────────────────────────
const stageData = JSON.parse(read("stage.json"));
const mapData = JSON.parse(read("map.json"));

// ユニット報酬名の解決用。drop=[確率%,報酬id,個数]の報酬idは rewards.json
// (battlecatsinfo)で名前/アイコンに対応する。報酬id→catId は非線形(id-1000では不可)
// なので、アイコンパス "/img/u/{catId}/..." からcatIdを取り、cats.json(BCData正本)の
// JP名+レアリティを引く。アイコンが "/img/r/..."(アイテム)は名前がTW中国語で精度が
// 出ないため表示対象外(空白)。これでレジェンド報酬等のJP名を正確に解決できる。
const catsPath = path.join(OUT, "cats.json");
const cats = fs.existsSync(catsPath) ? JSON.parse(fs.readFileSync(catsPath, "utf8")) : [];
const catById = new Map(cats.map((c) => [c.id, c]));
const rewardRaw = JSON.parse(read("rewards.json"));
// 報酬id → catId (ユニット報酬のみ)。/img/u/{catId}/ のみ採用。
const rewardToCat = new Map();
for (const r of rewardRaw) {
  const m = /\/img\/u\/(\d+)\//.exec(r.icon || "");
  if (m) rewardToCat.set(r.id, Number(m[1]));
}
// 1ステージのdropからユニット報酬だけ抽出 → [{name, rarity, prob}]
function unitRewards(drop) {
  if (!Array.isArray(drop)) return [];
  const out = [];
  for (const d of drop) {
    const cid = rewardToCat.get(d[1]);
    if (cid == null) continue; // ユニット報酬でない(アイテム等)
    const c = catById.get(cid);
    if (!c || !c.forms || !c.forms[0]) continue;
    out.push({ name: c.forms[0].name, rarity: c.rarity, prob: d[0] });
  }
  return out;
}
const d36 = (s) => parseInt(s, 36);
// 倍率トークン "hp+atk"(36進, 既定 "2s"=100) → [hpMag, atkMag]
function decodeMag(tok) {
  tok = tok || "2s";
  let d, r;
  if (tok.includes("+")) [d, r] = tok.split("+");
  else d = r = tok;
  return [d36(d || "2s"), d36(r || "2s")];
}

// 敵id→属性。超生命体強襲の判定に使う。
const traitsById = new Map(enemies.map((e) => [e.id, e.traits]));
const hasColossus = (eid) => (traitsById.get(eid) || []).includes("超生命体");
const LEGEND_GRPS = [0, 9, 16]; // 旧/真/ゼロ レジェンド

// stageId = mapId*1000 + stageIndex、 mapId = grp*1000 + mapIndex
const maps = new Map();
for (const key in stageData) {
  const st = stageData[key];
  if (!st.enemyLines) continue;
  const sid = Number(key);
  const mapId = Math.floor(sid / 1000);
  const stageIdx = sid % 1000;

  const enemyList = [];
  let colossus = false;
  for (const line of st.enemyLines.split("|")) {
    const A = line.split(",");
    const eid = parseInt(A[0], 36);
    if (Number.isNaN(eid)) continue; // "l"等の特殊行を除外
    const [hpMag, atkMag] = decodeMag(A[7]);
    enemyList.push([eid, hpMag, atkMag]);
    if (hasColossus(eid)) colossus = true;
  }
  if (enemyList.length === 0) continue;
  // クリア特典(レジェンドにゃんこ等のユニット報酬)の有無。報酬id→catId解決で判定。
  const reward = unitRewards(st.drop);
  const hasUnitReward = reward.length > 0;

  if (!maps.has(mapId)) {
    const m = mapData[mapId];
    maps.set(mapId, {
      id: mapId,
      grp: Math.floor(mapId / 1000),
      name: m?.nameJp || m?.name || `マップ${mapId}`,
      // 冠(★)別倍率 [冠1,冠2,…]。冠1=100%基準、冠2以降がマップ毎に変化。
      // 0個=冠なし(1難易度)。レジェンドの実HP/ATKはこの倍率も掛かる。
      stars: Array.isArray(m?.stars) ? m.stars : [],
      stages: [],
      colossus: false, // 超生命体の敵が出る(超生命体強襲の判定)
      reward: false, // クリア特典(レジェンドにゃんこ入手)のある章
    });
  }
  const mp = maps.get(mapId);
  if (colossus) mp.colossus = true;
  if (hasUnitReward && LEGEND_GRPS.includes(mp.grp)) mp.reward = true;
  mp.stages.push({
    idx: stageIdx,
    name: st.nameJp || st.name || `ステージ${stageIdx}`,
    hp: st.hp, // 拠点(城)HP
    enemies: enemyList,
    ...(reward.length ? { reward } : {}), // ユニットクリア報酬(無ければ省略)
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
