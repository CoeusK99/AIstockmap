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

// --- 地圖上的節點(台股代號 + 海外代碼 + 名稱),供配對 ------------------------
const dataJs = readFileSync(path.join(ROOT, "public", "data.js"), "utf8");
const companies = [...dataJs.matchAll(/id:\s*"([A-Z0-9]{1,5})",\s*name:\s*"([^"]+)"/g)].map((m) => ({
  code: m[1],
  name: m[2].replace(/-KY$/, ""), // 標題常省略 -KY 後綴
}));
const idSet = new Set(companies.map((c) => c.code));

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

// CLI:--from <file> 用另存的 HTML 離線解析;--dump <file> 把抓到的 HTML 存檔(診斷用)
const args = process.argv.slice(2);
const argVal = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : "");
const FROM = argVal("--from") || (args[0] && !args[0].startsWith("--") ? args[0] : "");
const DUMP = argVal("--dump");

async function main() {
  let html;
  if (FROM) {
    console.log(`離線解析 ${FROM} …`);
    html = readFileSync(FROM, "utf8");
  } else {
    console.log(`抓取索引頁 ${INDEX_URL} …`);
    const res = await fetch(INDEX_URL, {
      signal: AbortSignal.timeout(30000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AIstockmap-sync/1.0; +https://github.com/CoeusK99/AIstockmap)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  }
  console.log(`頁面大小 ${(html.length / 1024).toFixed(0)} KB`);
  if (DUMP) {
    writeFileSync(DUMP, html);
    console.log(`已將頁面存至 ${DUMP}`);
  }

  const found = new Map(); // uuid -> { title, context, code?, date? }

  // 策略 0(精準):AlphaMemo 把逐字稿清單放在 Next.js 資料串流的結構化 JSON 裡
  //   {"id":"<uuid>","stock_name":"大立光","stock_number":"3008",
  //    "audio_date":"2026-07-09","market":"TW","fiscal_year":2026,"fiscal_quarter":2}
  //   引號在串流中被跳脫成 \",先還原再逐物件抽欄位(容忍欄位順序變動)。
  const unescaped = html.replace(/\\"/g, '"');
  for (const m of unescaped.matchAll(/\{[^{}]*?"stock_number"[^{}]*?\}/g)) {
    const chunk = m[0];
    const uuid = (chunk.match(new RegExp(`"id"\\s*:\\s*"(${UUID})"`)) || [])[1];
    if (!uuid) continue;
    const get = (k) => decode((chunk.match(new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`)) || [])[1] || "");
    const getNum = (k) => (chunk.match(new RegExp(`"${k}"\\s*:\\s*(\\d+)`)) || [])[1] || "";
    const name = get("stock_name");
    const code = get("stock_number");
    const fy = getNum("fiscal_year");
    const fq = getNum("fiscal_quarter");
    found.set(uuid, {
      title: `${name}${fy && fq ? ` ${fy}Q${fq}` : ""} 法說會逐字稿`,
      context: chunk,
      code: idSet.has(code) ? code : "",
      date: get("audio_date"),
    });
  }
  console.log(`策略 0(結構化 JSON):${found.size} 筆`);

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

  // --- 配對公司:優先用結構化的 stock_number,退而求其次比對標題 ----------------
  const byCode = {};
  const unmatched = [];
  for (const [uuid, entry] of found) {
    const { title, context } = entry;
    const hay = `${title} ${context}`;
    let code = entry.code || "";
    if (!code) {
      const codeM = hay.match(/[(（【\s](\d{4})[)）】\s]/);
      if (codeM && idSet.has(codeM[1])) code = codeM[1];
    }
    if (!code) {
      const hit = companies.find((c) => hay.includes(c.name));
      if (hit) code = hit.code;
    }
    const item = {
      date: entry.date || findDate(hay),
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

main().catch((err) => {
  console.error("同步失敗:", err.message);
  process.exitCode = 1;
});
