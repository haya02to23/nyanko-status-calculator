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
type MapData = { id: number; grp: number; name: string; stages: Stage[] };

// ひらがな→カタカナにして大文字小文字を無視した検索キー
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// 敵の詳細(ステータス + 属性 + 能力)。倍率を渡すと実値表示。
function EnemyDetail({
  e,
  hpMag,
  atkMag,
}: {
  e: Enemy;
  hpMag?: number;
  atkMag?: number;
}) {
  const realHp = hpMag != null ? Math.round(e.hp * (hpMag / 100)) : e.hp;
  const realAtk = atkMag != null ? Math.round(e.atk * (atkMag / 100)) : e.atk;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/50 py-1">
      <span className="shrink-0 text-xs text-ink-dim">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
  return (
    <div className="mt-1 rounded-lg bg-sunken p-3">
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <Row label="体力">
          <span className="text-base font-bold text-sky-300">{realHp.toLocaleString()}</span>
          {hpMag != null && hpMag !== 100 && (
            <span className="ml-1 text-[11px] text-ink-dim">
              ({e.hp.toLocaleString()}×{hpMag}%)
            </span>
          )}
        </Row>
        <Row label="攻撃力">
          <span className="text-base font-bold text-sky-300">{realAtk.toLocaleString()}</span>
          {atkMag != null && atkMag !== 100 && (
            <span className="ml-1 text-[11px] text-ink-dim">
              ({e.atk.toLocaleString()}×{atkMag}%)
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
  const [openMapId, setOpenMapId] = useState<number | null>(null);
  const [openStageIdx, setOpenStageIdx] = useState<number | null>(null);
  const [openEnemyKey, setOpenEnemyKey] = useState<string | null>(null);

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

  const mapResults = useMemo(() => {
    if (!maps) return [];
    const q = norm(query.trim());
    if (!q) return maps.slice(0, 60);
    const out: MapData[] = [];
    for (const m of maps) {
      if (norm(m.name).includes(q) || m.stages.some((s) => norm(s.name).includes(q))) {
        out.push(m);
      }
      if (out.length >= 80) break;
    }
    return out;
  }, [maps, query]);

  const enemyResults = useMemo(() => {
    if (!enemies) return [];
    const q = norm(query.trim());
    if (!q) return [];
    return [...enemies.values()]
      .filter((e) => e.name && norm(e.name).includes(q))
      .slice(0, 60);
  }, [enemies, query]);

  // ステージ内の敵を実HP込みで整形(実HP降順、同一敵+倍率はまとめ)
  const stageEnemyRows = (st: Stage) => {
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
          real: Math.round(e.hp * (hpMag / 100)),
          count: 1,
        });
    }
    return [...merged.values()].sort((a, b) => b.real - a.real);
  };

  const stageMaxHp = (st: Stage) => {
    if (!enemies) return 0;
    let mx = 0;
    for (const [eid, hpMag] of st.enemies) {
      const e = enemies.get(eid);
      if (e) mx = Math.max(mx, Math.round(e.hp * (hpMag / 100)));
    }
    return mx;
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
            {mapResults.map((m) => (
              <div key={m.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                <button
                  onClick={() => {
                    setOpenMapId(openMapId === m.id ? null : m.id);
                    setOpenStageIdx(null);
                    setOpenEnemyKey(null);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
                >
                  <span className="font-bold">{m.name}</span>
                  <span className="text-xs text-ink-dim">{m.stages.length}ステージ</span>
                  <span className="ml-auto text-ink-dim">{openMapId === m.id ? "▲" : "▼"}</span>
                </button>
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
                              {stageMaxHp(st).toLocaleString()}
                            </span>
                          </span>
                        </button>
                        {openStageIdx === st.idx && (
                          <div className="bg-sunken/60 px-3 py-2">
                            <p className="mb-1 text-[10px] text-ink-dim">
                              敵をタップで詳細。実HP=基礎HP×倍率（★無し基準）。城HP{" "}
                              {st.hp.toLocaleString()}。
                            </p>
                            <ul className="space-y-1">
                              {stageEnemyRows(st).map((r) => {
                                const key = `${st.idx}#${r.e.id}@${r.hpMag}@${r.atkMag}`;
                                const open = openEnemyKey === key;
                                return (
                                  <li key={key}>
                                    <button
                                      onClick={() => setOpenEnemyKey(open ? null : key)}
                                      className="flex w-full items-baseline gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-surface-2"
                                    >
                                      <span>
                                        {r.e.name}
                                        {r.count > 1 && (
                                          <span className="ml-1 text-xs text-ink-dim">
                                            ×{r.count}
                                          </span>
                                        )}
                                        {r.e.traits.length > 0 && (
                                          <span className="ml-1 text-[10px] text-ink-dim">
                                            [{r.e.traits.join("")}]
                                          </span>
                                        )}
                                      </span>
                                      <span className="ml-auto text-xs text-ink-dim">
                                        ×{r.hpMag}%
                                      </span>
                                      <span className="w-24 text-right text-base font-bold tabular-nums text-sky-300">
                                        {r.real.toLocaleString()}
                                      </span>
                                    </button>
                                    {open && (
                                      <EnemyDetail e={r.e} hpMag={r.hpMag} atkMag={r.atkMag} />
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
            ))}
            {query && mapResults.length === 0 && (
              <p className="py-8 text-center text-ink-dim">該当するステージがありません。</p>
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
                    className="flex w-full items-baseline gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
                  >
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
