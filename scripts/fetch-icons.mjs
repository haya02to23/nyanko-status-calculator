// ユニットアイコンを battlecatsinfo から取得し WebP で public/icons/units/ に保存する。
//   {id}.webp       … 代表(最進化の取得可能形態)。検索結果/履歴/カードの既定
//   {id}-{form}.webp … 各形態(0..3)。形態切替で選択中の形態を表示。4形態目は穴あき有り
// 冪等(既存はスキップ)・404はその形態無しとして無視。
// 使い方: node scripts/fetch-icons.mjs  [--force]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public/icons/units");
const BASE = "https://battlecatsinfo.github.io/img/u";
const CONCURRENCY = 12;
const FORCE = process.argv.includes("--force");

const cats = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/cats.json"), "utf8"));
fs.mkdirSync(OUT_DIR, { recursive: true });

const toWebp = (buf) => sharp(buf).webp({ quality: 86, effort: 6 });

async function fetchUnit(cat) {
  const repDest = path.join(OUT_DIR, `${cat.id}.webp`);
  const topForm = Math.min(cat.forms.length - 1, 3);
  // 既に全形態+代表が揃っていればスキップ(冪等)
  if (!FORCE) {
    let allThere = fs.existsSync(repDest);
    for (let f = 0; f <= topForm && allThere; f++) {
      // 4形態目は存在しない場合があるので、無くてもスキップ判定には含めない
      if (f < 3 && !fs.existsSync(path.join(OUT_DIR, `${cat.id}-${f}.webp`))) allThere = false;
    }
    if (allThere) return "skip";
  }
  let lastBuf = null;
  let got = 0;
  for (let f = 0; f <= topForm; f++) {
    let res;
    try {
      res = await fetch(`${BASE}/${cat.id}/${f}.png`);
    } catch {
      continue;
    }
    if (!res.ok) continue; // 404=その形態は無い
    const buf = Buffer.from(await res.arrayBuffer());
    await toWebp(buf).toFile(path.join(OUT_DIR, `${cat.id}-${f}.webp`));
    lastBuf = buf;
    got++;
  }
  if (!lastBuf) return "miss"; // 全形態404(欠番id)
  await toWebp(lastBuf).toFile(repDest); // 代表 = 最進化の取得できた形態
  return "ok";
}

let ok = 0, skip = 0, miss = 0, done = 0;
const queue = [...cats];
async function worker() {
  while (queue.length) {
    const cat = queue.shift();
    const r = await fetchUnit(cat);
    if (r === "ok") ok++;
    else if (r === "skip") skip++;
    else { miss++; if (miss <= 20) console.log(`  欠番: id ${cat.id}`); }
    done++;
    if (done % 100 === 0) console.log(`...${done}/${cats.length} (ok=${ok} skip=${skip} miss=${miss})`);
  }
}

console.log(`取得開始: ${cats.length}体(全形態) → ${OUT_DIR}${FORCE ? " [force]" : ""}`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\n完了: 取得 ${ok} / スキップ ${skip} / 欠番 ${miss}`);
