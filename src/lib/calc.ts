import type { Cat, CatForm, Combo, Talent } from "./types";

// 本能のabilityIDのうち、表示ステータスに直接影響するもの
export const TALENT_HP_UP = 32; // 基本体力アップ(%)
export const TALENT_ATK_UP = 31; // 基本攻撃力アップ(%)
export const TALENT_SPEED_UP = 27; // 移動速度アップ(+値)
export const TALENT_COST_DOWN = 25; // 生産コスト割引(章1基準の値)
export const TALENT_CD_DOWN = 26; // 生産スピードアップ(フレーム)
export const TALENT_INTERVAL_DOWN = 61; // 攻撃間隔短縮(フレーム)

// にゃんコンボの効果ID
export const COMBO_ATK_UP = 0; // キャラクターの攻撃力アップ(%)
export const COMBO_HP_UP = 1; // キャラクターの体力アップ(%)
export const COMBO_SPEED_UP = 2; // キャラクターの移動速度アップ(%)

// レベル倍率(%): 100 + Σ(増分)。レベルkへの増分は growth[floor((k-1)/10)]
// (例: 成長率20が6ブロック → Lv60まで毎レベル+20%、以降半減)
// 浮動小数を避け整数%で持つ(ゲーム内計算と一致させるため)
export function levelMultiplierPct(growth: number[], level: number): number {
  let pct = 100;
  for (let i = 1; i < level; i++) {
    const block = Math.min(Math.floor(i / 10), growth.length - 1);
    pct += growth[block] ?? 0;
  }
  return pct;
}

// にゃんこ研究力MAXで再生産-254F(約8.47秒)、下限60F。battlecats-db等はこの値を表示
export const RESEARCH_MAX_FRAMES = 254;
export const MIN_CD_FRAMES = 60;

// 本能の効果値: Lv1=min, 最大Lv=max を線形補間
export function talentValue(t: Talent, lv: number, slot = 0): number {
  if (lv <= 0) return 0;
  const min = t.min[slot];
  const max = t.max[slot];
  if (t.maxLv <= 1) return max || min;
  return Math.round(min + ((max - min) * (lv - 1)) / (t.maxLv - 1));
}

export type CalcOptions = {
  level: number; // 基本レベル
  plus: number; // +値
  treasure: number; // 日本編お宝倍率 1.0〜2.5
  talentLevels: number[]; // cat.talents と同じ順のレベル(0=未解放)
  combos: Combo[]; // 選択中のにゃんコンボ
};

export type CalcResult = {
  totalLevel: number;
  levelMult: number;
  // 体力
  hpBase: number; // レベル+お宝のみ
  hp: number; // 本能・コンボ込み
  hpTalentPct: number;
  hpComboPct: number;
  // 攻撃力
  atkBase: number; // 全ヒット合計(レベル+お宝のみ)
  atk: number; // 本能・コンボ込み
  atkHits: number[]; // ヒット毎(本能・コンボ込み)
  atkTalentPct: number;
  atkComboPct: number;
  // その他
  dps: number;
  freq: number; // 攻撃頻度(F)
  freqIsEstimate: boolean;
  speed: number;
  cost: number; // 第2章基準(=生データ×1.5)
  cd: number; // 再生産(F) 素の値
  cdResearch: number; // 再生産(F) 研究力MAX込み
  kb: number;
  range: number;
};

const applyLevel = (base: number, multPct: number, treasure: number) =>
  Math.floor(Math.floor((base * multPct) / 100) * treasure);

