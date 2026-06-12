import Calculator from "@/components/Calculator";

export default function Home() {
  return (
    <main>
      <header className="mx-auto max-w-3xl px-4 pt-6">
        <h1 className="text-xl font-bold">
          にゃんこステータス計算機
          <span className="ml-2 text-xs font-normal text-stone-500">
            レベル・本能・にゃんコンボ対応
          </span>
        </h1>
      </header>
      <Calculator />
    </main>
  );
}
