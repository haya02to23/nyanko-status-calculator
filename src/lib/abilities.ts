import type { CatForm } from "./types";
import { framesToSec } from "./calc";

const TRAIT_LABELS: [keyof CatForm["traits"], string][] = [
  ["red", "赤い敵"],
  ["floating", "浮いてる敵"],
  ["black", "黒い敵"],
  ["metal", "メタルな敵"],
  ["traitless", "属性を持たない敵"],
  ["angel", "天使"],
  ["alien", "エイリアン"],
  ["zombie", "ゾンビ"],
  ["aku", "悪魔"],
  ["relic", "古代種"],
  ["witch", "魔女"],
  ["eva", "使徒"],
];

export function targetTraits(form: CatForm): string[] {
  return TRAIT_LABELS.filter(([k]) => form.traits[k]).map(([, l]) => l);
}

// 特性を日本語の箇条書きにする
export function abilityTexts(form: CatForm): string[] {
  const a = form.ab;
  const out: string[] = [];
  const sec = (f: number) => `${framesToSec(f)}秒`;

  if (a.strong) out.push("めっぽう強い (対象に 攻×1.5 / 実質体力×2)");
  if (a.massive) out.push("超ダメージ (対象に 攻×3)");
  if (a.insaneDamage) out.push("極ダメージ (対象に 攻×5)");
  if (a.resistant) out.push("打たれ強い (対象から 実質体力×4)");
  if (a.insanelyTough) out.push("超打たれ強い (対象から 実質体力×6)");
  if (a.kbProb > 0) out.push(`ふっとばす (${a.kbProb}%)`);
  if (a.freezeProb > 0) out.push(`動きを止める (${a.freezeProb}% / ${sec(a.freezeDur)})`);
  if (a.slowProb > 0) out.push(`動きを遅くする (${a.slowProb}% / ${sec(a.slowDur)})`);
  if (a.weakenProb > 0)
    out.push(`攻撃力ダウン (${a.weakenProb}% / ${sec(a.weakenDur)} / ${a.weakenPct}%に低下)`);
  if (a.curseProb > 0) out.push(`呪い (${a.curseProb}% / ${sec(a.curseDur)})`);
  if (a.strengthenBoost > 0)
    out.push(`攻撃力上昇 (体力${a.strengthenStart}%以下で攻撃力${100 + a.strengthenBoost}%)`);
  if (a.survive > 0) out.push(`生き残る (${a.survive}%)`);
  if (a.crit > 0) out.push(`クリティカル (${a.crit}%)`);
  if (a.savageProb > 0) out.push(`渾身の一撃 (${a.savageProb}% / 威力+${a.savageAdd}%)`);
  if (a.waveProb > 0)
    out.push(`${a.waveMini ? "小波動" : "波動"} (${a.waveProb}% / Lv${a.waveLevel})`);
  if (a.surgeProb > 0)
    out.push(
      `${a.surgeMini ? "小烈波" : "烈波"} (${a.surgeProb}% / Lv${a.surgeLevel} / 射程${Math.floor(
        a.surgeStart / 4
      )}〜${Math.floor((a.surgeStart + a.surgeRange) / 4)})`
    );
  if (a.warpProb > 0) out.push(`ワープ (${a.warpProb}% / ${sec(a.warpDur)})`);
  if (a.barrierBreak > 0) out.push(`バリアブレイカー (${a.barrierBreak}%)`);
  if (a.shieldPierce > 0) out.push(`シールドブレイカー (${a.shieldPierce}%)`);
  if (a.dodgeProb > 0) out.push(`攻撃無効 (${a.dodgeProb}% / ${sec(a.dodgeDur)})`);
  if (a.behemothDodgeProb > 0)
    out.push(`超獣の攻撃無効 (${a.behemothDodgeProb}% / ${sec(a.behemothDodgeDur)})`);
  if (a.zombieKiller) out.push("ゾンビキラー (復活を阻止)");
  if (a.witchKiller) out.push("魔女キラー (魔女に 攻×5 / 実質体力×10)");
  if (a.evaKiller) out.push("使徒キラー (使徒に 攻×5 / 実質体力×5)");
  if (a.colossusSlayer) out.push("超生命体特効 (攻×1.6 / 実質体力×1.43)");
  if (a.behemothSlayer) out.push("超獣特効 (攻×2.5 / 実質体力×1.67)");
  if (a.sageSlayer) out.push("超賢者特効 (攻×1.2 / 実質体力×2)");
  if (a.metalKiller) out.push("メタルキラー");
  if (a.soulStrike) out.push("魂攻撃");
  if (a.baseDestroyer) out.push("城破壊ホーダイ");
  if (a.extraMoney) out.push("撃破時お金アップ");
  if (a.attacksOnly) out.push("攻撃ターゲット限定");
  if (a.isMetal) out.push("メタル (被ダメ1、クリティカル以外)");

  const imm: string[] = [];
  if (a.immune.wave) imm.push("波動");
  if (a.immune.surge) imm.push("烈波");
  if (a.immune.explosion) imm.push("爆波");
  if (a.immune.kb) imm.push("ふっとばし");
  if (a.immune.freeze) imm.push("動きを止める");
  if (a.immune.slow) imm.push("動きを遅くする");
  if (a.immune.weaken) imm.push("攻撃力ダウン");
  if (a.immune.warp) imm.push("ワープ");
  if (a.immune.curse) imm.push("古代の呪い");
  if (a.immune.toxic) imm.push("毒撃");
  if (a.immune.shockwave) imm.push("魔王震波");
  if (imm.length) out.push(`${imm.join("・")}無効`);

  return out;
}

// 攻撃タイプ表示 (単体/範囲、遠方範囲)
export function attackTypeText(form: CatForm): string {
  const parts: string[] = [form.area ? "範囲攻撃" : "単体攻撃"];
  if (form.ld.range !== 0) {
    const start = form.ld.start;
    const end = form.ld.start + form.ld.range;
    parts.push(
      form.ld.range > 0
        ? `遠方範囲 (${start}〜${end})`
        : `全方位 (${end}〜${start})`
    );
  }
  return parts.join(" / ");
}