export function calcStats(cat: Cat, form: CatForm, opt: CalcOptions): CalcResult {
  const totalLevel = opt.level + opt.plus;
  const multPct = levelMultiplierPct(cat.growth, totalLevel);

  // 本能の効果値を集計
  let hpTalentPct = 0;
  let atkTalentPct = 0;
  let speedAdd = 0;
  let costDown = 0;
  let cdDown = 0;
  let intervalDown = 0;
  if (cat.talents) {
    cat.talents.forEach((t, i) => {
      const lv = opt.talentLevels[i] ?? 0;
      if (lv <= 0) return;
      const v = talentValue(t, lv);
      if (t.abilityId === TALENT_HP_UP) hpTalentPct += v;
      else if (t.abilityId === TALENT_ATK_UP) atkTalentPct += v;
      else if (t.abilityId === TALENT_SPEED_UP) speedAdd += v;
      else if (t.abilityId === TALENT_COST_DOWN) costDown += v;
      else if (t.abilityId === TALENT_CD_DOWN) cdDown += v;
      else if (t.abilityId === TALENT_INTERVAL_DOWN) intervalDown += v;
    });
  }

  // にゃんコンボ(同効果は加算)。1コンボが複数効果を持つ場合あり
  let hpComboPct = 0;
  let atkComboPct = 0;
  let speedComboPct = 0;
  for (const c of opt.combos) {
    for (const e of c.effects) {
      if (e.effect === COMBO_HP_UP) hpComboPct += e.value;
      else if (e.effect === COMBO_ATK_UP) atkComboPct += e.value;
      else if (e.effect === COMBO_SPEED_UP) speedComboPct += e.value;
    }
  }

  const hpBase = applyLevel(form.hp, multPct, opt.treasure);
  const hp = Math.floor(
    Math.floor(hpBase * (1 + hpTalentPct / 100)) * (1 + hpComboPct / 100)
  );

  const hits = form.atk.filter((a) => a > 0);
  const atkHitsBase = (hits.length ? hits : [form.atk[0]]).map((a) =>
    applyLevel(a, multPct, opt.treasure)
  );
  const atkHits = atkHitsBase.map((a) =>
    Math.floor(Math.floor(a * (1 + atkTalentPct / 100)) * (1 + atkComboPct / 100))
  );
  const atkBase = atkHitsBase.reduce((s, a) => s + a, 0);
  const atk = atkHits.reduce((s, a) => s + a, 0);

  // 攻撃頻度: アニメ込みの実測値があれば使用、なければ 先行+2×TBA-1 で近似
  const foreTotal = form.fore.filter((f, i) => i === 0 || form.atk[i] > 0).reduce((s, f) => s + f, 0);
  let freq: number;
  let freqIsEstimate = false;
  if (form.freq != null && form.freq > 0) {
    freq = form.freq;
  } else if (form.tba > 0) {
    freq = foreTotal + form.tba * 2 - 1;
    freqIsEstimate = true;
  } else {
    freq = foreTotal + (form.backswing ?? 0);
    freqIsEstimate = form.backswing == null;
  }
  if (intervalDown > 0) {
    const minFreq = foreTotal + (form.backswing ?? 1);
    freq = Math.max(freq - intervalDown, minFreq);
  }

  const dps = atk / (freq / 30);

  const cdRaw = Math.max(form.cd - cdDown, MIN_CD_FRAMES);

  return {
    totalLevel,
    levelMult: multPct / 100,
    hpBase,
    hp,
    hpTalentPct,
    hpComboPct,
    atkBase,
    atk,
    atkHits,
    atkTalentPct,
    atkComboPct,
    dps,
    freq,
    freqIsEstimate,
    speed: Math.floor((form.speed + speedAdd) * (1 + speedComboPct / 100)),
    cost: Math.round((form.cost - costDown) * 1.5),
    cd: cdRaw,
    cdResearch: Math.max(cdRaw - RESEARCH_MAX_FRAMES, MIN_CD_FRAMES),
    kb: form.kb,
    range: form.range,
  };
}

export const framesToSec = (f: number) => (f / 30).toFixed(2);

// ── ダメージ補正を加味した実質値 ────────────────────────────
// 倍率はゲーム内部実装(battlecatsinfo)準拠。すべて「対象に該当する敵」に対してのみ適用。
//   攻撃: めっぽう強い×1.5 / 超ダメージ×3 / 極ダメージ×5 (排他、優先 超>極>めっぽう…実際はmassive>massives>good)
//   体力: 打たれ強い×4 / 超打たれ強い×6 / めっぽう強い×2 (排他)
//   特効: 超獣 攻2.5・体÷0.6 / 超生命体 攻1.6・体÷0.7 / 超賢者 攻1.2・体÷0.5
//   キラー: 魔女 攻5・体10 / 使徒 攻5・体5

export type EffectiveRow = {
  label: string; // 対象の説明
  atkMult: number;
  hpMult: number;
  atk: number; // 実質攻撃力
  hp: number; // 実質体力
  dps: number; // 実質DPS
};

export type EffectiveBase = { atk: number; hp: number; dps: number };

