// raw_data/ のゲームCSV(BCData 15.0.0jp + battlecatsinfo catstat.tsv)を
// アプリで使う JSON (src/data/*.json) に変換する。
// 実行: node scripts/build-data.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(root, "raw_data");
const OUT = join(root, "public", "data");
mkdirSync(OUT, { recursive: true });

const readCsv = (p) =>
  readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(",").map((c) => c.trim()));

const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

// ---- battlecatsinfo cat.tsv: 実装済み形態数(未実装の第3/第4形態を除外) ----
const formCount = []; // catId -> 実装形態数
{
  const lines = readFileSync(join(RAW, "bci_cat.tsv"), "utf8").split(/\r?\n/).slice(1);
  lines.forEach((line, id) => {
    if (!line.trim()) return;
    formCount[id] = num(line.split("\t")[1]) || 0;
  });
}

// ---- battlecatsinfo catstat.tsv: backswing と攻撃頻度(アニメ込み)を補完 ----
const bci = new Map(); // id -> [form rows]
{
  const lines = readFileSync(join(RAW, "bci_catstat.tsv"), "utf8").split(/\r?\n/);
  const header = lines[0].split("\t");
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split("\t");
    const id = num(c[col.id]);
    if (!bci.has(id)) bci.set(id, []);
    bci.get(id).push({
      backswing: num(c[col.backswing]),
      freq: num(c[col.attack_frequency]),
    });
  }
}

// ---- unitbuy.csv: レアリティ・レベル上限 ----
const unitbuy = readCsv(join(RAW, "jp/DataLocal/unitbuy.csv"));
// ---- unitlevel.csv: 10レベル毎の成長率(%) 20ブロック ----
const unitlevel = readCsv(join(RAW, "jp/DataLocal/unitlevel.csv"));

// ---- SkillAcquisition.csv: 本能 ----
const skillDesc = new Map();
for (const r of readCsv(join(RAW, "jp/resLocal/SkillDescriptions.csv"))) {
  if (/^\d+$/.test(r[0])) skillDesc.set(num(r[0]), r.slice(1).join(","));
}
const talentsByCat = new Map();
{
  const rows = readCsv(join(RAW, "jp/DataLocal/SkillAcquisition.csv"));
  for (const row of rows.slice(1)) {
    if (!/^\d+$/.test(row[0])) continue;
    const catId = num(row[0]);
    const list = [];
    for (let off = 2; off + 13 < row.length; off += 14) {
      const abilityId = num(row[off]);
      if (abilityId === 0) continue;
      list.push({
        abilityId,
        maxLv: Math.max(1, num(row[off + 1])),
        min: [num(row[off + 2]), num(row[off + 4]), num(row[off + 6]), num(row[off + 8])],
        max: [num(row[off + 3]), num(row[off + 5]), num(row[off + 7]), num(row[off + 9])],
        textId: num(row[off + 10]),
        ultra: num(row[off + 13]) === 1, // 超本能
      });
    }
    if (list.length) talentsByCat.set(catId, list);
  }
}

