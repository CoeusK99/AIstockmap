#!/usr/bin/env node
// =============================================================================
// 市場聲量同步 — 大家都在看的公開來源
// -----------------------------------------------------------------------------
// 來源 1(預設,免費):PTT 股票板 — 抓最近數頁文章列表,標題比對地圖個股,
//   記錄標題/作者/推文熱度/連結。低頻少量(數頁、每日兩次),禮貌抓取。
// 來源 2(選配):X(Twitter)KOL — 需 X API Basic 的 X_BEARER_TOKEN 與
//   config/kols.json;未設定時自動跳過。
//
// 產出 public/rumors.json,個股面板顯示為「市場聲量・未經證實」。
// 僅索引標題/摘錄與連結;內容未經證實,非投資建議。
//
// 執行:npm run sync:rumors
// 選項:--from-ptt <file>  用另存的 PTT 列表頁 HTML 離線解析(診斷用)
//       --dump <file>      把抓到的第一頁 PTT HTML 存檔(診斷用)
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "rumors.json");
const KOL_CONFIG = path.join(ROOT, "config", "kols.json");

const PTT_BASE = "https://www.ptt.cc";
const PTT_BOARD = "/bbs/Stock/index.html";
const PTT_PAGES = 5;        // 最新 N 頁列表(每頁約 20 篇)
const KEEP_PER_STOCK = 10;  // 每檔個股保留最新 N 則
const UA = "Mozilla/5.0 (compatible; AIstockmap-sync/1.0; +https://github.com/CoeusK99/AIstockmap)";

// --- CLI ----------------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : "");
const FROM_PTT = argVal("--from-ptt");
const DUMP = argVal("--dump");

// --- 地圖個股(代號 + 名稱)---------------------------------------------------
const dataJs = readFileSync(path.join(ROOT, "public", "data.js"), "utf8");
const companies = [...dataJs.matchAll(/id:\s*"([A-Z0-9]{1,5})",\s*name:\s*"([^"]+)"/g)].map((m) => ({
  code: m[1],
  name: m[2].replace(/-KY$/, ""),
}));
const idSet = new Set(companies.map((c) => c.code));

// PCB/CSP 是合成節點,字面會誤中一般詞彙,不做代碼比對
const NO_TOKEN_MATCH = new Set(["PCB", "CSP"]);
function matchStocks(text) {
  const hits = new Set();
  for (const m of text.matchAll(/\b(\d{4})\b/g)) if (idSet.has(m[1])) hits.add(m[1]);
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    if (idSet.has(m[1]) && !NO_TOKEN_MATCH.has(m[1])) hits.add(m[1]);
  }
  for (const c of companies) {
    if (c.name.length >= 2 && text.includes(c.name)) hits.add(c.code);
  }
  return [...hits];
}

const decode = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- PTT 股票板 -----------------------------------------------------------------
// 列表頁一篇文章長這樣(節錄):
//   <div class="r-ent">
//     <div class="nrec"><span class="hl f3">99</span></div>(或 爆 / XX,可能為空)
//     <div class="title"><a href="/bbs/Stock/M.123.A.html">[標的] 2330 台積電 多</a></div>
//     <div class="meta"><div class="author">someone</div> … <div class="date"> 7/15</div>
export function parsePttIndex(html) {
  const items = [];
  const chunks = html.split('<div class="r-ent">').slice(1);
  for (const chunk of chunks) {
    const link = chunk.match(/<a href="(\/bbs\/Stock\/M\.[^"]+\.html)">([^<]+)<\/a>/);
    if (!link) continue; // 已刪文
    const title = decode(link[2]).trim();
    if (/^\[公告\]|盤中閒聊|盤後閒聊|^Re:\s*\[公告\]/.test(title)) continue;
    const heat = decode((chunk.match(/<div class="nrec">(?:<span[^>]*>)?([^<]*)/) || [])[1] || "").trim();
    const author = ((chunk.match(/<div class="author">([^<]+)<\/div>/) || [])[1] || "").trim();
    const date = ((chunk.match(/<div class="date">\s*([\d/ ]+?)\s*<\/div>/) || [])[1] || "").trim();
    items.push({ title, url: PTT_BASE + link[1], heat, author, date });
  }
  // 上一頁連結,供翻頁
  const prev = html.match(/href="(\/bbs\/Stock\/index\d+\.html)"[^>]*>\s*(?:&lsaquo;|‹)\s*上頁/);
  return { items, prev: prev ? prev[1] : null };
}

