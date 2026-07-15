import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, "public")));

// 地圖上有哪些台股代號(從 data.js 撈,供法說會資料過濾用)
const DATA_JS = readFileSync(path.join(__dirname, "public", "data.js"), "utf8");
const TICKERS = new Set([...DATA_JS.matchAll(/id:\s*"(\d{4})"/g)].map((m) => m[1]));

// -----------------------------------------------------------------------------
// 報價代理:整合 TWSE(上市)與 TPEx(上櫃)公開 OpenAPI 的當日收盤資料。
// 瀏覽器直接打交易所 API 會被 CORS 擋下,所以由伺服器代抓並快取 10 分鐘。
// 抓不到時回 quotes: {} — 前端會安靜退化成純地圖模式。
// -----------------------------------------------------------------------------
const TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TPEX_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes";
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, payload: null };

const num = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// TPEx 的日期是民國年(如 1150714)→ 2026/07/14
const rocToDate = (v) => {
  const s = String(v || "").replace(/\D/g, "");
  if (s.length < 6) return "";
  const year = parseInt(s.slice(0, s.length - 4), 10) + 1911;
  return `${year}/${s.slice(-4, -2)}/${s.slice(-2)}`;
};

async function fetchJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function loadQuotes() {
  const quotes = {};
  let date = "";

  const [twse, tpex] = await Promise.allSettled([fetchJson(TWSE_URL), fetchJson(TPEX_URL)]);

  if (twse.status === "fulfilled" && Array.isArray(twse.value)) {
    for (const row of twse.value) {
      const code = row.Code || row.code;
      if (!code) continue;
      quotes[code] = { close: num(row.ClosingPrice), change: num(row.Change) };
    }
  }
  if (tpex.status === "fulfilled" && Array.isArray(tpex.value)) {
    for (const row of tpex.value) {
      const code = row.SecuritiesCompanyCode || row.Code;
      if (!code) continue;
      quotes[code] = { close: num(row.Close), change: num(row.Change) };
      if (!date && row.Date) date = rocToDate(row.Date);
    }
  }
  if (!date) {
    // TWSE 端點不帶日期欄位;抓到資料但沒日期時以台北時間標記「最近交易日」
    date = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium" }).format(new Date());
  }
  return { quotes, date };
}

app.get("/api/quotes", async (_req, res) => {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_MS) {
    return res.json(cache.payload);
  }
  try {
    const payload = await loadQuotes();
    if (Object.keys(payload.quotes).length > 0) {
      cache = { at: now, payload };
    }
    res.json(payload);
  } catch (err) {
    console.error("quotes fetch failed:", err.message);
    // 有舊快取先用舊的,完全沒有就回空物件讓前端退化
    res.json(cache.payload || { quotes: {}, date: "" });
  }
});

// -----------------------------------------------------------------------------
// 法說會資訊:同步交易所開放資料(公司代號、日期、地點、訊息擇要、專區連結)。
// 官方僅公告簡報與影音連結,並無逐字稿;欄位名稱可能隨資料集改版而調整,
// 所以用關鍵字比對欄位、任何一個來源失敗都不影響其他來源。
// -----------------------------------------------------------------------------
const CONF_SOURCES = [
  "https://openapi.twse.com.tw/v1/opendata/t187ap38_L",      // 上市 法人說明會
  "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap38_O",   // 上櫃 法人說明會
];
const CONF_CACHE_MS = 6 * 60 * 60 * 1000;
let confCache = { at: 0, payload: null };

// 從一列資料裡,用欄位名稱的關鍵字挑出想要的值
const pick = (row, patterns) => {
  for (const k of Object.keys(row)) {
    if (patterns.some((p) => p.test(k))) {
      const v = String(row[k] ?? "").trim();
      if (v && v !== "-") return v;
    }
  }
  return "";
};

