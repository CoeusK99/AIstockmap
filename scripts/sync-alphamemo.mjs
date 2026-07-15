#!/usr/bin/env node
// =============================================================================
// AlphaMemo 免費逐字稿索引同步
// -----------------------------------------------------------------------------
// 抓 https://www.alphamemo.ai/free-transcripts 索引頁,解析每篇逐字稿的
// 連結(/free-transcripts/<uuid>)與標題,用地圖上的公司名稱/股號自動配對,
// 寫入 public/transcripts.json。個股面板讀這個檔直接列出逐字稿。
//
// 只儲存「標題、日期、連結」等中繼資料,不抓取逐字稿內文(尊重原站版權)。
//
// 執行:npm run sync:transcripts
// 注意:AlphaMemo 的連結是不透明 UUID,無法從股號推導,所以必須解析索引頁。
//       頁面若為前端渲染(HTML 內沒有連結),純 fetch 會抓不到 — 腳本會
//       同時掃描錨點與內嵌 JSON(Next.js 資料流)兩種形態並回報結果。
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "transcripts.json");
const INDEX_URL = "https://www.alphamemo.ai/free-transcripts";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// --- 地圖上的台股(id + 名稱),供標題配對 ------------------------------------
const dataJs = readFileSync(path.join(ROOT, "public", "data.js"), "utf8");
const companies = [...dataJs.matchAll(/id:\s*"(\d{4})",\s*name:\s*"([^"]+)"/g)].map((m) => ({
  code: m[1],
  name: m[2].replace(/-KY$/, ""), // 標題常省略 -KY 後綴
}));

const decode = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const findDate = (s) => {
  const m = String(s).match(/(20\d{2})[年.\/-]\s?(\d{1,2})[月.\/-]\s?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const q = String(s).match(/20\d{2}\s?Q[1-4]/i);
  return q ? q[0].replace(/\s/g, "") : "";
};

async function main() {
  console.log(`抓取索引頁 ${INDEX_URL} …`);
  const res = await fetch(INDEX_URL, {
    signal: AbortSignal.timeout(30000),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AIstockmap-sync/1.0; +https://github.com/CoeusK99/AIstockmap)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  console.log(`頁面大小 ${(html.length / 1024).toFixed(0)} KB`);

  const found = new Map(); // uuid -> { title, context }

  // 策略 1:HTML 錨點 <a href="/free-transcripts/<uuid>">標題…</a>
  for (const m of html.matchAll(
    new RegExp(`<a[^>]+href="(?:https?://[^"/]+)?/free-transcripts/(${UUID})[^"]*"[^>]*>([\\s\\S]{0,600}?)</a>`, "gi")
  )) {
    const title = decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (title) found.set(m[1], { title, context: title });
  }
  console.log(`策略 1(錨點掃描):${found.size} 筆`);

  // 策略 2:內嵌 JSON(Next.js 資料流)— 找同一個物件裡的 uuid 與 title/name
  const before = found.size;
  const objRe = new RegExp(
    `\\{[^{}]{0,800}?"(?:id|uuid|slug|transcriptId)"\\s*:\\s*"(${UUID})"[^{}]{0,800}?"(?:title|name|subject|company)"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,300})"[^{}]{0,800}?\\}`,
    "gi"
  );
  const objReRev = new RegExp(
    `\\{[^{}]{0,800}?"(?:title|name|subject|company)"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,300})"[^{}]{0,800}?"(?:id|uuid|slug|transcriptId)"\\s*:\\s*"(${UUID})"[^{}]{0,800}?\\}`,
    "gi"
  );
  // Next.js 串流會把 JSON 塞在字串裡(引號跳脫成 \"),掃原文與去跳脫兩種版本
  for (const source of [html, html.replace(/\\"/g, '"')]) {
    for (const m of source.matchAll(objRe)) {
      if (!found.has(m[1])) found.set(m[1], { title: decode(m[2]), context: decode(m[0]) });
    }
    for (const m of source.matchAll(objReRev)) {
      if (!found.has(m[2])) found.set(m[2], { title: decode(m[1]), context: decode(m[0]) });
    }
  }
  console.log(`策略 2(內嵌 JSON):+${found.size - before} 筆`);

  if (found.size === 0) {
    console.error(
      "找不到任何逐字稿連結 — 頁面可能是純前端渲染或改版了。\n" +
      "可將索引頁另存 HTML 後執行:node scripts/sync-alphamemo.mjs <saved.html>"
    );
    process.exitCode = 1;
    return;
  }

  // --- 配對公司:標題含公司名或 (股號) ----------------------------------------
  const byCode = {};
  const unmatched = [];
  for (const [uuid, { title, context }] of found) {
    const hay = `${title} ${context}`;
    let code = "";
    const codeM = hay.match(/[(（【\s](\d{4})[)）】\s]/);
    if (codeM && companies.some((c) => c.code === codeM[1])) code = codeM[1];
    if (!code) {
      const hit = companies.find((c) => hay.includes(c.name));
      if (hit) code = hit.code;
    }
    const item = {
      date: findDate(hay),
      title: title.slice(0, 120),
      url: `https://www.alphamemo.ai/free-transcripts/${uuid}`,
    };
    if (code) (byCode[code] ||= []).push(item);
    else unmatched.push(item);
  }

  // --- 併入既有索引(保留手動加入的項目,以 url 去重)--------------------------
  let existing = { transcripts: {} };
  if (existsSync(OUT)) {
    try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch { /* 壞檔就重建 */ }
  }
  const merged = existing.transcripts || {};
  for (const [code, items] of Object.entries(byCode)) {
    const list = merged[code] || [];
    const known = new Set(list.map((t) => t.url));
    for (const it of items) if (!known.has(it.url)) list.push(it);
    list.sort((a, b) => (a.date < b.date ? 1 : -1));
    merged[code] = list;
  }

  const out = {
    updated: new Date().toISOString().slice(0, 10),
    source: INDEX_URL,
    note: "僅索引標題/日期/連結,內容屬 AlphaMemo 所有;連結開啟原站頁面。",
    transcripts: merged,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  const total = Object.values(merged).reduce((n, l) => n + l.length, 0);
  console.log(`\n完成:${Object.keys(merged).length} 檔個股、共 ${total} 篇逐字稿 → public/transcripts.json`);
  if (unmatched.length) {
    console.log(`未能配對到地圖個股的 ${unmatched.length} 篇(非地圖成分股或標題無法辨識):`);
    unmatched.slice(0, 15).forEach((u) => console.log(`  - ${u.title}`));
  }
}

// 支援離線模式:node scripts/sync-alphamemo.mjs saved.html(用另存的 HTML 解析)
if (process.argv[2]) {
  const html = readFileSync(process.argv[2], "utf8");
  globalThis.fetch = async () => new Response(html, { status: 200 });
}

main().catch((err) => {
  console.error("同步失敗:", err.message);
  process.exitCode = 1;
});
