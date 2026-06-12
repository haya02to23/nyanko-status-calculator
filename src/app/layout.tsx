import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "にゃんこステータス計算機",
  description:
    "にゃんこ大戦争のキャラステータス計算ツール。レベル・本能・にゃんコンボを反映した体力・攻撃力・DPSを自動計算",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-stone-950 text-stone-100">{children}</body>
    </html>
  );
}
