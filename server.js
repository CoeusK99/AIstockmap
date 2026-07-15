import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, "public")));

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

app.listen(PORT, () => {
  console.log(`台灣科技股產業地圖 http://0.0.0.0:${PORT}`);
});
