export type LdRange = { start: number; range: number };

export type FormAbilities = {
  strong: boolean;
  massive: boolean;
  insaneDamage: boolean;
  resistant: boolean;
  insanelyTough: boolean;
  kbProb: number;
  freezeProb: number;
  freezeDur: number;
  slowProb: number;
  slowDur: number;
  weakenProb: number;
  weakenDur: number;
  weakenPct: number;
  strengthenStart: number;
  strengthenBoost: number;
  survive: number;
  crit: number;
  attacksOnly: boolean;
  extraMoney: boolean;
  baseDestroyer: boolean;
  waveProb: number;
  waveLevel: number;
  waveMini: boolean;
  zombieKiller: boolean;
  witchKiller: boolean;
  evaKiller: boolean;
  barrierBreak: number;
  shieldPierce: number;
  warpProb: number;
  warpDur: number;
  savageProb: number;
  savageAdd: number;
  dodgeProb: number;
  dodgeDur: number;
  surgeProb: number;
  surgeStart: number;
  surgeRange: number;
  surgeLevel: number;
  surgeMini: boolean;
  explosionProb: number;
  curseProb: number;
  curseDur: number;
  colossusSlayer: boolean;
  behemothSlayer: boolean;
  behemothDodgeProb: number;
  behemothDodgeDur: number;
  sageSlayer: boolean;
  metalKiller: boolean;
  soulStrike: boolean;
  isMetal: boolean;
  immune: {
    wave: boolean;
    kb: boolean;
    freeze: boolean;
    slow: boolean;
    weaken: boolean;
    warp: boolean;
    curse: boolean;
    toxic: boolean;
    surge: boolean;
    shockwave: boolean;
    explosion: boolean;
  };
};

export type CatForm = {
  name: string;
  desc: string;
  hp: number;
  kb: number;
  speed: number;
  atk: [number, number, number];
  fore: [number, number, number];
  abilityHit: [boolean, boolean, boolean];
  tba: number;
  range: number;
  cost: number;
  cd: number;
  area: boolean;
  backswing: number | null;
  freq: number | null;
  ld: LdRange;
  ld2: LdRange | null;
  ld3: LdRange | null;
  traits: {
    red: boolean;
    floating: boolean;
    black: boolean;
    metal: boolean;
    traitless: boolean;
    angel: boolean;
    alien: boolean;
    zombie: boolean;
    witch: boolean;
    eva: boolean;
    relic: boolean;
    aku: boolean;
  };
  ab: FormAbilities;
};

export type Talent = {
  abilityId: number;
  maxLv: number;
  min: [number, number, number, number];
  max: [number, number, number, number];
  textId: number;
  ultra: boolean;
};

export type Cat = {
  id: number;
  rarity: number;
  maxBase: number;
  maxBaseNoEye: number;
  maxPlus: number;
  growth: number[];
  forms: CatForm[];
  talents: Talent[] | null;
};

export type ComboEffect = {
  effect: number;
  size: number;
  value: number;
};

export type Combo = {
  id: number;
  name: string;
  units: [number, number][];
  effects: ComboEffect[];
};

export type Meta = {
  rarities: string[];
  comboEffects: string[];
  comboSizes: string[];
  skillDesc: Record<string, string>;
};
