"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cat, Combo, Meta } from "@/lib/types";
import {
  calcStats,
  framesToSec,
  talentValue,
  effectiveRows,
  resolveTalents,
  splashEffects,
  COMBO_ATK_UP,
  COMBO_HP_UP,
  COMBO_SPEED_UP,
  TALENT_ATK_UP,
  TALENT_HP_UP,
  TALENT_SPEED_UP,
  TALENT_COST_DOWN,
  TALENT_CD_DOWN,
  TALENT_INTERVAL_DOWN,
} from "@/lib/calc";
import {
  abilityTexts,
  attackTypeText,
  targetTraits,
  activeHitRanges,
  hasVariedRanges,
} from "@/lib/abilities";

// ひらがな→カタカナにして大文字小文字を無視した検索用キー
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

const RARITY_COLORS = [
  "bg-stone-500",
  "bg-teal-600",
  "bg-sky-600",
  "bg-violet-600",
  "bg-brand",
  "bg-rose-600",
];

const HISTORY_KEY = "nyanko-calc-history";

// 形態に応じた既定レベル: 第4形態(超化)はLv60で解放されるため60スタート
const defaultLevelForForm = (formIdx: number, maxBase: number) =>
  Math.min(formIdx >= 3 ? 60 : 50, maxBase);

const STAT_EFFECTS = [COMBO_ATK_UP, COMBO_HP_UP, COMBO_SPEED_UP];
const comboHasStat = (c: Combo) => c.effects.some((e) => STAT_EFFECTS.includes(e.effect));

// コンボの効果を「攻撃力アップ【大】+20%」のように整形(全効果)
function comboEffectText(c: Combo, meta: Meta): string {
  return c.effects
    .map((e) => {
      const name = meta.comboEffects[e.effect] ?? "";
      const size = meta.comboSizes[e.size] ?? "";
      const pct = STAT_EFFECTS.includes(e.effect) ? ` +${e.value}%` : "";
      return `${name}${size}${pct}`;
    })
    .join(" / ");
}

const TALENT_LABELS: Record<number, string> = {
  [TALENT_HP_UP]: "体力アップ",
  [TALENT_ATK_UP]: "攻撃力アップ",
  [TALENT_SPEED_UP]: "移動速度アップ",
  [TALENT_COST_DOWN]: "生産コスト割引",
  [TALENT_CD_DOWN]: "生産スピードアップ",
  [TALENT_INTERVAL_DOWN]: "攻撃間隔短縮",
};

function talentLabel(abilityId: number, textId: number, meta: Meta): string {
  if (TALENT_LABELS[abilityId]) return TALENT_LABELS[abilityId];
  const desc = meta.skillDesc[String(textId)] ?? "";
  const m = desc.match(/「(.+?)」/);
  if (m) {
    const strengthen = desc.includes("強化");
    return m[1] + (strengthen ? "【強化】" : "");
  }
  return desc.split("<br>")[0] || `本能${abilityId}`;
}

// ユニットアイコン(public/icons/units/)。遅延読込で見えた分だけ取得。
// form指定時は その形態の絵({id}-{form}.webp)。無ければ代表({id}.webp)にフォールバック。
function UnitIcon({
  id,
  form,
  className = "",
}: {
  id: number;
  form?: number;
  className?: string;
}) {
  const rep = `/icons/units/${id}.webp`;
  const primary = form != null ? `/icons/units/${id}-${form}.webp` : rep;
  return (
    <img
      key={primary}
      src={primary}
      alt=""
      loading="lazy"
      width={104}
      height={79}
      className={`shrink-0 rounded-md bg-sunken object-contain ring-1 ring-line/60 ${className}`}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.src.endsWith(rep)) img.src = rep; // 形態別が無ければ代表へ
        else img.style.visibility = "hidden"; // 代表も無ければ隠す
      }}
    />
  );
}