// ---- ユニット本体 ----
const pad = (n) => String(n).padStart(3, "0");
const cats = [];
for (let id = 0; ; id++) {
  const statPath = join(RAW, `jp/DataLocal/unit${pad(id + 1)}.csv`);
  const namePath = join(RAW, `jp/resLocal/Unit_Explanation${id + 1}_ja.csv`);
  if (!existsSync(statPath) || !existsSync(namePath)) break;
  const statRows = readCsv(statPath);
  // 名前CSVは説明文中にカンマが無い前提でなく、先頭列のみ名前として使う
  const nameRows = readFileSync(namePath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(","));
  const buy = unitbuy[id] ?? [];
  const growth = (unitlevel[id] ?? []).map(num);
  // 実装済み形態数で制限(未実装の第3/第4形態はデータに存在するが除外)
  const realForms = formCount[id] || statRows.length;
  const nForms = Math.min(statRows.length, nameRows.length, realForms);
  const forms = [];
  for (let f = 0; f < nForms; f++) {
    const c = statRows[f].map(num);
    if (c.length < 10) continue;
    const name = nameRows[f][0]?.trim();
    if (!name || name === "　") continue;
    const bciForm = bci.get(id)?.[f];
    forms.push({
      name,
      desc: nameRows[f].slice(1).join(" ").replace(/　/g, " ").trim(),
      hp: c[0],
      kb: c[1],
      speed: c[2],
      atk: [c[3], c[59] ?? 0, c[60] ?? 0],
      fore: [c[13], c[61] ?? 0, c[62] ?? 0],
      abilityHit: [(c[63] ?? 1) === 1, (c[64] ?? 0) === 1, (c[65] ?? 0) === 1],
      tba: c[4],
      range: c[5],
      cost: c[6],
      cd: c[7] * 2, // 再生産: 値×2 = フレーム
      area: c[12] === 1,
      backswing: bciForm?.backswing ?? null,
      freq: bciForm?.freq ?? null,
      ld: { start: c[44] ?? 0, range: c[45] ?? 0 },
      ld2: c[99] === 1 ? { start: c[100] ?? 0, range: c[101] ?? 0 } : null,
      ld3: c[102] === 1 ? { start: c[103] ?? 0, range: c[104] ?? 0 } : null,
      traits: {
        red: c[10] === 1, floating: c[16] === 1, black: c[17] === 1,
        metal: c[18] === 1, traitless: c[19] === 1, angel: c[20] === 1,
        alien: c[21] === 1, zombie: c[22] === 1, witch: c[54] === 1,
        eva: c[76] === 1, relic: c[78] === 1, aku: c[96] === 1,
      },
      ab: {
        strong: c[23] === 1, massive: c[30] === 1, insaneDamage: c[81] === 1,
        resistant: c[29] === 1, insanelyTough: c[80] === 1,
        kbProb: c[24], freezeProb: c[25], freezeDur: c[26],
        slowProb: c[27], slowDur: c[28], weakenProb: c[37], weakenDur: c[38], weakenPct: c[39],
        strengthenStart: c[40], strengthenBoost: c[41],
        survive: c[42], crit: c[31], attacksOnly: c[32] === 1,
        extraMoney: c[33] === 1, baseDestroyer: c[34] === 1,
        waveProb: c[35], waveLevel: c[36], waveMini: c[94] === 1,
        zombieKiller: c[52] === 1, witchKiller: c[53] === 1, evaKiller: c[77] === 1,
        barrierBreak: c[70], shieldPierce: c[95],
        warpProb: c[71], warpDur: c[72],
        savageProb: c[82], savageAdd: c[83], dodgeProb: c[84], dodgeDur: c[85],
        surgeProb: c[86], surgeStart: c[87], surgeRange: c[88], surgeLevel: c[89],
        surgeMini: (c[108] ?? 0) === 1,
        explosionProb: 0, // battlecatsinfo の ability から後段で補完(列位置が不安定なため)
        curseProb: c[92], curseDur: c[93],
        colossusSlayer: c[97] === 1, behemothSlayer: c[105] === 1,
        behemothDodgeProb: c[106] ?? 0, behemothDodgeDur: c[107] ?? 0,
        sageSlayer: (c[109] ?? 0) === 1, metalKiller: (c[110] ?? 0) === 1,
        soulStrike: c[98] === 1, isMetal: c[43] === 1,
        immune: {
          wave: c[46] === 1, kb: c[48] === 1, freeze: c[49] === 1,
          slow: c[50] === 1, weaken: c[51] === 1, warp: c[75] === 1,
          curse: c[79] === 1, toxic: c[90] === 1, surge: c[91] === 1,
          shockwave: c[56] === 1, // 魔王震波
          explosion: (c[111] ?? 0) === 1,
        },
      },
    });
  }
  if (!forms.length) continue;
  cats.push({
    id,
    rarity: num(buy[13]),
    maxBase: num(buy[50]) || num(buy[49]) || 0, // 猫目MAX
    maxBaseNoEye: num(buy[49]) || 0,
    maxPlus: num(buy[51]) || 0,
    growth,
    forms,
    talents: talentsByCat.get(id) ?? null,
  });
}

