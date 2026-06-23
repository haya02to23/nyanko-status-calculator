"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Enemy = {
  id: number;
  name: string;
  hp: number;
  atk: number;
  range: number;
  speed: number;
  kb: number;
  money: number;
  rangeType: string;
  traits: string[];
  abilities: string[];
};
type Stage = {
  idx: number;
  name: string;
  hp: number;
  enemies: [number, number, number][]; // [enemyId, hpMag%, atkMag%]
};
type MapData = {
  id: number;
  grp: number;
  name: string;
  stages: Stage[];
  stars?: number[]; // 冠別倍率 [冠1=100,冠2,…]。空=冠なし
  colossus?: boolean; // 超生命体の敵が出る
  reward?: boolean; // クリア特典(レジェンドにゃんこ入手)のある章
};

// ひらがな→カタカナにして大文字小文字を無視した検索キー
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// ホームに出すカテゴリ。常設イベント(降臨/強襲等)とレジェンドストーリー(ゼロ→真→旧)。
// 期間限定コラボ(grp2/13)やストーリー等は出さず検索のみ。すべて新着順(id降順)。
// grpName(battlecatsinfo公式)準拠: grp0=旧レジェンド, 9=真レジェンド, 16=ゼロレジェンド,
// 11=強襲, 14=超獣討伐。降臨はgrpに無く名前で抽出。
type HomeCat = { key: string; label: string; grp?: number; filter?: (m: MapData) => boolean };
const isAdvent = (m: MapData) => /降臨/.test(m.name) && m.grp !== 2 && m.grp !== 13;
const HOME_CATEGORIES: HomeCat[] = [
  // 降臨はgame8/seesaawiki準拠で 通常/大降臨/狂乱/大狂乱 に分ける
  {
    key: "advent",
    label: "降臨ステージ",
    filter: (m) => isAdvent(m) && !/大降臨|狂乱/.test(m.name),
  },
  { key: "advent_big", label: "大降臨", filter: (m) => isAdvent(m) && /大降臨/.test(m.name) },
  {
    key: "crazed",
    label: "狂乱ステージ",
    filter: (m) => isAdvent(m) && /狂乱/.test(m.name) && !/大狂乱/.test(m.name),
  },
  { key: "manic", label: "大狂乱ステージ", filter: (m) => isAdvent(m) && /大狂乱/.test(m.name) },
  { key: "g11", label: "強襲ステージ", filter: (m) => m.grp === 11 && !m.colossus },
  { key: "colossus", label: "超生命体強襲", filter: (m) => m.grp === 11 && !!m.colossus && !m.name.includes("(旧)") },
  { key: "g14", label: "超獣討伐ステージ", grp: 14 },
  { key: "g12", label: "発掘ステージ", grp: 12 },
  { key: "g16", label: "ゼロレジェンド", grp: 16 },
  { key: "g9", label: "真レジェンド", grp: 9 },
  { key: "g0", label: "旧レジェンド", grp: 0 },
];

// レジェンド3種はゲーム準拠のテーマ色でヘッダーを色分け(識別性UP)。
// 色はカテゴリのchrome(枠/ヘッダー/左線)だけに使い、中身は共通トーンを保つ。
// それ以外のカテゴリは既存ブランド色。Tailwind JIT向けにクラスは静的文字列で持つ。
type Accent = { border: string; header: string; panel: string };
const BRAND_ACCENT: Accent = {
  border: "border-brand/50",
  header: "bg-brand text-bg",
  panel: "border-brand/50",
};
const CAT_ACCENT: Record<string, Accent> = {
  g16: { border: "border-sky-400/50", header: "bg-sky-400 text-bg", panel: "border-sky-400/50" }, // ゼロレジェ=水色
  g9: { border: "border-lime-400/50", header: "bg-lime-400 text-bg", panel: "border-lime-400/50" }, // 真レジェ=黄緑
  g0: { border: "border-amber-400/50", header: "bg-amber-400 text-bg", panel: "border-amber-400/50" }, // 旧レジェ=黄色
};
const accentOf = (key: string): Accent => CAT_ACCENT[key] ?? BRAND_ACCENT;