// PTT 列表日期是 "7/15",推回完整日期(跨年時歸前一年)
function pttDate(md) {
  const m = md.match(/(\d{1,2})\/\s?(\d{1,2})/);
  if (!m) return "";
  const now = new Date();
  let year = now.getFullYear();
  const month = parseInt(m[1], 10);
  if (month > now.getMonth() + 1) year -= 1;
  return `${year}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

async function fetchPtt() {
  const collected = [];
  if (FROM_PTT) {
    console.log(`離線解析 PTT 列表 ${FROM_PTT} …`);
    const { items } = parsePttIndex(readFileSync(FROM_PTT, "utf8"));
    collected.push(...items);
  } else {
    let url = PTT_BOARD;
    for (let i = 0; i < PTT_PAGES && url; i++) {
      const res = await fetch(PTT_BASE + url, {
        signal: AbortSignal.timeout(20000),
        headers: { "user-agent": UA, cookie: "over18=1" },
      });
      if (!res.ok) throw new Error(`PTT ${url} -> HTTP ${res.status}`);
      const html = await res.text();
      if (DUMP && i === 0) {
        writeFileSync(DUMP, html);
        console.log(`已將 PTT 第一頁存至 ${DUMP}`);
      }
      const { items, prev } = parsePttIndex(html);
      collected.push(...items);
      console.log(`PTT 第 ${i + 1} 頁:${items.length} 篇`);
      url = prev;
      await sleep(800); // 禮貌性間隔
    }
  }

  const byCode = {};
  let matched = 0;
  for (const it of collected) {
    const codes = matchStocks(it.title);
    if (!codes.length) continue;
    matched++;
    for (const code of codes) {
      (byCode[code] ||= []).push({
        date: pttDate(it.date),
        source: "PTT",
        author: it.author,
        text: it.title,
        heat: it.heat || "",
        url: it.url,
      });
    }
  }
  console.log(`PTT:共 ${collected.length} 篇,${matched} 篇命中個股`);
  return byCode;
}

// --- X KOL(選配)---------------------------------------------------------------
async function fetchX() {
  const TOKEN = process.env.X_BEARER_TOKEN || "";
  if (!TOKEN) {
    console.log("X:未設定 X_BEARER_TOKEN,跳過(選配來源)");
    return {};
  }
  let KOLS = [];
  try {
    const conf = JSON.parse(readFileSync(KOL_CONFIG, "utf8"));
    KOLS = (conf.kols || []).filter((k) => k.username && !k.username.startsWith("REPLACE_ME"));
  } catch { /* 無設定檔 */ }
  if (!KOLS.length) {
    console.log("X:config/kols.json 未填 KOL,跳過");
    return {};
  }

  const xapi = async (pathname) => {
    const res = await fetch(`https://api.x.com/2${pathname}`, {
      signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`X API ${pathname} -> HTTP ${res.status}`);
    return res.json();
  };

  const byCode = {};
  for (const kol of KOLS) {
    try {
      const uid = (await xapi(`/users/by/username/${encodeURIComponent(kol.username)}`))?.data?.id;
      if (!uid) continue;
      const tweets = (await xapi(`/users/${uid}/tweets?max_results=20&exclude=retweets,replies&tweet.fields=created_at`))?.data || [];
      for (const t of tweets) {
        const codes = matchStocks(t.text || "");
        for (const code of codes) {
          (byCode[code] ||= []).push({
            date: (t.created_at || "").slice(0, 10),
            source: "X",
            author: `@${kol.username}`,
            text: String(t.text).replace(/\s+/g, " ").slice(0, 220),
            heat: "",
            url: `https://x.com/${kol.username}/status/${t.id}`,
          });
        }
      }
      console.log(`X @${kol.username}:${tweets.length} 篇`);
    } catch (err) {
      console.error(`X @${kol.username} 失敗:${err.message}`);
    }
  }
  return byCode;
}

// --- 主流程 ----------------------------------------------------------------------
async function main() {
  const results = await Promise.allSettled([fetchPtt(), fetchX()]);
  const byCode = {};
  for (const r of results) {
    if (r.status !== "fulfilled") {
      console.error("來源失敗:", r.reason?.message || r.reason);
      continue;
    }
    for (const [code, items] of Object.entries(r.value)) {
      (byCode[code] ||= []).push(...items);
    }
  }

  if (!Object.keys(byCode).length && !FROM_PTT) {
    console.error("所有來源皆無資料 — 可能被擋或版面改版。");
    process.exitCode = 1;
    return;
  }

  // 併入既有索引(URL 去重),每檔保留最新 N 則
  let existing = { rumors: {} };
  if (existsSync(OUT)) {
    try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch { /* 壞檔就重建 */ }
  }
  const merged = existing.rumors || {};
  for (const [code, items] of Object.entries(byCode)) {
    const list = merged[code] || [];
    const known = new Set(list.map((r) => r.url));
    for (const it of items) if (!known.has(it.url)) list.push(it);
    list.sort((a, b) => (a.date < b.date ? 1 : -1));
    merged[code] = list.slice(0, KEEP_PER_STOCK);
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        updated: new Date().toISOString().slice(0, 10),
        sources: ["PTT 股票板", "X KOL(選配)"],
        note: "公開討論之索引(標題/摘錄/連結),內容未經證實,僅供參考,非投資建議。",
        rumors: merged,
      },
      null,
      2
    ) + "\n"
  );

  const total = Object.values(merged).reduce((n, l) => n + l.length, 0);
  console.log(`\n完成:${Object.keys(merged).length} 檔個股、共 ${total} 則 → public/rumors.json`);
}

main().catch((err) => {
  console.error("同步失敗:", err.message);
  process.exitCode = 1;
});