// ===========================================================================
// 補完: BCData(正本)に無い情報だけ battlecatsinfo の最新データから追加する。
//   1) BCDataに存在しない新規ユニット(ルーノス等)を丸ごと追加
//   2) BCDataで本能データが欠けているユニット(セイバー等)に本能を補完
// 既存ユニットのステータスは一切上書きしない。
// ===========================================================================
{
  const BCI = join(RAW, "bci");
  const scheme = JSON.parse(readFileSync(join(BCI, "units_scheme.json"), "utf8"));
  const levelcurves = scheme.levelcurves; // [curveIdx][20]

  // battlecatsinfo の talents 列(= SkillAcquisition の行から先頭id列を除いたもの)を
  // 既存パーサと同じ形式に直して本能リストへ。
  const parseTalents = (pipeStr) => {
    if (!pipeStr || !pipeStr.trim()) return null;
    const row = ["_", ...pipeStr.split("|")]; // 先頭にダミーidを足すとSkillAcquisitionと同形
    const list = [];
    for (let off = 2; off + 13 < row.length; off += 14) {
      const abilityId = num(row[off]);
      if (abilityId === 0) continue;
      list.push({
        abilityId,
        maxLv: Math.max(1, num(row[off + 1])),
        min: [num(row[off + 2]), num(row[off + 4]), num(row[off + 6]), num(row[off + 8])],
        max: [num(row[off + 3]), num(row[off + 5]), num(row[off + 7]), num(row[off + 9])],
        textId: num(row[off + 10]),
        ultra: num(row[off + 13]) === 1,
      });
    }
    return list.length ? list : null;
  };

  // ability文字列をデコード: "9@15!200|28&" -> { 9:[15,200], 28:[] }
  const decodeAbility = (str) => {
    const out = {};
    if (!str || !str.trim()) return out;
    for (const tok of str.split("|")) {
      if (!tok) continue;
      if (tok.includes("@")) {
        const [id, rest] = tok.split("@");
        out[num(id)] = rest.split("!").map(num);
      } else if (tok.includes("&")) {
        const [id, v] = tok.split("&");
        out[num(id)] = v === "" || v === undefined ? [] : [num(v)];
      } else {
        out[num(tok)] = [];
      }
    }
    return out;
  };
  const has = (ab, id) => Object.prototype.hasOwnProperty.call(ab, id);
  const p = (ab, id, i) => ab[id]?.[i] ?? 0;

  // trait/immunity ビットマスク → フラグ(units_scheme の並び順)
  const decodeTraits = (mask) => ({
    red: !!(mask & 1), floating: !!(mask & 2), black: !!(mask & 4), metal: !!(mask & 8),
    angel: !!(mask & 16), alien: !!(mask & 32), zombie: !!(mask & 64), relic: !!(mask & 128),
    traitless: !!(mask & 256), eva: !!(mask & 512), witch: !!(mask & 1024), aku: !!(mask & 2048),
  });
  const decodeImmune = (mask) => ({
    wave: !!(mask & 1), freeze: !!(mask & 2), slow: !!(mask & 4), kb: !!(mask & 8),
    surge: !!(mask & 16), weaken: !!(mask & 32), warp: !!(mask & 64), curse: !!(mask & 128),
    toxic: !!(mask & 256), shockwave: !!(mask & 512), explosion: !!(mask & 1024),
  });

  // ability map → FormAbilities
  const buildAb = (ab) => ({
    strong: has(ab, 25), massive: has(ab, 28), insaneDamage: has(ab, 29),
    resistant: has(ab, 26), insanelyTough: has(ab, 27),
    kbProb: p(ab, 30, 0),
    freezeProb: p(ab, 22, 0), freezeDur: p(ab, 22, 1),
    slowProb: p(ab, 23, 0), slowDur: p(ab, 23, 1),
    weakenProb: p(ab, 21, 0), weakenDur: p(ab, 21, 1), weakenPct: p(ab, 21, 2),
    strengthenStart: p(ab, 1, 0), strengthenBoost: p(ab, 1, 1),
    survive: p(ab, 2, 0), crit: p(ab, 4, 0),
    attacksOnly: has(ab, 24), extraMoney: has(ab, 10), baseDestroyer: has(ab, 3),
    waveProb: has(ab, 13) ? p(ab, 13, 0) : p(ab, 12, 0),
    waveLevel: has(ab, 13) ? p(ab, 13, 1) : p(ab, 12, 1),
    waveMini: has(ab, 12) && !has(ab, 13),
    zombieKiller: has(ab, 5), witchKiller: has(ab, 19), evaKiller: has(ab, 20),
    barrierBreak: p(ab, 7, 0), shieldPierce: p(ab, 8, 0),
    warpProb: p(ab, 31, 0), warpDur: p(ab, 31, 1),
    savageProb: p(ab, 9, 0), savageAdd: p(ab, 9, 1),
    dodgeProb: p(ab, 32, 0), dodgeDur: p(ab, 32, 1),
    surgeProb: has(ab, 15) ? p(ab, 15, 0) : p(ab, 14, 0),
    surgeStart: has(ab, 15) ? p(ab, 15, 1) : p(ab, 14, 1),
    surgeRange: has(ab, 15) ? p(ab, 15, 2) : p(ab, 14, 2),
    surgeLevel: has(ab, 15) ? p(ab, 15, 3) : p(ab, 14, 3),
    surgeMini: has(ab, 14) && !has(ab, 15),
    explosionProb: p(ab, 45, 0),
    curseProb: p(ab, 33, 0), curseDur: p(ab, 33, 1),
    colossusSlayer: has(ab, 17), behemothSlayer: has(ab, 18),
    behemothDodgeProb: p(ab, 18, 0), behemothDodgeDur: p(ab, 18, 1),
    sageSlayer: has(ab, 42), metalKiller: has(ab, 44),
    soulStrike: has(ab, 6), isMetal: has(ab, 11),
    immune: { wave: false, kb: false, freeze: false, slow: false, weaken: false,
      warp: false, curse: false, toxic: false, surge: false, shockwave: false, explosion: false },
  });

  // catstat.tsv を id ごとの form 配列に
  const statLines = readFileSync(join(BCI, "catstat.tsv"), "utf8").split(/\r?\n/);
  const sh = statLines[0].split("\t");
  const col = Object.fromEntries(sh.map((h, i) => [h, i]));
  const statById = new Map();
  for (const line of statLines.slice(1)) {
    if (!line.trim()) continue;
    const r = line.split("\t");
    const id = num(r[col.id]);
    if (!statById.has(id)) statById.set(id, []);
    statById.get(id).push(r);
  }

  // cat.tsv(unit メタ)
  const catLines = readFileSync(join(BCI, "cat.tsv"), "utf8").split(/\r?\n/).slice(1);
  const ch = readFileSync(join(BCI, "cat.tsv"), "utf8").split(/\r?\n/)[0].split("\t");
  const cc = Object.fromEntries(ch.map((h, i) => [h, i]));

  const parseLd = (s1, s2, i) => {
    const a = (s1 || "").split("|").map(num);
    const b = (s2 || "").split("|").map(num);
    if (a[i] === undefined) return null;
    if ((a[i] || 0) === 0 && (b[i] || 0) === 0) return null;
    return { start: a[i] || 0, range: b[i] || 0 };
  };

  const existing = new Set(cats.map((c) => c.id));
  let added = 0;
  let filled = 0;

  for (let id = 0; id < catLines.length; id++) {
    const metaRow = catLines[id];
    if (!metaRow || !metaRow.trim()) continue;
    const m = metaRow.split("\t");
    const talentStr = m[cc.talents];

    // (2) 既存ユニットの本能補完(BCDataに本能が無い場合のみ)
    if (existing.has(id)) {
      const cat = cats.find((c) => c.id === id);
      if (cat && !cat.talents) {
        const t = parseTalents(talentStr);
        if (t) { cat.talents = t; filled++; }
      }
      continue;
    }

    // (1) 新規ユニットを丸ごと追加
    const statRows = statById.get(id);
    if (!statRows) continue;
    const formCount = num(m[cc.form_count]) || statRows.length;
    const curve = levelcurves[num(m[cc.level_curve])] ?? levelcurves[0];
    const forms = [];
    for (let f = 0; f < Math.min(statRows.length, formCount); f++) {
      const r = statRows[f];
      const name = (r[col.name_jp] || "").trim();
      if (!name) continue;
      const ab = decodeAbility(r[col.ability]);
      const fab = buildAb(ab);
      fab.immune = decodeImmune(num(r[col.immunity]));
      forms.push({
        name,
        desc: "",
        hp: num(r[col.health_point]),
        kb: num(r[col.knockbacks]),
        speed: num(r[col.speed]),
        atk: [num(r[col.attack_power_1]), num(r[col.attack_power_2]), num(r[col.attack_power_3])],
        fore: [num(r[col.preswing_1]), num(r[col.preswing_2]), num(r[col.preswing_3])],
        abilityHit: [true, num(r[col.attack_power_2]) > 0, num(r[col.attack_power_3]) > 0],
        tba: num(r[col.time_between_attacks]),
        range: num(r[col.range]),
        cost: num(r[col.price]),
        cd: num(r[col.cd]),
        area: (num(r[col.attack_type]) & 2) !== 0,
        backswing: num(r[col.backswing]),
        freq: num(r[col.attack_frequency]),
        ld: parseLd(r[col.long_distance_1], r[col.long_distance_2], 0) ?? { start: 0, range: 0 },
        ld2: parseLd(r[col.long_distance_1], r[col.long_distance_2], 1),
        ld3: parseLd(r[col.long_distance_1], r[col.long_distance_2], 2),
        traits: decodeTraits(num(r[col.trait])),
        ab: fab,
      });
    }
    if (!forms.length) continue;
    cats.push({
      id,
      rarity: num(m[cc.rarity]),
      maxBase: num(m[cc.max_base_level]) || 0,
      maxBaseNoEye: num(m[cc.max_base_level]) || 0,
      maxPlus: num(m[cc.max_plus_level]) || 0,
      growth: curve.map(num),
      forms,
      talents: parseTalents(talentStr),
    });
    added++;
  }

  // 爆破攻撃(ability 45)の発動率を battlecatsinfo の ability から全キャラに補完。
  // BCData の爆破列は行ごとに列数が変わり不安定なため、クリーンな ability 文字列を使う。
  let expSet = 0;
  for (const cat of cats) {
    const statRows = statById.get(cat.id);
    if (!statRows) continue;
    cat.forms.forEach((form, f) => {
      const r = statRows[f];
      if (!r) return;
      const ab = decodeAbility(r[col.ability]);
      const prob = has(ab, 45) ? p(ab, 45, 0) : 0;
      if (prob > 0) {
        form.ab.explosionProb = prob;
        expSet++;
      }
    });
  }

  cats.sort((a, b) => a.id - b.id);
  console.log(`補完: 新規ユニット +${added}, 本能補完 ${filled}, 爆破prob ${expSet}`);
}

