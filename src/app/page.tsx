import Calculator from "@/components/Calculator";

export default function Home() {
  return (
    <main>
      <header className="mx-auto max-w-3xl px-4 pt-7 pb-1">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-lg ring-1 ring-brand/30"
          >
            🐾
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-ink">
              にゃんこステータス計算機
            </h1>
            <p className="text-[11px] text-ink-dim">
              レベル・本能・にゃんコンボ・ダメージ補正込みの実質ステータス
            </p>
          </div>
        </div>
      </header>
      <Calculator />
    </main>
  );
}
