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
  const nForms = Math.min(statRows.length, nameRows.length);
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
        zombieKiller: c[52] === 1, witchKiller: c[53] === 1,
        barrierBreak: c[70], shieldPierce: c[95],
        warpProb: c[71], warpDur: c[72],
        savageProb: c[82], savageAdd: c[83], dodgeProb: c[84], dodgeDur: c[85],
        surgeProb: c[86], surgeStart: c[87], surgeRange: c[88], surgeLevel: c[89],
        surgeMini: (c[108] ?? 0) === 1,
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

// ---- にゃんコンボ ----
const comboNames = readFileSync(join(RAW, "jp/resLocal/Nyancombo_ja.csv"), "utf8")
  .split(/\r?\n/).map((l) => l.split(",")[0].trim());
const effectNames = readFileSync(join(RAW, "jp/resLocal/Nyancombo1_ja.csv"), "utf8")
  .split(/\r?\n/).map((l) => l.split(",")[0].trim()).filter(Boolean);
const sizeNames = readFileSync(join(RAW, "jp/resLocal/Nyancombo2_ja.csv"), "utf8")
  .split(/\r?\n/).map((l) => l.split(",")[0].trim()).filter(Boolean);
const comboParams = readFileSync(join(RAW, "jp/DataLocal/NyancomboParam.tsv"), "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split("\t").map(num));

const combos = [];
for (const row of readCsv(join(RAW, "jp/DataLocal/NyancomboData.csv"))) {
  const c = row.map(num);
  const comboId = c[0];
  const effect = c[13];
  const size = c[14];
  if (effect < 0 || !comboNames[comboId]) continue;
  const units = [];
  for (let i = 3; i <= 11; i += 2) {
    if (c[i] >= 0) units.push([c[i], c[i + 1]]);
  }
  if (!units.length) continue;
  combos.push({
    id: comboId,
    name: comboNames[comboId],
    effect,
    size,
    value: comboParams[effect]?.[size] ?? 0,
    units,
  });
}

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
