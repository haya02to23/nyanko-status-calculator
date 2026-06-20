"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Enemy = {
  id: number;
  name: string;
  hp: number;
  atk: number;
  range: number;
  traits: string[];
};
type Stage = {
  idx: number;
  name: string;
  hp: number;
  enemies: [number, number][]; // [enemyId, hpMag%]
};
type MapData = { id: number; grp: number; name: string; stages: Stage[] };

// ひらがな→カタカナにして大文字小文字を無視した検索キー
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

export default function EnemyStages() {
  const [enemies, setEnemies] = useState<Map<number, Enemy> | null>(null);
  const [maps, setMaps] = useState<MapData[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState<"stage" | "enemy">("stage");
  const [query, setQuery] = useState("");
  const [openMapId, setOpenMapId] = useState<number | null>(null);
  const [openStageIdx, setOpenStageIdx] = useState<number | null>(null);

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

  // ステージ検索: マップ名 or ステージ名にマッチ
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

  // 敵検索: 名前マッチ
  const enemyResults = useMemo(() => {
    if (!enemies) return [];
    const q = norm(query.trim());
    const all = [...enemies.values()];
    if (!q) return [];
    return all.filter((e) => e.name && norm(e.name).includes(q)).slice(0, 60);
  }, [enemies, query]);

  const openMap = maps?.find((m) => m.id === openMapId) ?? null;

  // ステージ内の敵を実HP込みで整形(実HP降順=強い敵が上)
  const stageEnemyRows = (st: Stage) => {
    if (!enemies) return [];
    const rows = st.enemies.map(([eid, mag]) => {
      const e = enemies.get(eid);
      return {
        name: e?.name ?? `敵${eid}`,
        traits: e?.traits ?? [],
        base: e?.hp ?? 0,
        mag,
        real: Math.round((e?.hp ?? 0) * (mag / 100)),
      };
    });
    // 同一敵の重複をまとめる(名前+倍率が同じ → 体数表示)
    const merged = new Map<string, (typeof rows)[number] & { count: number }>();
    for (const r of rows) {
      const key = `${r.name}@${r.mag}`;
      const cur = merged.get(key);
      if (cur) cur.count++;
      else merged.set(key, { ...r, count: 1 });
    }
    return [...merged.values()].sort((a, b) => b.real - a.real);
  };

  const stageMaxHp = (st: Stage) => {
    if (!enemies) return 0;
    let mx = 0;
    for (const [eid, mag] of st.enemies) {
      const e = enemies.get(eid);
      if (e) mx = Math.max(mx, Math.round(e.hp * (mag / 100)));
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
          <p className="text-[11px] text-ink-dim">ステージに出る敵の倍率・実HPを確認</p>
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
                          onClick={() =>
                            setOpenStageIdx(openStageIdx === st.idx ? null : st.idx)
                          }
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
                          <div className="bg-sunken px-4 py-2">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-ink-dim">
                                  <th className="py-1 text-left font-normal">敵</th>
                                  <th className="py-1 pl-2 text-right font-normal">基礎HP</th>
                                  <th className="py-1 pl-2 text-right font-normal">倍率</th>
                                  <th className="py-1 pl-2 text-right font-normal">実HP</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {stageEnemyRows(st).map((r, i) => (
                                  <tr key={i}>
                                    <td className="py-1.5 pr-2">
                                      {r.name}
                                      {r.count > 1 && (
                                        <span className="ml-1 text-xs text-ink-dim">
                                          ×{r.count}
                                        </span>
                                      )}
                                      {r.traits.length > 0 && (
                                        <span className="ml-1 text-[10px] text-ink-dim">
                                          [{r.traits.join("")}]
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 pl-2 text-right tabular-nums text-ink-dim">
                                      {r.base.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 pl-2 text-right tabular-nums">
                                      {r.mag}%
                                    </td>
                                    <td className="py-1.5 pl-2 text-right text-base font-bold tabular-nums text-sky-300">
                                      {r.real.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="mt-1 text-[10px] text-ink-dim">
                              実HP = 基礎HP × 倍率（★無し基準）。城HP {st.hp.toLocaleString()}。
                            </p>
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
          <div className="mt-3 overflow-x-auto">
            {!query && (
              <p className="py-8 text-center text-ink-dim">敵の名前を入力してください。</p>
            )}
            {query && enemyResults.length === 0 && (
              <p className="py-8 text-center text-ink-dim">該当する敵がいません。</p>
            )}
            {enemyResults.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-dim">
                    <th className="py-1 text-left font-normal">敵</th>
                    <th className="py-1 pl-2 text-right font-normal">基礎HP</th>
                    <th className="py-1 pl-2 text-right font-normal">攻撃力</th>
                    <th className="py-1 pl-2 text-right font-normal">射程</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {enemyResults.map((e) => (
                    <tr key={e.id}>
                      <td className="py-1.5 pr-2">
                        {e.name}
                        {e.traits.length > 0 && (
                          <span className="ml-1 text-[10px] text-ink-dim">
                            [{e.traits.join("")}]
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pl-2 text-right text-base font-bold tabular-nums text-sky-300">
                        {e.hp.toLocaleString()}
                      </td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">
                        {e.atk.toLocaleString()}
                      </td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-ink-dim">
                        {e.range}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
