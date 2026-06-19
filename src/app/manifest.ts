import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "にゃんこステータス計算機",
    short_name: "にゃんこ計算機",
    description:
      "にゃんこ大戦争のキャラステータス計算ツール。レベル・本能・にゃんコンボを反映した体力・攻撃力・DPSを自動計算",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0c11",
    theme_color: "#0c0c11",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