// ---- にゃんコンボ ----
const comboNames = readFileSync(join(RAW, "jp/resLocal/Nyancombo_ja.csv"), "utf8")
  .split(/\r?\n/).map((l) => l.split(",")[0].trim());
const effectNames = readFileSync(join(RAW, "jp/resLocal/Nyancombo1_ja.csv"), "utf8")
  .split(/\r?\n/).map((l) => l.split(",")[0].trim()).filter(Boolean);
const sizeNames = readFileSync(join(RAW, "jp/resLocal/Nyancombo2_ja.csv"), "utf8")
  .split(/\r?\n/).map((l) => l.split(",")[0].trim()).filter(Boolean);
const comboParams = readFileSync(join(RAW, "jp/DataLocal/NyancomboParam.tsv"), "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split("\t").map(num));

// NyancomboData.csv と Nyancombo_ja.csv は行番号で 1:1 対応(1行=1コンボ=1効果)。
// ただし先頭ブロック(0〜)は旧データで、2ブロック目(「にゃんこ軍団」2回目以降)が
// 現行の正しいデータ(例: アイラブジャパンは旧=攻撃力小, 現行=攻撃力中)。
// よって2ブロック目だけを採用する。
const comboDataLines = readFileSync(join(RAW, "jp/DataLocal/NyancomboData.csv"), "utf8")
  .split(/\r?\n/);
const block2Start = (() => {
  const i = comboNames.indexOf(comboNames[0], 1); // にゃんこ軍団 の2回目
  return i > 0 ? i : 0;
})();
const combos = [];
const seenCombo = new Set();
const addCombo = (i) => {
  const name = comboNames[i];
  const line = comboDataLines[i];
  if (!name || !line || !line.trim()) return;
  const c = line.split(",").map(num);
  const effect = c[13];
  const size = c[14];
  if (effect < 0) return;
  const units = [];
  for (let j = 3; j <= 11; j += 2) {
    if (c[j] >= 0) units.push([c[j], c[j + 1]]);
  }
  if (!units.length) return;
  // 同名+同構成の重複は除外(block2を先に処理するので現行の効果値が残る)
  const key = name + "|" + units.map((u) => u.join("-")).join(",");
  if (seenCombo.has(key)) return;
  seenCombo.add(key);
  combos.push({
    id: i,
    name,
    units,
    effects: [{ effect, size, value: comboParams[effect]?.[size] ?? 0 }],
  });
};
// 現行(block2)を優先。その後 block1 のみに存在する旧来コンボ(ヒーローズ等)を追加。
for (let i = block2Start; i < comboNames.length; i++) addCombo(i);
for (let i = 0; i < block2Start; i++) addCombo(i);
combos.sort((a, b) => a.id - b.id);

const meta = {
  rarities: ["基本", "EX", "レア", "激レア", "超激レア", "伝説レア"],
  comboEffects: effectNames,
  comboSizes: sizeNames,
  skillDesc: Object.fromEntries(skillDesc),
};

writeFileSync(join(OUT, "cats.json"), JSON.stringify(cats));
writeFileSync(join(OUT, "combos.json"), JSON.stringify(combos));
writeFileSync(join(OUT, "meta.json"), JSON.stringify(meta));
console.log(`cats: ${cats.length}, combos: ${combos.length}`);
console.log(`sizes: cats.json=${(JSON.stringify(cats).length / 1e6).toFixed(2)}MB`);
