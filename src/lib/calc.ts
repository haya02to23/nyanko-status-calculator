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

  // にゃんコンボ(同効果は加算)
  let hpComboPct = 0;
  let atkComboPct = 0;
  let speedComboPct = 0;
  for (const c of opt.combos) {
    if (c.effect === COMBO_HP_UP) hpComboPct += c.value;
    else if (c.effect === COMBO_ATK_UP) atkComboPct += c.value;
    else if (c.effect === COMBO_SPEED_UP) speedComboPct += c.value;
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
