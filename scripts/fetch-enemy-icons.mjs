// 敵アイコンを battlecatsinfo から取得し WebP で public/icons/enemies/{id}.webp に保存。
// 敵id は enemies.json と同一(battlecatsinfo img/e/{id}/0.png)。冪等・404はスキップ。
// 使い方: node scripts/fetch-enemy-icons.mjs  [--force]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/icons/enemies");
const BASE = "https://battlecatsinfo.github.io/img/e";
const CONCURRENCY = 12;
const FORCE = process.argv.includes("--force");

const enemies = JSON.parse(
  fs.readFileSync(path.join(ROOT, "public/data/enemies.json"), "utf8")
);
fs.mkdirSync(OUT_DIR, { recursive: true });

async function fetchIcon(e) {
  const dest = path.join(OUT_DIR, `${e.id}.webp`);
  if (!FORCE && fs.existsSync(dest)) return "skip";
  let res;
  try {
    res = await fetch(`${BASE}/${e.id}/0.png`);
  } catch {
    return "miss";
  }
  if (!res.ok) return "miss";
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).webp({ quality: 86, effort: 6 }).toFile(dest);
  return "ok";
}

let ok = 0, skip = 0, miss = 0, done = 0;
const queue = [...enemies];
async function worker() {
  while (queue.length) {
    const e = queue.shift();
    const r = await fetchIcon(e);
    if (r === "ok") ok++;
    else if (r === "skip") skip++;
    else miss++;
    if (++done % 100 === 0) console.log(`...${done}/${enemies.length} (ok=${ok} skip=${skip} miss=${miss})`);
  }
}

console.log(`取得開始: ${enemies.length}体 → ${OUT_DIR}${FORCE ? " [force]" : ""}`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\n完了: 取得 ${ok} / スキップ ${skip} / 欠番 ${miss}`);