export default function Calculator() {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [combosAll, setCombosAll] = useState<Combo[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<number | null>(null);
  const [formIdx, setFormIdx] = useState(0);
  const [level, setLevel] = useState(50);
  const [plus, setPlus] = useState(0);
  const [treasure, setTreasure] = useState(2.5);
  const [talentLv, setTalentLv] = useState<number[]>([]);
  const [comboIds, setComboIds] = useState<number[]>([]);
  const [comboQuery, setComboQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    Promise.all(
      ["cats", "combos", "meta"].map((n) =>
        fetch(`/data/${n}.json`).then((r) => {
          if (!r.ok) throw new Error(n);
          return r.json();
        })
      )
    )
      .then(([c, co, m]) => {
        setCats(c);
        setCombosAll(co);
        setMeta(m);
      })
      .catch(() => setLoadError(true));
    // 検索履歴をlocalStorageから復元
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      if (Array.isArray(saved)) setHistory(saved.filter((x) => typeof x === "number").slice(0, 8));
    } catch {
      /* ignore */
    }
  }, []);

  const cat = useMemo(
    () => (cats && selId != null ? cats.find((c) => c.id === selId) ?? null : null),
    [cats, selId]
  );
  const form = cat?.forms[Math.min(formIdx, cat.forms.length - 1)] ?? null;

  const searchResults = useMemo(() => {
    if (!cats || !query.trim()) return [];
    const q = norm(query.trim());
    const out: { cat: Cat; matched: string }[] = [];
    for (const c of cats) {
      const hit = c.forms.find((f) => norm(f.name).includes(q));
      if (hit) out.push({ cat: c, matched: hit.name });
      if (out.length >= 40) break;
    }
    return out;
  }, [cats, query]);

  const selectCat = (c: Cat) => {
    setSelId(c.id);
    const lastIdx = c.forms.length - 1;
    setFormIdx(lastIdx);
    const maxBase = c.maxBase || 50;
    setLevel(defaultLevelForForm(lastIdx, maxBase));
    setPlus(0);
    setTalentLv(c.talents ? c.talents.map((t) => t.maxLv) : []);
    setQuery("");
    // 検索履歴を更新(先頭に追加・重複除去・最大8件)
    setHistory((prev) => {
      const next = [c.id, ...prev.filter((id) => id !== c.id)].slice(0, 8);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // 形態を切り替える。第4形態に切替時はLv60未満ならLv60へ引き上げる
  const selectForm = (idx: number) => {
    setFormIdx(idx);
    if (idx >= 3) setLevel((lv) => Math.max(lv, Math.min(60, maxBase)));
  };

  const selectedCombos = useMemo(
    () => (combosAll ? combosAll.filter((c) => comboIds.includes(c.id)) : []),
    [combosAll, comboIds]
  );

  // 検索履歴(localStorageのid配列)を実体に解決
  const historyCats = useMemo(() => {
    if (!cats) return [];
    return history
      .map((id) => cats.find((c) => c.id === id))
      .filter((c): c is Cat => !!c);
  }, [cats, history]);

  // 本能は第3形態(index 2)以降でのみ有効。第1・第2形態では本能なしで計算する
  const talentsActive = formIdx >= 2;
  const activeTalentLv = useMemo(
    () => (talentsActive ? talentLv : []),
    [talentsActive, talentLv]
  );

  const result = useMemo(() => {
    if (!cat || !form) return null;
    return calcStats(cat, form, {
      level,
      plus,
      treasure,
      talentLevels: activeTalentLv,
      combos: selectedCombos,
    });
  }, [cat, form, level, plus, treasure, activeTalentLv, selectedCombos]);

  // 本能・超本能による能力解放を反映した実効ステータス
  const resolved = useMemo(
    () => (form ? resolveTalents(form, cat?.talents ?? null, activeTalentLv) : null),
    [form, cat, activeTalentLv]
  );

  // ダメージ補正を加味した対象別の実質値
  const effective = useMemo(() => {
    if (!resolved || !result) return [];
    return effectiveRows(
      resolved,
      { atk: result.atk, hp: result.hp, dps: result.dps, atkHits: result.atkHits },
      treasure > 1 // お宝フル時は対属性お宝(超ダメ4倍等)も適用
    );
  }, [resolved, result, treasure]);

  const strengthen = resolved?.strengthen ?? null;
  const crit = resolved?.crit ?? null;
  const savage = resolved?.savage ?? null;
  const splash = useMemo(() => (form ? splashEffects(form) : []), [form]);
  // 波動・烈波・爆破は攻撃力倍率(rv)に期待値で加算され、その後に対象補正が乗る。
  // よって「splash込み総ダメージ = 通常実質ダメージ × splashMult」。
  const splashMult = useMemo(
    () => splash.reduce((m, s) => m + s.expectedMult, 1),
    [splash]
  );
  // splash込みの対象別総ダメージ(期待)。対象補正が無いキャラ(キャスリィ等)も
  // 「全般」1行で烈波込みの総ダメージを出す。
  const combinedRows = useMemo(() => {
    if (!result || splash.length === 0) return [];
    if (effective.length > 0) {
      return effective.map((r) => ({
        label: r.label,
        atk: Math.round(r.atk * splashMult),
        dps: Math.round(r.dps * splashMult),
      }));
    }
    return [
      {
        label: "全般(対象補正なし)",
        atk: Math.round(result.atk * splashMult),
        dps: Math.round(result.dps * splashMult),
      },
    ];
  }, [effective, result, splash, splashMult]);

  // 連続攻撃でヒットごとに射程が異なる場合の各ヒット射程帯
  const hitRanges = useMemo(() => (form ? activeHitRanges(form) : []), [form]);
  const variedRanges = form ? hasVariedRanges(form) : false;

  const unitName = (id: number, f: number) =>
    cats?.find((c) => c.id === id)?.forms[f]?.name ?? `No.${id + 1}`;

  const comboResults = useMemo(() => {
    if (!combosAll || !meta) return [];
    const q = norm(comboQuery.trim());
    const statFirst = [...combosAll].sort((a, b) => {
      const sa = comboHasStat(a) ? 0 : 1;
      const sb = comboHasStat(b) ? 0 : 1;
      return sa - sb || a.effects[0].effect - b.effects[0].effect;
    });
    return statFirst.filter((c) => {
      if (!q) return true;
      return (
        norm(c.name).includes(q) ||
        c.effects.some((e) => norm(meta.comboEffects[e.effect] ?? "").includes(q))
      );
    });
  }, [combosAll, meta, comboQuery]);

  if (loadError)
    return (
      <p className="p-8 text-center text-red-400">
        データの読み込みに失敗しました。再読み込みしてください。
      </p>
    );
  if (!cats || !combosAll || !meta)
    return <p className="p-8 text-center text-ink-dim animate-pulse">データ読み込み中…</p>;

  const maxBase = cat ? cat.maxBase || 60 : 60;
  const maxPlus = cat ? cat.maxPlus : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      {/* 検索 */}
      <div className="sticky top-0 z-20 -mx-4 bg-sunken/95 px-4 pb-2 pt-3 backdrop-blur">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キャラ名で検索 (例: ムート、かさじぞう)"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-brand"
        />
        {searchResults.length > 0 && (
          <ul className="absolute left-4 right-4 z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-line bg-surface shadow-2xl">
            {searchResults.map(({ cat: c, matched }) => (
              <li key={c.id}>
                <button
                  onClick={() => selectCat(c)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-surface-2"
                >
                  <UnitIcon id={c.id} className="h-8" />
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs text-white ${RARITY_COLORS[c.rarity]}`}
                  >
                    {meta.rarities[c.rarity]}
                  </span>
                  <span className="truncate">{matched}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-dim">No.{c.id + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!cat && (
        <div className="mt-10 text-center text-ink-dim">
          <img src="/icon/icon_nyanko.PNG" alt="" className="mx-auto h-24 w-auto" />
          <p className="mt-4">キャラ名を検索して選択してください</p>
          <p className="mt-2 text-sm text-ink-dim">
            レベル・本能・にゃんコンボ・ダメージ補正込みの実質ステータスを計算します
          </p>
          {historyCats.length > 0 && (
            <div className="mx-auto mt-8 max-w-md text-left">
              <p className="mb-2 text-xs text-ink-dim">最近見たキャラ</p>
              <div className="flex flex-wrap gap-1.5">
                {historyCats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectCat(c)}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm hover:border-brand"
                  >
                    <UnitIcon id={c.id} className="h-6" />
                    <span
                      className={`rounded px-1 py-0.5 text-[10px] text-white ${RARITY_COLORS[c.rarity]}`}
                    >
                      {meta.rarities[c.rarity]}
                    </span>
                    <span>{c.forms[c.forms.length - 1].name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {cat && form && result && (
        <div className="mt-4 space-y-4">
          {/* キャラヘッダ + 形態切替 */}
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-lg shadow-black/20">
            <div className="flex items-center gap-2.5">
              <UnitIcon id={cat.id} form={formIdx} className="h-11" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs text-white ${RARITY_COLORS[cat.rarity]}`}
                  >
                    {meta.rarities[cat.rarity]}
                  </span>
                  <span className="text-xs text-ink-dim">No.{cat.id + 1}</span>
                </div>
                <h2 className="mt-0.5 truncate text-lg font-bold">{form.name}</h2>
              </div>
            </div>
            {form.desc && <p className="mt-1 text-xs text-ink-dim">{form.desc}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cat.forms.map((f, i) => (
                <button
                  key={i}
                  onClick={() => selectForm(i)}
                  className={`flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2.5 text-sm ${
                    i === formIdx
                      ? "bg-brand font-bold text-bg"
                      : "bg-surface-2 text-ink hover:bg-surface-2"
                  }`}
                >
                  <UnitIcon id={cat.id} form={i} className="h-6" />
                  {["第1", "第2", "第3", "第4"][i]}形態
                </button>
              ))}
            </div>

            {/* レベル・お宝 */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="text-xs text-ink-dim">レベル (最大{maxBase})</span>
                <input
                  type="number"
                  min={1}
                  max={maxBase}
                  value={level}
                  onChange={(e) =>
                    setLevel(Math.max(1, Math.min(maxBase, Number(e.target.value) || 1)))
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-sunken px-3 py-2 text-center text-lg font-bold outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="text-xs text-ink-dim">＋値 (最大{maxPlus})</span>
                <input
                  type="number"
                  min={0}
                  max={maxPlus}
                  value={plus}
                  onChange={(e) =>
                    setPlus(Math.max(0, Math.min(maxPlus, Number(e.target.value) || 0)))
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-sunken px-3 py-2 text-center text-lg font-bold outline-none focus:border-brand"
                />
              </label>
              <div className="col-span-2">
                <span className="text-xs text-ink-dim">クイック設定 / 日本編お宝</span>
                <div className="mt-1 flex gap-1.5">
                  {[30, 50, ...(maxBase >= 60 ? [60] : [])].map((lv) => (
                    <button
                      key={lv}
                      onClick={() => setLevel(Math.min(lv, maxBase))}
                      className="rounded-lg bg-surface-2 px-2.5 py-2 text-sm hover:bg-surface-2"
                    >
                      Lv{lv}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setLevel(maxBase);
                      setPlus(maxPlus);
                    }}
                    className="rounded-lg bg-surface-2 px-2.5 py-2 text-sm hover:bg-surface-2"
                  >
                    MAX
                  </button>
                  <button
                    onClick={() => setTreasure(treasure === 2.5 ? 1 : 2.5)}
                    className={`ml-auto rounded-lg px-2.5 py-2 text-sm ${
                      treasure === 2.5
                        ? "bg-brand/20 text-brand"
                        : "bg-surface-2 text-ink-dim"
                    }`}
                  >
                    お宝{treasure === 2.5 ? "フル ×2.5" : "なし ×1.0"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 実質ステータス(ダメージ補正込み) — メイン表示 */}
          {(effective.length > 0 || strengthen || crit || savage || splash.length > 0) && (
            <section className="rounded-2xl border border-sky-500/40 bg-gradient-to-b from-sky-500/[0.07] to-transparent p-4 shadow-lg shadow-sky-500/10 ring-1 ring-inset ring-sky-500/10">
              <h3 className="text-base font-bold text-sky-400">
                実質ステータス
                <span className="ml-2 text-xs font-normal text-ink-dim">
                  対象への補正込み / Lv{level}
                  {plus > 0 && `+${plus}`}
                </span>
              </h3>
              {effective.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-ink-dim">
                        <th className="py-1 text-left font-normal">対象</th>
                        <th className="py-1 pl-4 text-right font-normal">実質攻撃力</th>
                        <th className="py-1 pl-4 text-right font-normal">実質DPS</th>
                        <th className="py-1 pl-4 text-right font-normal">実質体力</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {effective.map((r) => (
                        <tr key={r.label}>
                          <td className="py-1.5 pr-2">
                            {r.label}
                            <span className="ml-1 text-xs text-ink-dim">
                              {r.atkMult !== 1 && `攻×${r.atkMult}`}
                              {r.atkMult !== 1 && r.hpMult !== 1 && " "}
                              {r.hpMult !== 1 && `耐×${r.hpMult.toFixed(2).replace(/\.?0+$/, "")}`}
                            </span>
                          </td>
                          <td className="py-1.5 pl-4 text-right text-base font-bold tabular-nums text-sky-300">
                            {r.atk.toLocaleString()}
                          </td>
                          <td className="py-1.5 pl-4 text-right tabular-nums">
                            {r.dps.toLocaleString()}
                          </td>
                          <td className="py-1.5 pl-4 text-right text-base font-bold tabular-nums text-sky-300">
                            {r.hp.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 波動・烈波・爆破込みの総ダメージ(対象補正も乗せた期待値) */}
              {combinedRows.length > 0 && (
                <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
                  <p className="text-xs font-bold text-sky-300">
                    波動・烈波・爆破込み 総ダメージ(期待値)
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-dim">
                    含む効果:{" "}
                    {splash
                      .map((s) => `${s.kind}${s.detail ? `(${s.detail})` : ""} ${s.prob}%`)
                      .join(" / ")}
                  </p>
                  <table className="mt-2 w-full text-sm">
                    <thead>
                      <tr className="text-xs text-ink-dim">
                        <th className="py-1 text-left font-normal">対象</th>
                        <th className="py-1 pl-4 text-right font-normal">ダメージ</th>
                        <th className="py-1 pl-4 text-right font-normal">DPS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {combinedRows.map((r) => (
                        <tr key={r.label}>
                          <td className="py-1.5 pr-2 text-ink-dim">{r.label}</td>
                          <td className="py-1.5 pl-4 text-right text-base font-bold tabular-nums text-sky-200">
                            {r.atk.toLocaleString()}
                          </td>
                          <td className="py-1.5 pl-4 text-right text-base font-bold tabular-nums text-sky-200">
                            {r.dps.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1.5 text-[11px] text-ink-dim">
                    通常攻撃 + 波動/烈波/爆破の期待値(×{splashMult.toFixed(2)})に対象補正を掛けた総ダメージ。
                  </p>
                </div>
              )}

              {(strengthen || crit || savage) && result && (
                <ul className="mt-3 space-y-1.5 text-xs text-ink">
                  {strengthen && (
                    <li>
                      ・攻撃力上昇: 体力{strengthen.threshold}%以下で攻撃力 ×
                      {strengthen.mult.toFixed(2)}(発動時 攻撃力{" "}
                      <span className="font-bold text-brand">
                        {Math.round(result.atk * strengthen.mult).toLocaleString()}
                      </span>
                      )
                    </li>
                  )}
                  {crit && (
                    <li>
                      ・クリティカル: 発動率{crit.prob}% / 発動時 攻撃力{" "}
                      <span className="font-bold text-brand">
                        ×2 = {Math.round(result.atk * crit.hitMult).toLocaleString()}
                      </span>{" "}
                      / 期待DPS ×{crit.expectedMult.toFixed(2)}(
                      <span className="font-bold text-brand">
                        {Math.round(result.dps * crit.expectedMult).toLocaleString()}
                      </span>
                      )
                    </li>
                  )}
                  {savage && (
                    <li>
                      ・渾身の一撃: 発動率{savage.prob}% / 威力+{savage.add}% / 発動時 攻撃力{" "}
                      <span className="font-bold text-brand">
                        ×{savage.hitMult.toFixed(2)} ={" "}
                        {Math.round(result.atk * savage.hitMult).toLocaleString()}
                      </span>{" "}
                      / 期待DPS ×{savage.expectedMult.toFixed(2)}(
                      <span className="font-bold text-brand">
                        {Math.round(result.dps * savage.expectedMult).toLocaleString()}
                      </span>
                      )
                    </li>
                  )}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-ink-dim">
                ※ベース値=本能・コンボ込みの攻撃力/体力/DPS。対象に該当する敵にのみ補正が乗ります。
                {treasure > 1
                  ? "未来編お宝コンプ相当で、赤/浮/黒/天使/エイリアン/ゾンビ/メタルへの超ダメージは4倍に強化済み(古代/無属性/悪魔は対象外で3倍)。"
                  : "お宝なし設定のため対属性強化なし(超ダメージ3倍)。"}
                本能による倍率強化(超本能の超ダメ強化等)は未反映。
              </p>
            </section>
          )}

          {/* 連続攻撃の内訳(ヒットごとに射程が違う場合) */}
          {variedRanges && (
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-lg shadow-black/20">
              <h3 className="text-sm font-bold text-brand">
                連続攻撃の内訳
                <span className="ml-2 text-xs font-normal text-ink-dim">
                  攻撃ごとに射程が異なります
                </span>
              </h3>
              {effective.length > 0 ? (
                effective.map((r) => (
                  <div key={r.label} className="mt-3">
                    <p className="text-xs text-sky-400">
                      {r.label}
                      {r.atkMult !== 1 && ` 攻×${r.atkMult}`}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {r.atkHits.map((dmg, i) => (
                        <li
                          key={i}
                          className="flex items-baseline justify-between border-b border-line/60 pb-1 text-sm last:border-0"
                        >
                          <span className="text-ink-dim">
                            {["①", "②", "③", "④"][i]} 射程 {hitRanges[i] ?? "-"}
                          </span>
                          <span className="font-bold tabular-nums text-sky-300">
                            {dmg.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <ul className="mt-3 space-y-1">
                  {result.atkHits.map((dmg, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between border-b border-line/60 pb-1 text-sm last:border-0"
                    >
                      <span className="text-ink-dim">
                        {["①", "②", "③", "④"][i]} 射程 {hitRanges[i] ?? "-"}
                      </span>
                      <span className="font-bold tabular-nums">{dmg.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-ink-dim">
                ※敵との距離で当たるヒットが変わります。各行は本能・コンボ・対象補正込みの1ヒット分の実質ダメージです。
              </p>
            </section>
          )}

          {/* 基礎ステータス・詳細 */}
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-lg shadow-black/20">
            <h3 className="text-sm font-bold text-brand">
              基礎ステータス — Lv{level}
              {plus > 0 && `+${plus}`}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-sunken p-3">
                <p className="text-xs text-ink-dim">体力</p>
                <p className="text-2xl font-bold tabular-nums">{result.hp.toLocaleString()}</p>
                {(result.hpTalentPct > 0 || result.hpComboPct > 0) && (
                  <p className="text-xs text-sky-400">
                    基準 {result.hpBase.toLocaleString()}
                    {result.hpTalentPct > 0 && ` / 本能+${result.hpTalentPct}%`}
                    {result.hpComboPct > 0 && ` / コンボ+${result.hpComboPct}%`}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-sunken p-3">
                <p className="text-xs text-ink-dim">攻撃力 (合計)</p>
                <p className="text-2xl font-bold tabular-nums">{result.atk.toLocaleString()}</p>
                {result.atkHits.length > 1 && (
                  <p className="text-xs text-ink-dim">
                    {result.atkHits.map((a) => a.toLocaleString()).join(" + ")}
                  </p>
                )}
                {(result.atkTalentPct > 0 || result.atkComboPct > 0) && (
                  <p className="text-xs text-sky-400">
                    基準 {result.atkBase.toLocaleString()}
                    {result.atkTalentPct > 0 && ` / 本能+${result.atkTalentPct}%`}
                    {result.atkComboPct > 0 && ` / コンボ+${result.atkComboPct}%`}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-sunken p-3">
                <p className="text-xs text-ink-dim">DPS</p>
                <p className="text-2xl font-bold tabular-nums">
                  {Math.round(result.dps).toLocaleString()}
                </p>
                {result.freqIsEstimate && (
                  <p className="text-xs text-ink-dim">※攻撃頻度は近似値</p>
                )}
              </div>
              <div className="rounded-xl bg-sunken p-3">
                <p className="text-xs text-ink-dim">攻撃頻度</p>
                <p className="text-2xl font-bold tabular-nums">
                  {framesToSec(result.freq)}
                  <span className="text-sm font-normal text-ink-dim">
                    秒 ({result.freq}F)
                  </span>
                </p>
              </div>
            </div>

            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-line">
                {(
                  [
                    ["射程", String(result.range)],
                    ["攻撃タイプ", attackTypeText(form)],
                    ["攻撃発生", `${framesToSec(form.fore[0])}秒 (${form.fore[0]}F)`],
                    [
                      "再生産 (研究力MAX)",
                      `${framesToSec(result.cdResearch)}秒 (素: ${framesToSec(result.cd)}秒)`,
                    ],
                    ["コスト (2章基準)", `${result.cost.toLocaleString()}円`],
                    ["移動速度", String(result.speed)],
                    ["KB数", String(result.kb)],
                    ["レベル倍率", `×${result.levelMult.toFixed(2)} (お宝×${treasure})`],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1.5 pr-2 text-ink-dim">{k}</td>
                    <td className="py-1.5 text-right tabular-nums">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {targetTraits(form).length > 0 && (
              <p className="mt-2 text-xs text-ink">
                <span className="text-ink-dim">対象: </span>
                {targetTraits(form).join("・")}
              </p>
            )}
            {abilityTexts(form).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink">
                {abilityTexts(form).map((t) => (
                  <li key={t}>・{t}</li>
                ))}
              </ul>
            )}
          </section>

          {/* 本能(第3形態以降のみ) */}
          {cat.talents && talentsActive && (
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">本能</h3>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTalentLv(cat.talents!.map((t) => t.maxLv))}
                    className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs hover:bg-surface-2"
                  >
                    全てMAX
                  </button>
                  <button
                    onClick={() => setTalentLv(cat.talents!.map(() => 0))}
                    className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs hover:bg-surface-2"
                  >
                    全て0
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {cat.talents.map((t, i) => {
                  const lv = talentLv[i] ?? 0;
                  const v = talentValue(t, lv);
                  const vMax = talentValue(t, t.maxLv);
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2 text-sm">
                        {t.ultra && (
                          <span className="rounded bg-fuchsia-600 px-1 text-[10px]">超</span>
                        )}
                        <span>{talentLabel(t.abilityId, t.textId, meta)}</span>
                        <span className="ml-auto tabular-nums text-ink-dim">
                          Lv{lv}/{t.maxLv}
                          {vMax !== 0 && (
                            <span className={lv > 0 ? "ml-2 text-sky-400" : "ml-2"}>
                              {lv > 0 ? v : 0}
                              {[TALENT_HP_UP, TALENT_ATK_UP, TALENT_COST_DOWN].includes(
                                t.abilityId
                              )
                                ? "%"
                                : [TALENT_CD_DOWN, TALENT_INTERVAL_DOWN].includes(t.abilityId)
                                  ? "F"
                                  : ""}
                            </span>
                          )}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={t.maxLv}
                        value={lv}
                        onChange={(e) => {
                          const next = [...talentLv];
                          next[i] = Number(e.target.value);
                          setTalentLv(next);
                        }}
                        className="mt-1 w-full accent-brand"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* にゃんコンボ */}
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">にゃんコンボ</h3>
              {comboIds.length > 0 && (
                <button
                  onClick={() => setComboIds([])}
                  className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs hover:bg-surface-2"
                >
                  全て解除
                </button>
              )}
            </div>
            {selectedCombos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedCombos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setComboIds(comboIds.filter((id) => id !== c.id))}
                    className="rounded-full bg-brand/20 px-3 py-1 text-xs text-brand"
                  >
                    {c.name} ({comboEffectText(c, meta)}) ✕
                  </button>
                ))}
              </div>
            )}
            <input
              value={comboQuery}
              onChange={(e) => setComboQuery(e.target.value)}
              onFocus={() => setComboOpen(true)}
              placeholder="コンボ名・効果で検索 (例: 攻撃力アップ)"
              className="mt-2 w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {comboOpen && (
              <>
                <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                  {comboResults.slice(0, 60).map((c) => {
                    const active = comboIds.includes(c.id);
                    const statCombo = comboHasStat(c);
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() =>
                            setComboIds(
                              active
                                ? comboIds.filter((id) => id !== c.id)
                                : [...comboIds, c.id]
                            )
                          }
                          className={`w-full rounded-lg px-3 py-2 text-left text-xs ${
                            active
                              ? "bg-brand/15 ring-1 ring-brand/50"
                              : "bg-sunken hover:bg-surface-2"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="font-bold">{c.name}</span>
                            <span className={statCombo ? "text-sky-400" : "text-ink-dim"}>
                              {comboEffectText(c, meta)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-ink-dim">
                            {c.units.map(([id, f]) => unitName(id, f)).join(" / ")}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-ink-dim">
                  ※ステータスに反映されるのは「攻撃力/体力/移動速度アップ」系。その他のコンボは選択しても数値には反映されません。
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