// 敵アイコン(public/icons/enemies/{id}.webp)。遅延読込・無ければ非表示。
function EnemyIcon({ id, className = "" }: { id: number; className?: string }) {
  return (
    <img
      src={`/icons/enemies/${id}.webp`}
      alt=""
      loading="lazy"
      width={104}
      height={79}
      className={`shrink-0 rounded bg-sunken object-contain ring-1 ring-line/60 ${className}`}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

// 敵の詳細(ステータス + 属性 + 能力)。倍率を渡すと実値表示。
function EnemyDetail({
  e,
  hpMag,
  atkMag,
  crownMult = 1,
  crownPct,
}: {
  e: Enemy;
  hpMag?: number;
  atkMag?: number;
  crownMult?: number; // 冠倍率(1=冠1基準)
  crownPct?: number; // 表示用の冠倍率%
}) {
  const realHp = hpMag != null ? Math.round(e.hp * (hpMag / 100) * crownMult) : e.hp;
  const realAtk = atkMag != null ? Math.round(e.atk * (atkMag / 100) * crownMult) : e.atk;
  const showCrown = crownPct != null && crownPct !== 100;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/50 py-1">
      <span className="shrink-0 text-xs text-ink-dim">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
  return (
    <div className="mt-1 rounded-lg bg-sunken p-3">
      <div className="mb-2 flex items-center gap-2">
        <img
          src={`/icons/enemies/${e.id}.webp`}
          alt=""
          loading="lazy"
          width={104}
          height={79}
          className="h-12 shrink-0 rounded bg-surface object-contain ring-1 ring-line/60"
          onError={(ev) => {
            ev.currentTarget.style.visibility = "hidden";
          }}
        />
        <span className="font-bold">{e.name}</span>
      </div>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <Row label="体力">
          <span className="text-base font-bold text-sky-300">{realHp.toLocaleString()}</span>
          {hpMag != null && (hpMag !== 100 || showCrown) && (
            <span className="ml-1 text-[11px] text-ink-dim">
              ({e.hp.toLocaleString()}×{hpMag}%{showCrown && `×冠${crownPct}%`})
            </span>
          )}
        </Row>
        <Row label="攻撃力">
          <span className="text-base font-bold text-sky-300">{realAtk.toLocaleString()}</span>
          {atkMag != null && (atkMag !== 100 || showCrown) && (
            <span className="ml-1 text-[11px] text-ink-dim">
              ({e.atk.toLocaleString()}×{atkMag}%{showCrown && `×冠${crownPct}%`})
            </span>
          )}
        </Row>
        <Row label="攻撃範囲">{e.rangeType}</Row>
        <Row label="射程">{e.range}</Row>
        <Row label="速度">{e.speed}</Row>
        <Row label="ノックバック">{e.kb}回</Row>
        <Row label="お金">{e.money.toLocaleString()}</Row>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-ink-dim">属性:</span>
        {e.traits.length > 0 ? (
          e.traits.map((t) => (
            <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              {t}
            </span>
          ))
        ) : (
          <span className="text-xs text-ink-dim">無属性</span>
        )}
      </div>
      {e.abilities.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-ink-dim">特殊能力:</span>
          {e.abilities.map((a) => (
            <span
              key={a}
              className="rounded bg-brand/15 px-1.5 py-0.5 text-xs text-brand"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EnemyStages() {
  const [enemies, setEnemies] = useState<Map<number, Enemy> | null>(null);
  const [maps, setMaps] = useState<MapData[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState<"stage" | "enemy">("stage");
  const [query, setQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>("advent"); // 既定で降臨展開
  const [openMapId, setOpenMapId] = useState<number | null>(null);
  const [openStageIdx, setOpenStageIdx] = useState<number | null>(null);
  const [openEnemyKey, setOpenEnemyKey] = useState<string | null>(null);
  const [crown, setCrown] = useState(0); // 選択中の冠(0=冠1)。マップ展開時のみ有効

  useEffect(() => {
    Promise.all([
      fetch("/data/enemies.json").then((r) => {
        if (!r.ok) throw new Error("enemies");
        return r.json();
      }),
      fetch("/data/stages.json").then((r) => {
        if (!r.ok) throw new Error("stages");
        return r.json();
      }),
    ])
      .then(([es, ms]: [Enemy[], MapData[]]) => {
        setEnemies(new Map(es.map((e) => [e.id, e])));
        setMaps(ms);
      })
      .catch(() => setLoadError(true));
  }, []);

  // 検索結果(マップ名 or ステージ名にマッチ)
  const mapResults = useMemo(() => {
    if (!maps) return [];
    const q = norm(query.trim());
    if (!q) return [];
    const out: MapData[] = [];
    for (const m of maps) {
      if (norm(m.name).includes(q) || m.stages.some((s) => norm(s.name).includes(q))) {
        out.push(m);
      }
      if (out.length >= 80) break;
    }
    return out;
  }, [maps, query]);

  // ホーム表示(検索なし)のカテゴリ。常設イベント+レジェンドストーリー、各新着順(id降順)。
  const categorized = useMemo(() => {
    if (!maps) return [];
    return HOME_CATEGORIES.map((c) => {
      const ms = maps
        .filter((m) => (c.grp != null ? m.grp === c.grp : c.filter!(m)))
        .sort((a, b) => b.id - a.id);
      return { key: c.key, label: c.label, maps: ms };
    }).filter((c) => c.maps.length > 0);
  }, [maps]);

  const enemyResults = useMemo(() => {
    if (!enemies) return [];
    const q = norm(query.trim());
    if (!q) return [];
    return [...enemies.values()]
      .filter((e) => e.name && norm(e.name).includes(q))
      .slice(0, 60);
  }, [enemies, query]);

  // ステージ内の敵を実HP込みで整形(実HP降順、同一敵+倍率はまとめ)。冠倍率も反映。
  const stageEnemyRows = (st: Stage, crownMult = 1) => {
    if (!enemies) return [];
    const merged = new Map<
      string,
      { e: Enemy; hpMag: number; atkMag: number; real: number; count: number }
    >();
    for (const [eid, hpMag, atkMag] of st.enemies) {
      const e = enemies.get(eid);
      if (!e) continue;
      const key = `${eid}@${hpMag}@${atkMag}`;
      const cur = merged.get(key);
      if (cur) cur.count++;
      else
        merged.set(key, {
          e,
          hpMag,
          atkMag,
          real: Math.round(e.hp * (hpMag / 100) * crownMult),
          count: 1,
        });
    }
    return [...merged.values()].sort((a, b) => b.real - a.real);
  };

  const stageMaxHp = (st: Stage, crownMult = 1) => {
    if (!enemies) return 0;
    let mx = 0;
    for (const [eid, hpMag] of st.enemies) {
      const e = enemies.get(eid);
      if (e) mx = Math.max(mx, Math.round(e.hp * (hpMag / 100) * crownMult));
    }
    return mx;
  };

  // マップで選択中の冠の倍率。stars=[冠1,冠2,…]。選択冠が無ければクランプ。
  const crownInfo = (m: MapData) => {
    const stars = m.stars && m.stars.length > 0 ? m.stars : [100];
    const idx = Math.min(crown, stars.length - 1);
    return { stars, idx, pct: stars[idx], mult: stars[idx] / 100 };
  };

  // 1マップ分(展開でステージ→敵)。検索結果とカテゴリ両方で再利用。
  const renderMap = (m: MapData) => {
    const ci = crownInfo(m);
    const hasCrowns = ci.stars.length > 1; // 冠2以上が存在する=冠選択あり
    return (
    <div
      key={m.id}
      className={`overflow-hidden rounded-xl border bg-surface ${
        m.reward ? "border-amber-400/60 ring-1 ring-amber-400/30" : "border-line"
      }`}
    >
      <button
        onClick={() => {
          setOpenMapId(openMapId === m.id ? null : m.id);
          setOpenStageIdx(null);
          setOpenEnemyKey(null);
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
      >
        <span className={`font-bold ${m.reward ? "text-amber-300" : ""}`}>{m.name}</span>
        {m.reward && (
          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-300">
            🎁 クリア特典
          </span>
        )}
        <span className="text-xs text-ink-dim">{m.stages.length}ステージ</span>
        <span className="ml-auto text-ink-dim">{openMapId === m.id ? "▲" : "▼"}</span>
      </button>
      {openMapId === m.id && hasCrowns && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-sunken/40 px-4 py-2">
          <span className="mr-1 text-xs text-ink-dim">難易度</span>
          {ci.stars.map((pct, i) => (
            <button
              key={i}
              onClick={() => setCrown(i)}
              className={`rounded-md px-2 py-1 text-xs tabular-nums ${
                ci.idx === i
                  ? "bg-brand font-bold text-bg"
                  : "bg-surface-2 text-ink hover:bg-surface"
              }`}
            >
              {"👑".repeat(i + 1)}
              <span className="ml-1 opacity-80">{pct}%</span>
            </button>
          ))}
        </div>
      )}
      {openMapId === m.id && (
        <ul className="border-t border-line">
          {m.stages.map((st) => (
            <li key={st.idx} className="border-b border-line/60 last:border-0">
              <button
                onClick={() => {
                  setOpenStageIdx(openStageIdx === st.idx ? null : st.idx);
                  setOpenEnemyKey(null);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span>{st.name}</span>
                <span className="ml-auto text-xs text-ink-dim">
                  最大HP{" "}
                  <span className="font-bold text-sky-300">
                    {stageMaxHp(st, ci.mult).toLocaleString()}
                  </span>
                </span>
              </button>
              {openStageIdx === st.idx && (
                <div className="bg-sunken/60 px-3 py-2">
                  <p className="mb-1 text-[10px] text-ink-dim">
                    敵をタップで詳細。実HP=基礎HP×倍率
                    {hasCrowns ? `×冠${ci.pct}%` : "（★無し基準）"}。城HP{" "}
                    {st.hp.toLocaleString()}。
                  </p>
                  <ul className="space-y-1">
                    {stageEnemyRows(st, ci.mult).map((r) => {
                      const key = `${m.id}#${st.idx}#${r.e.id}@${r.hpMag}@${r.atkMag}`;
                      const open = openEnemyKey === key;
                      return (
                        <li key={key}>
                          <button
                            onClick={() => setOpenEnemyKey(open ? null : key)}
                            className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-surface-2"
                          >
                            <EnemyIcon id={r.e.id} className="h-7" />
                            <span>
                              {r.e.name}
                              {r.count > 1 && (
                                <span className="ml-1 text-xs text-ink-dim">×{r.count}</span>
                              )}
                              {r.e.traits.length > 0 && (
                                <span className="ml-1 text-[10px] text-ink-dim">
                                  [{r.e.traits.join("")}]
                                </span>
                              )}
                            </span>
                            <span className="ml-auto text-xs text-ink-dim">×{r.hpMag}%</span>
                            <span className="w-24 text-right text-base font-bold tabular-nums text-sky-300">
                              {r.real.toLocaleString()}
                            </span>
                          </button>
                          {open && (
                            <EnemyDetail
                              e={r.e}
                              hpMag={r.hpMag}
                              atkMag={r.atkMag}
                              crownMult={ci.mult}
                              crownPct={ci.pct}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
    );
  };

  const header = (
    <header className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 pt-7 pb-2">
      <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
        <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl">
          <img src="/icon/icon_ver2.PNG" alt="" width={36} height={36} className="object-cover" />
        </span>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">敵・ステージ図鑑</h1>
          <p className="text-[11px] text-ink-dim">ステージに出る敵の倍率・実HP・能力を確認</p>
        </div>
      </Link>
      <Link
        href="/"
        className="ml-auto rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
      >
        ← 計算機
      </Link>
    </header>
  );

  if (loadError)
    return (
      <>
        {header}
        <p className="p-8 text-center text-red-400">データの読み込みに失敗しました。</p>
      </>
    );
  if (!enemies || !maps)
    return (
      <>
        {header}
        <p className="p-8 text-center text-ink-dim animate-pulse">データ読み込み中…</p>
      </>
    );

  return (
    <>
      {header}
      <div className="mx-auto max-w-3xl px-4 pb-24">
        {/* タブ */}
        <div className="mb-2 flex gap-1.5">
          {(["stage", "enemy"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setOpenMapId(null);
                setOpenStageIdx(null);
                setOpenEnemyKey(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === t ? "bg-brand font-bold text-bg" : "bg-surface-2 text-ink"
              }`}
            >
              {t === "stage" ? "ステージから探す" : "敵から探す"}
            </button>
          ))}
        </div>

        {/* 検索 */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            tab === "stage"
              ? "マップ・ステージ名で検索 (例: 日本編、未来編)"
              : "敵の名前で検索 (例: カバちゃん、ブラックマ)"
          }
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-brand"
        />

        {/* ステージタブ */}
        {tab === "stage" && (
          <div className="mt-3 space-y-1.5">
            {query ? (
              <>
                {mapResults.map(renderMap)}
                {mapResults.length === 0 && (
                  <p className="py-8 text-center text-ink-dim">
                    該当するステージがありません。
                  </p>
                )}
              </>
            ) : (
              <>
                <a
                  href="https://battlecats.club/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-brand hover:bg-brand/10"
                >
                  <span className="font-bold">📅 今のイベント開催スケジュール</span>
                  <span className="ml-auto text-xs">外部サイトで見る →</span>
                </a>
                {categorized.map((cat) => {
                  const open = openCategory === cat.key;
                  const ac = accentOf(cat.key);
                  return (
                  <div
                    key={cat.key}
                    className={`overflow-hidden rounded-xl border ${
                      open ? `${ac.border} bg-sunken` : "border-line bg-surface"
                    }`}
                  >
                    <button
                      onClick={() => {
                        setOpenCategory(open ? null : cat.key);
                        setOpenMapId(null);
                        setOpenStageIdx(null);
                      }}
                      className={`flex w-full items-center gap-2 px-4 py-3 text-left ${
                        open
                          ? `sticky top-0 z-10 ${ac.header}`
                          : "hover:bg-surface-2"
                      }`}
                    >
                      <span className="font-bold">{cat.label}</span>
                      <span className={`text-xs ${open ? "text-bg/70" : "text-ink-dim"}`}>
                        {cat.maps.length}マップ
                      </span>
                      <span className={`ml-auto ${open ? "text-bg/80" : "text-ink-dim"}`}>
                        {open ? "▲" : "▼"}
                      </span>
                    </button>
                    {open && (
                      <div className={`space-y-1.5 border-l-2 ${ac.panel} bg-sunken/40 p-2 pl-2.5`}>
                        {cat.maps.map(renderMap)}
                      </div>
                    )}
                  </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* 敵タブ */}
        {tab === "enemy" && (
          <div className="mt-3 space-y-1.5">
            {!query && (
              <p className="py-8 text-center text-ink-dim">敵の名前を入力してください。</p>
            )}
            {query && enemyResults.length === 0 && (
              <p className="py-8 text-center text-ink-dim">該当する敵がいません。</p>
            )}
            {enemyResults.map((e) => {
              const open = openEnemyKey === `e${e.id}`;
              return (
                <div key={e.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                  <button
                    onClick={() => setOpenEnemyKey(open ? null : `e${e.id}`)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
                  >
                    <EnemyIcon id={e.id} className="h-8" />
                    <span className="font-bold">{e.name}</span>
                    {e.traits.length > 0 && (
                      <span className="text-[10px] text-ink-dim">[{e.traits.join("")}]</span>
                    )}
                    <span className="ml-auto text-xs text-ink-dim">
                      HP{" "}
                      <span className="font-bold text-sky-300">{e.hp.toLocaleString()}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3">
                      <EnemyDetail e={e} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
