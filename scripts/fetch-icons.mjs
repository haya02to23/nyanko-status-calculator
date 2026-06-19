// ユニットアイコンを battlecatsinfo から取得し WebP で public/icons/units/{id}.webp に保存する。
// 1キャラ1枚(最も進化した取得可能形態)。冪等(既存はスキップ)・404は欠番として無視。
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

// 各ユニットの候補形態: 最も進化した形態から降順(4形態目は穴あきなので無ければ落とす)
function candidateForms(cat) {
  const top = Math.min(cat.forms.length - 1, 3);
  const out = [];
  for (let f = top; f >= 0; f--) out.push(f);
  return out;
}

async function fetchIcon(cat) {
  const dest = path.join(OUT_DIR, `${cat.id}.webp`);
  if (!FORCE && fs.existsSync(dest)) return "skip";
  for (const f of candidateForms(cat)) {
    let res;
    try {
      res = await fetch(`${BASE}/${cat.id}/${f}.png`);
    } catch {
      continue;
    }
    if (!res.ok) continue; // 404=その形態は無い → 次の候補へ
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).webp({ quality: 86, effort: 6 }).toFile(dest);
    return "ok";
  }
  return "miss"; // 全形態404(欠番id)
}

let ok = 0, skip = 0, miss = 0, done = 0;
const queue = [...cats];
async function worker() {
  while (queue.length) {
    const cat = queue.shift();
    const r = await fetchIcon(cat);
    if (r === "ok") ok++;
    else if (r === "skip") skip++;
    else { miss++; if (miss <= 20) console.log(`  欠番: id ${cat.id}`); }
    done++;
    if (done % 100 === 0) console.log(`...${done}/${cats.length} (ok=${ok} skip=${skip} miss=${miss})`);
  }
}

console.log(`取得開始: ${cats.length}体 → ${OUT_DIR}${FORCE ? " [force]" : ""}`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\n完了: 取得 ${ok} / スキップ ${skip} / 欠番 ${miss}`);
