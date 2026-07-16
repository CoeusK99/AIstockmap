#!/usr/bin/env node
// =============================================================================
// X(Twitter)KOL 貼文同步 — 市場傳聞索引
// -----------------------------------------------------------------------------
// 用官方 X API v2(需 Basic 以上方案的 Bearer Token)拉取 config/kols.json
// 指定帳號的近期貼文,自動比對地圖個股(公司名/股號),寫入 public/rumors.json。
// 個股面板顯示為「KOL 觀點・未經證實」— 傳聞僅供參考,非投資建議。
//
// 執行:X_BEARER_TOKEN=xxx npm run sync:rumors
// 注意:X 已無免費讀取管道;沒有 Token 時本腳本會直接跳過(exit 0),
//       不會讓排程變紅。網頁爬蟲違反 X 服務條款,不做。
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "rumors.json");
const KOL_CONFIG = path.join(ROOT, "config", "kols.json");
const API = "https://api.x.com/2";
const PER_KOL = 20;        // 每個帳號抓最近 N 篇(原創,不含轉推/回覆)
const KEEP_PER_STOCK = 10; // 每檔個股保留最新 N 則

const TOKEN = process.env.X_BEARER_TOKEN || "";
if (!TOKEN) {
  console.log("未設定 X_BEARER_TOKEN,略過同步(需 X API Basic 以上方案)。");
  process.exit(0);
}

const kolsConf = JSON.parse(readFileSync(KOL_CONFIG, "utf8"));
const KOLS = (kolsConf.kols || []).filter((k) => k.username && !k.username.startsWith("REPLACE_ME"));
if (!KOLS.length) {
  console.log("config/kols.json 尚未填入任何 KOL 帳號,略過同步。");
  process.exit(0);
}

// 地圖個股(代號 + 名稱)供貼文比對;-KY 後綴常被省略
const dataJs = readFileSync(path.join(ROOT, "public", "data.js"), "utf8");
const companies = [...dataJs.matchAll(/id:\s*"([A-Z0-9]{1,5})",\s*name:\s*"([^"]+)"/g)].map((m) => ({
  code: m[1],
  name: m[2].replace(/-KY$/, ""),
}));
const idSet = new Set(companies.map((c) => c.code));

async function xapi(pathname) {
  const res = await fetch(`${API}${pathname}`, {
    signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (res.status === 429) throw new Error("觸發 X API 速率限制(429),稍後再試");
  if (!res.ok) throw new Error(`X API ${pathname} -> HTTP ${res.status}`);
  return res.json();
}

// 一則貼文可能同時提到多檔個股
// PCB/CSP 是地圖上的合成節點,字面會誤中一般詞彙(印刷電路板/雲端服務),不做代碼比對
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

async function main() {
  const byCode = {};
  let fetched = 0;

  for (const kol of KOLS) {
    try {
      const user = await xapi(`/users/by/username/${encodeURIComponent(kol.username)}`);
      const uid = user?.data?.id;
      if (!uid) {
        console.log(`@${kol.username}:找不到帳號,略過`);
        continue;
      }
      const tl = await xapi(
        `/users/${uid}/tweets?max_results=${PER_KOL}&exclude=retweets,replies&tweet.fields=created_at`
      );
      const tweets = tl?.data || [];
      fetched += tweets.length;
      let matched = 0;
      for (const t of tweets) {
        const codes = matchStocks(t.text || "");
        if (!codes.length) continue;
        matched++;
        for (const code of codes) {
          (byCode[code] ||= []).push({
            date: (t.created_at || "").slice(0, 10),
            author: kol.name || kol.username,
            handle: kol.username,
            text: String(t.text).replace(/\s+/g, " ").slice(0, 220),
            url: `https://x.com/${kol.username}/status/${t.id}`,
          });
        }
      }
      console.log(`@${kol.username}:${tweets.length} 篇貼文,${matched} 篇命中個股`);
    } catch (err) {
      console.error(`@${kol.username} 同步失敗:${err.message}`);
    }
  }

  // 併入既有索引(以貼文 URL 去重),每檔保留最新 N 則
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
        kols: KOLS.map((k) => k.username),
        note: "KOL 公開貼文之索引(標題/連結/摘錄),內容未經證實,僅供參考,非投資建議。",
        rumors: merged,
      },
      null,
      2
    ) + "\n"
  );

  const total = Object.values(merged).reduce((n, l) => n + l.length, 0);
  console.log(`\n完成:抓取 ${fetched} 篇,索引 ${Object.keys(merged).length} 檔個股、共 ${total} 則 → public/rumors.json`);
}

main().catch((err) => {
  console.error("同步失敗:", err.message);
  process.exitCode = 1;
});