// 民國(1140820)或西元(20250820)都轉成 2025/08/20
const normDate = (v) => {
  const s = String(v || "").replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6)}`;
  if (s.length === 6 || s.length === 7) return rocToDate(s);
  return String(v || "");
};

async function loadConferences() {
  const byCode = {};
  const results = await Promise.allSettled(CONF_SOURCES.map(fetchJson));
  for (const r of results) {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) continue;
    for (const row of r.value) {
      const code = pick(row, [/公司代號/, /^SecuritiesCompanyCode$/i, /^CompanyCode$/i, /^Code$/i]);
      if (!TICKERS.has(code)) continue;
      const item = {
        date: normDate(pick(row, [/日期/, /date/i])),
        place: pick(row, [/地點/, /place|location/i]),
        msg: pick(row, [/擇要|訊息|摘要|說明/, /message|summary|content|description/i]),
        url: pick(row, [/網址|連結/, /url|link|website/i]),
      };
      if (!item.date && !item.msg) continue;
      (byCode[code] ||= []).push(item);
    }
  }
  for (const code of Object.keys(byCode)) {
    byCode[code].sort((a, b) => (a.date < b.date ? 1 : -1));
    byCode[code] = byCode[code].slice(0, 6);
  }
  return { conferences: byCode };
}

app.get("/api/conferences", async (_req, res) => {
  const now = Date.now();
  if (confCache.payload && now - confCache.at < CONF_CACHE_MS) {
    return res.json(confCache.payload);
  }
  try {
    const payload = await loadConferences();
    if (Object.keys(payload.conferences).length > 0) {
      confCache = { at: now, payload };
    }
    res.json(payload);
  } catch (err) {
    console.error("conferences fetch failed:", err.message);
    res.json(confCache.payload || { conferences: {} });
  }
});

// -----------------------------------------------------------------------------
// 研究文件庫:掃描 docs/<股號>/ 下的檔案(逐字稿、券商報告、法說簡報等)。
// 券商報告與逐字稿多有版權限制、無公開 API,採「自行放檔案、自動建索引」:
//   docs/2330/2026-01-16_逐字稿_2025Q4法說會.pdf
//   檔名格式:日期_類型_標題.副檔名(日期與類型可省略)
// -----------------------------------------------------------------------------
const DOCS_DIR = path.join(__dirname, "docs");
app.use("/docs", express.static(DOCS_DIR));

const DOC_EXT = /\.(pdf|txt|md|html?|docx?|pptx?|xlsx?|csv)$/i;

function scanDocs() {
  const byCode = {};
  if (!existsSync(DOCS_DIR)) return byCode;
  for (const dir of readdirSync(DOCS_DIR)) {
    const dirPath = path.join(DOCS_DIR, dir);
    if (!statSync(dirPath).isDirectory()) continue;
    const items = [];
    for (const file of readdirSync(dirPath)) {
      if (file.startsWith(".") || !DOC_EXT.test(file)) continue;
      const base = file.replace(DOC_EXT, "");
      const parts = base.split("_");
      let date = "";
      if (/^\d{4}-?\d{2}-?\d{2}$/.test(parts[0])) {
        const s = parts.shift().replace(/-/g, "");
        date = `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6)}`;
      }
      const type = parts.length > 1 ? parts.shift() : "文件";
      items.push({
        date,
        type,
        title: parts.join("_") || base,
        url: `/docs/${encodeURIComponent(dir)}/${encodeURIComponent(file)}`,
      });
    }
    if (items.length) {
      items.sort((a, b) => (a.date < b.date ? 1 : -1));
      byCode[dir] = items;
    }
  }
  return byCode;
}

app.get("/api/docs", (_req, res) => {
  try {
    res.json({ docs: scanDocs() });
  } catch (err) {
    console.error("docs scan failed:", err.message);
    res.json({ docs: {} });
  }
});

app.listen(PORT, () => {
  console.log(`台灣科技股產業地圖 http://0.0.0.0:${PORT}`);
});