// 未来編お宝(対属性効果)の対象となる属性。これらの敵にはお宝コンプで倍率が強化される。
// massive_t = resist_t = 1, good_atk_t = 0.3, good_hp_t = 0.1 (treasures[23]=300時)
const TREASURE_TRAIT_KEYS = ["red", "floating", "black", "angel", "alien", "zombie", "metal"] as const;
const TRAIT_SHORT: Record<string, string> = {
  red: "赤",
  floating: "浮",
  black: "黒",
  metal: "メタル",
  angel: "天使",
  alien: "エイリアン",
  zombie: "ゾンビ",
  traitless: "無属性",
  relic: "古代種",
  aku: "悪魔",
  eva: "使徒",
  witch: "魔女",
};

// 攻撃対象として倍率がかかる属性(使徒・魔女はキラーで別扱いするため除外)
const ATTACK_TARGET_KEYS = [
  "red", "floating", "black", "metal", "angel", "alien", "zombie", "traitless", "relic", "aku",
] as const;

// treasureBonus: 未来編お宝コンプ相当の対属性強化を適用するか
export function effectiveRows(
  form: CatForm,
  base: EffectiveBase,
  treasureBonus: boolean
): EffectiveRow[] {
  const a = form.ab;
  const rows: EffectiveRow[] = [];
  const push = (label: string, atkMult: number, hpMult: number) => {
    if (atkMult === 1 && hpMult === 1) return;
    rows.push({
      label,
      atkMult,
      hpMult,
      atk: Math.round(base.atk * atkMult),
      hp: Math.round(base.hp * hpMult),
      dps: Math.round(base.dps * atkMult),
    });
  };

  // 対象属性に対するめっぽう/超ダメ/極ダメ・打たれ強い系。
  // お宝対象属性(赤浮黒天使エイリアンゾンビメタル)とお宝対象外で倍率が変わるため行を分ける。
  const hasTargetDmg =
    a.massive || a.insaneDamage || a.strong || a.resistant || a.insanelyTough;
  if (hasTargetDmg) {
    const targetKeys = ATTACK_TARGET_KEYS.filter((k) => form.traits[k]);
    const treaKeys = targetKeys.filter((k) => (TREASURE_TRAIT_KEYS as readonly string[]).includes(k));
    const plainKeys = targetKeys.filter((k) => !(TREASURE_TRAIT_KEYS as readonly string[]).includes(k));
    const addTargetRow = (keys: string[], bonus: boolean) => {
      if (!keys.length) return;
      const mt = bonus ? 1 : 0; // massive_t / resist_t
      const gAtk = bonus ? 0.3 : 0; // good_atk_t
      const gHp = bonus ? 0.1 : 0; // good_hp_t
      const atkMult = a.massive
        ? 3 + mt
        : a.insaneDamage
          ? 5 + mt
          : a.strong
            ? 1.5 + gAtk
            : 1;
      const hpMult = a.resistant
        ? 4 + mt
        : a.insanelyTough
          ? 6 + mt
          : a.strong
            ? 1 / (0.5 - gHp)
            : 1;
      push(`対象(${keys.map((k) => TRAIT_SHORT[k]).join("・")})`, atkMult, hpMult);
    };
    addTargetRow(treaKeys, treasureBonus);
    addTargetRow(plainKeys, false);
  }

  // 種族特効・キラー(攻撃対象属性とは独立。お宝対象外で固定倍率)
  if (a.behemothSlayer) push("超獣", 2.5, 1 / 0.6);
  if (a.colossusSlayer) push("超生命体", 1.6, 1 / 0.7);
  if (a.sageSlayer) push("超賢者", 1.2, 1 / 0.5);
  if (a.witchKiller) push("魔女", 5, 10);
  if (a.evaKiller) push("使徒", 5, 5);

  return rows;
}

// 攻撃力上昇(体力一定%以下で発動): 発動時の追加倍率。未所持は null
export function strengthenInfo(form: CatForm): { threshold: number; mult: number } | null {
  const a = form.ab;
  if (a.strengthenBoost <= 0) return null;
  return { threshold: a.strengthenStart, mult: 1 + a.strengthenBoost / 100 };
}

// クリティカル期待倍率(確率crit%で2倍)。未所持は null
export function critInfo(form: CatForm): { prob: number; expectedMult: number } | null {
  const a = form.ab;
  if (a.crit <= 0) return null;
  return { prob: a.crit, expectedMult: 1 + a.crit / 100 };
}
