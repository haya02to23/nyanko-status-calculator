"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cat, Combo, Meta } from "@/lib/types";
import {
  calcStats,
  framesToSec,
  talentValue,
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
import { abilityTexts, attackTypeText, targetTraits } from "@/lib/abilities";

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
  "bg-amber-500",
  "bg-rose-600",
];

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
    setFormIdx(c.forms.length - 1);
    const maxBase = c.maxBase || 50;
    setLevel(Math.min(50, maxBase));
    setPlus(0);
    setTalentLv(c.talents ? c.talents.map((t) => t.maxLv) : []);
    setQuery("");
  };

  const selectedCombos = useMemo(
    () => (combosAll ? combosAll.filter((c) => comboIds.includes(c.id)) : []),
    [combosAll, comboIds]
  );

  const result = useMemo(() => {
    if (!cat || !form) return null;
    return calcStats(cat, form, {
      level,
      plus,
      treasure,
      talentLevels: talentLv,
      combos: selectedCombos,
    });
  }, [cat, form, level, plus, treasure, talentLv, selectedCombos]);

  const unitName = (id: number, f: number) =>
    cats?.find((c) => c.id === id)?.forms[f]?.name ?? `No.${id + 1}`;

  const comboResults = useMemo(() => {
    if (!combosAll || !meta) return [];
    const q = norm(comboQuery.trim());
    const statFirst = [...combosAll].sort((a, b) => {
      const sa = [COMBO_ATK_UP, COMBO_HP_UP, COMBO_SPEED_UP].includes(a.effect) ? 0 : 1;
      const sb = [COMBO_ATK_UP, COMBO_HP_UP, COMBO_SPEED_UP].includes(b.effect) ? 0 : 1;
      return sa - sb || a.effect - b.effect || b.value - a.value;
    });
    return statFirst.filter((c) => {
      if (!q) return true;
      return (
        norm(c.name).includes(q) ||
        norm(meta.comboEffects[c.effect] ?? "").includes(q)
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
    return <p className="p-8 text-center text-stone-400 animate-pulse">データ読み込み中…</p>;

  const maxBase = cat ? cat.maxBase || 60 : 60;
  const maxPlus = cat ? cat.maxPlus : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      {/* 検索 */}
      <div className="sticky top-0 z-20 -mx-4 bg-stone-950/95 px-4 pb-2 pt-3 backdrop-blur">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キャラ名で検索 (例: ムート、かさじぞう)"
          className="w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3 text-base outline-none focus:border-amber-500"
        />
        {searchResults.length > 0 && (
          <ul className="absolute left-4 right-4 z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-stone-700 bg-stone-900 shadow-2xl">
            {searchResults.map(({ cat: c, matched }) => (
              <li key={c.id}>
                <button
                  onClick={() => selectCat(c)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-stone-800"
                >
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs text-white ${RARITY_COLORS[c.rarity]}`}
                  >
                    {meta.rarities[c.rarity]}
                  </span>
                  <span className="truncate">{matched}</span>
                  <span className="ml-auto shrink-0 text-xs text-stone-500">No.{c.id + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!cat && (
        <div className="mt-16 text-center text-stone-400">
          <p className="text-5xl">🐱</p>
          <p className="mt-4">キャラ名を検索して選択してください</p>
          <p className="mt-2 text-sm text-stone-500">
            レベル・本能・にゃんコンボを反映したステータスを自動計算します
          </p>
        </div>
      )}

      {cat && form && result && (
        <div className="mt-4 space-y-4">
          {/* キャラヘッダ + 形態切替 */}
          <section className="rounded-2xl border border-stone-800 bg-stone-900 p-4">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs text-white ${RARITY_COLORS[cat.rarity]}`}
              >
                {meta.rarities[cat.rarity]}
              </span>
              <h2 className="text-lg font-bold">{form.name}</h2>
              <span className="ml-auto text-xs text-stone-500">No.{cat.id + 1}</span>
            </div>
            {form.desc && <p className="mt-1 text-xs text-stone-400">{form.desc}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cat.forms.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setFormIdx(i)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    i === formIdx
                      ? "bg-amber-500 font-bold text-stone-950"
                      : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                  }`}
                >
                  {["第1", "第2", "第3", "第4"][i]}形態
                </button>
              ))}
            </div>

            {/* レベル・お宝 */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="text-xs text-stone-400">レベル (最大{maxBase})</span>
                <input
                  type="number"
                  min={1}
                  max={maxBase}
                  value={level}
                  onChange={(e) =>
                    setLevel(Math.max(1, Math.min(maxBase, Number(e.target.value) || 1)))
                  }
                  className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-center text-lg font-bold outline-none focus:border-amber-500"
                />
              </label>
              <label className="block">
                <span className="text-xs text-stone-400">＋値 (最大{maxPlus})</span>
                <input
                  type="number"
                  min={0}
                  max={maxPlus}
                  value={plus}
                  onChange={(e) =>
                    setPlus(Math.max(0, Math.min(maxPlus, Number(e.target.value) || 0)))
                  }
                  className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-center text-lg font-bold outline-none focus:border-amber-500"
                />
              </label>
              <div className="col-span-2">
                <span className="text-xs text-stone-400">クイック設定 / 日本編お宝</span>
                <div className="mt-1 flex gap-1.5">
                  {[30, 50].map((lv) => (
                    <button
                      key={lv}
                      onClick={() => setLevel(Math.min(lv, maxBase))}
                      className="rounded-lg bg-stone-800 px-2.5 py-2 text-sm hover:bg-stone-700"
                    >
                      Lv{lv}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setLevel(maxBase);
                      setPlus(maxPlus);
                    }}
                    className="rounded-lg bg-stone-800 px-2.5 py-2 text-sm hover:bg-stone-700"
                  >
                    MAX
                  </button>
                  <button
                    onClick={() => setTreasure(treasure === 2.5 ? 1 : 2.5)}
                    className={`ml-auto rounded-lg px-2.5 py-2 text-sm ${
                      treasure === 2.5
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-stone-800 text-stone-400"
                    }`}
                  >
                    お宝{treasure === 2.5 ? "フル ×2.5" : "なし ×1.0"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 計算結果 */}
          <section className="rounded-2xl border border-amber-500/30 bg-stone-900 p-4">
            <h3 className="text-sm font-bold text-amber-400">
              計算結果 — Lv{level}
              {plus > 0 && `+${plus}`}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-stone-950 p-3">
                <p className="text-xs text-stone-400">体力</p>
                <p className="text-2xl font-bold tabular-nums">{result.hp.toLocaleString()}</p>
                {(result.hpTalentPct > 0 || result.hpComboPct > 0) && (
                  <p className="text-xs text-emerald-400">
                    基準 {result.hpBase.toLocaleString()}
                    {result.hpTalentPct > 0 && ` / 本能+${result.hpTalentPct}%`}
                    {result.hpComboPct > 0 && ` / コンボ+${result.hpComboPct}%`}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-stone-950 p-3">
                <p className="text-xs text-stone-400">攻撃力 (合計)</p>
                <p className="text-2xl font-bold tabular-nums">{result.atk.toLocaleString()}</p>
                {result.atkHits.length > 1 && (
                  <p className="text-xs text-stone-400">
                    {result.atkHits.map((a) => a.toLocaleString()).join(" + ")}
                  </p>
                )}
                {(result.atkTalentPct > 0 || result.atkComboPct > 0) && (
                  <p className="text-xs text-emerald-400">
                    基準 {result.atkBase.toLocaleString()}
                    {result.atkTalentPct > 0 && ` / 本能+${result.atkTalentPct}%`}
                    {result.atkComboPct > 0 && ` / コンボ+${result.atkComboPct}%`}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-stone-950 p-3">
                <p className="text-xs text-stone-400">DPS</p>
                <p className="text-2xl font-bold tabular-nums">
                  {Math.round(result.dps).toLocaleString()}
                </p>
                {result.freqIsEstimate && (
                  <p className="text-xs text-stone-500">※攻撃頻度は近似値</p>
                )}
              </div>
              <div className="rounded-xl bg-stone-950 p-3">
                <p className="text-xs text-stone-400">攻撃頻度</p>
                <p className="text-2xl font-bold tabular-nums">
                  {framesToSec(result.freq)}
                  <span className="text-sm font-normal text-stone-400">
                    秒 ({result.freq}F)
                  </span>
                </p>
              </div>
            </div>

            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-stone-800">
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
                    <td className="py-1.5 pr-2 text-stone-400">{k}</td>
                    <td className="py-1.5 text-right tabular-nums">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {targetTraits(form).length > 0 && (
              <p className="mt-2 text-xs text-stone-300">
                <span className="text-stone-500">対象: </span>
                {targetTraits(form).join("・")}
              </p>
            )}
            {abilityTexts(form).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-stone-300">
                {abilityTexts(form).map((t) => (
                  <li key={t}>・{t}</li>
                ))}
              </ul>
            )}
          </section>

          {/* 本能 */}
          {cat.talents && (
            <section className="rounded-2xl border border-stone-800 bg-stone-900 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">本能</h3>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTalentLv(cat.talents!.map((t) => t.maxLv))}
                    className="rounded-lg bg-stone-800 px-2.5 py-1 text-xs hover:bg-stone-700"
                  >
                    全てMAX
                  </button>
                  <button
                    onClick={() => setTalentLv(cat.talents!.map(() => 0))}
                    className="rounded-lg bg-stone-800 px-2.5 py-1 text-xs hover:bg-stone-700"
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
                        <span className="ml-auto tabular-nums text-stone-400">
                          Lv{lv}/{t.maxLv}
                          {vMax !== 0 && (
                            <span className={lv > 0 ? "ml-2 text-emerald-400" : "ml-2"}>
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
                        className="mt-1 w-full accent-amber-500"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* にゃんコンボ */}
          <section className="rounded-2xl border border-stone-800 bg-stone-900 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">にゃんコンボ</h3>
              {comboIds.length > 0 && (
                <button
                  onClick={() => setComboIds([])}
                  className="rounded-lg bg-stone-800 px-2.5 py-1 text-xs hover:bg-stone-700"
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
                    className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-300"
                  >
                    {c.name} ({meta.comboEffects[c.effect]}
                    {meta.comboSizes[c.size]}) ✕
                  </button>
                ))}
              </div>
            )}
            <input
              value={comboQuery}
              onChange={(e) => setComboQuery(e.target.value)}
              onFocus={() => setComboOpen(true)}
              placeholder="コンボ名・効果で検索 (例: 攻撃力アップ)"
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
            />
            {comboOpen && (
              <>
                <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                  {comboResults.slice(0, 60).map((c) => {
                    const active = comboIds.includes(c.id);
                    const statCombo = [COMBO_ATK_UP, COMBO_HP_UP, COMBO_SPEED_UP].includes(
                      c.effect
                    );
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
                              ? "bg-amber-500/15 ring-1 ring-amber-500/50"
                              : "bg-stone-950 hover:bg-stone-800"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{c.name}</span>
                            <span className={statCombo ? "text-emerald-400" : "text-stone-400"}>
                              {meta.comboEffects[c.effect]}
                              {meta.comboSizes[c.size]}
                              {statCombo && ` +${c.value}%`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-stone-500">
                            {c.units.map(([id, f]) => unitName(id, f)).join(" / ")}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-stone-500">
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
