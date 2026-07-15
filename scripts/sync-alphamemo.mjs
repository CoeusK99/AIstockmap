#!/usr/bin/env node
// =============================================================================
// AlphaMemo 免費逐字稿索引同步
// -----------------------------------------------------------------------------
// 抓 https://www.alphamemo.ai/free-transcripts 索引頁(含自動翻頁),解析每篇
// 逐字稿的連結(/free-transcripts/<uuid>)與公司資訊,以 stock_number 精準
// 配對地圖個股,寫入 public/transcripts.json。個股面板讀這個檔列出逐字稿。
//
// 只儲存「標題、日期、連結」等中繼資料,不抓取逐字稿內文(尊重原站版權)。
//
// 執行:npm run sync:transcripts
// 選項:--from <file>  用另存的 HTML 離線解析(單頁,不翻頁)
//       --dump <file>  把第一頁 HTML 存檔(診斷用)
//
// 資料形態(藏在 Next.js 資料串流、引號跳脫成 \" 的 JSON):
//   {"id":"<uuid>","stock_name":"大立光","stock_number":"3008",
//    "audio_date":"2026-07-09","market":"TW","fiscal_year":2026,"fiscal_quarter":3}
// AlphaMemo 網址是不透明 UUID,無法從股號推導,所以必須解析索引;
// 清單有分頁,翻頁參數用嘗試法偵測(?page= / ?p= / ?offset=)。
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "transcripts.json");
const INDEX_URL = "https://www.alphamemo.ai/free-transcripts";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MAX_PAGES = 40;

// --- 地圖上的節點(台股代號 + 海外代碼 + 名稱),供配對 ------------------------
const dataJs = readFileSync(path.join(ROOT, "public", "data.js"), "utf8");
const companies = [...dataJs.matchAll(/id:\s*"([A-Z0-9]{1,5})",\s*name:\s*"([^"]+)"/g)].map((m) => ({
  code: m[1],
  name: m[2].replace(/-KY$/, ""), // 標題常省略 -KY 後綴
}));
const idSet = new Set(companies.map((c) => c.code));

const decode = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const findDate = (s) => {
  const m = String(s).match(/(20\d{2})[年.\/-]\s?(\d{1,2})[月.\/-]\s?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const q = String(s).match(/20\d{2}\s?Q[1-4]/i);
  return q ? q[0].replace(/\s/g, "") : "";
};

// --- 從一頁 HTML 解析出 uuid -> { title, context, code?, date? } --------------
function collectFrom(html) {
  const found = new Map();

  // 策略 0(精準):Next.js 資料串流裡的結構化 JSON,先還原跳脫引號再抽欄位
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

  // 策略 1(備援):HTML 錨點 <a href="/free-transcripts/<uuid>">標題…</a>
  for (const m of html.matchAll(
    new RegExp(`<a[^>]+href="(?:https?://[^"/]+)?/free-transcripts/(${UUID})[^"]*"[^>]*>([\\s\\S]{0,600}?)</a>`, "gi")
  )) {
    if (found.has(m[1])) continue;
    const title = decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (title) found.set(m[1], { title, context: title, code: "", date: "" });
  }

  // 策略 2(備援):泛用內嵌 JSON(uuid 與 title/name 同物件)
  const objRe = new RegExp(
    `\\{[^{}]{0,800}?"(?:id|uuid|slug|transcriptId)"\\s*:\\s*"(${UUID})"[^{}]{0,800}?"(?:title|name|subject|company)"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,300})"[^{}]{0,800}?\\}`,
    "gi"
  );
  const objReRev = new RegExp(
    `\\{[^{}]{0,800}?"(?:title|name|subject|company)"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,300})"[^{}]{0,800}?"(?:id|uuid|slug|transcriptId)"\\s*:\\s*"(${UUID})"[^{}]{0,800}?\\}`,
    "gi"
  );
  for (const source of [html, unescaped]) {
    for (const m of source.matchAll(objRe)) {
      if (!found.has(m[1])) found.set(m[1], { title: decode(m[2]), context: decode(m[0]), code: "", date: "" });
    }
    for (const m of source.matchAll(objReRev)) {
      if (!found.has(m[2])) found.set(m[2], { title: decode(m[1]), context: decode(m[0]), code: "", date: "" });
    }
  }
  return found;
}

const mergeInto = (master, extra) => {
  let fresh = 0;
  for (const [k, v] of extra) {
    if (!master.has(k)) {
      master.set(k, v);
      fresh++;
    }
  }
  return fresh;
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AIstockmap-sync/1.0; +https://github.com/CoeusK99/AIstockmap)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CLI
const args = process.argv.slice(2);
const argVal = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : "");
const FROM = argVal("--from") || (args[0] && !args[0].startsWith("--") ? args[0] : "");
const DUMP = argVal("--dump");

async function main() {
  const found = new Map();

  if (FROM) {
    console.log(`離線解析 ${FROM} …`);
    const html = readFileSync(FROM, "utf8");
    mergeInto(found, collectFrom(html));
    console.log(`解析出 ${found.size} 筆`);
  } else {
    console.log(`抓取索引頁 ${INDEX_URL} …`);
    const first = await fetchHtml(INDEX_URL);
    if (DUMP) {
      writeFileSync(DUMP, first);
      console.log(`已將第一頁存至 ${DUMP}`);
    }
    mergeInto(found, collectFrom(first));
    console.log(`第 1 頁:${found.size} 筆`);
    const pageSize = found.size;

    // --- 自動翻頁:嘗試常見分頁參數,選出能帶來新資料的那一種 -------------------
    if (pageSize > 0) {
      let mode = null; // ["page"] | ["p"] | ["offset"]
      for (const cand of ["page", "p", "offset"]) {
        const val = cand === "offset" ? String(pageSize) : "2";
        try {
          const html2 = await fetchHtml(`${INDEX_URL}?${cand}=${val}`);
          const fresh = mergeInto(found, collectFrom(html2));
          console.log(`偵測分頁參數 ?${cand}=${val}:新增 ${fresh} 筆`);
          if (fresh > 0) {
            mode = cand;
            break;
          }
        } catch {
          /* 該參數不可用,試下一個 */
        }
        await sleep(300);
      }
      if (mode) {
        for (let n = 3; n <= MAX_PAGES; n++) {
          const val = mode === "offset" ? String(pageSize * (n - 1)) : String(n);
          let fresh = 0;
          try {
            fresh = mergeInto(found, collectFrom(await fetchHtml(`${INDEX_URL}?${mode}=${val}`)));
          } catch (err) {
            console.log(`第 ${n} 頁抓取失敗(${err.message}),停止翻頁`);
            break;
          }
          console.log(`第 ${n} 頁:新增 ${fresh} 筆(累計 ${found.size})`);
          if (fresh === 0) break;
          await sleep(500); // 禮貌性間隔
        }
      } else {
        console.log("未偵測到有效的分頁參數(可能只有一頁,或翻頁靠前端 API)");
      }
    }
  }

  if (found.size === 0) {
    console.error(
      "找不到任何逐字稿連結 — 頁面可能是純前端渲染或改版了。\n" +
      "可將索引頁另存 HTML 後執行:node scripts/sync-alphamemo.mjs --from <saved.html>"
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
