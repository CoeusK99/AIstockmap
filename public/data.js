// =============================================================================
// 台灣科技股產業地圖 — 資料集
// -----------------------------------------------------------------------------
// 人工整理的產業鏈知識圖譜(2026 年中);關係為公開資訊之簡化摘要,
// 僅供產業研究參考,不構成投資建議。
//
// nodes:  id      = 股票代號(海外公司用英文代碼)
//         name    = 公司簡稱
//         sector  = 產業別(對應 SECTORS.id)
//         tier    = 1 權值股 / 2 中型 / 3 小型(決定節點大小)
//         market  = twse 上市 / tpex 上櫃 / foreign 海外
//         tags    = 題材標籤(供快速篩選)
//         desc    = 一~兩句公司定位
//
// links:  type    = supply 供應(有向:source 供應 target)
//                   group  集團/持股(無向)
//                   rival  競爭(無向)
//         label   = 關係說明
// =============================================================================

const SECTORS = [
  { id: "ic",     name: "IC 設計與矽智財" },
  { id: "fab",    name: "晶圓製造" },
  { id: "mem",    name: "記憶體" },
  { id: "osat",   name: "封裝測試" },
  { id: "equip",  name: "設備與材料" },
  { id: "comp",   name: "關鍵零組件" },
  { id: "ems",    name: "組裝與代工" },
  { id: "brand",  name: "品牌與網通" },
  { id: "abroad", name: "海外要角" },
];

const NODES = [
  // --- IC 設計與矽智財 -------------------------------------------------------
  { id: "2454", name: "聯發科",   sector: "ic", tier: 1, market: "twse", tags: ["AI", "手機"],
    desc: "全球前三大 IC 設計公司,手機 SoC(天璣系列)、WiFi 與電視晶片龍頭,先進製程全數委由台積電代工。" },
  { id: "2379", name: "瑞昱",     sector: "ic", tier: 2, market: "twse", tags: ["網通"],
    desc: "網通與多媒體晶片大廠,乙太網路、WiFi/藍牙與音訊編解碼晶片市占領先。" },
  { id: "3034", name: "聯詠",     sector: "ic", tier: 2, market: "twse", tags: [],
    desc: "顯示驅動 IC 與影像 SoC 龍頭,面板供應鏈的關鍵晶片來源。" },
  { id: "3443", name: "創意",     sector: "ic", tier: 2, market: "twse", tags: ["AI"],
    desc: "台積電轉投資的 ASIC 設計服務公司,協助客戶開發客製化晶片並導入台積電製程。" },
  { id: "3661", name: "世芯-KY",  sector: "ic", tier: 2, market: "twse", tags: ["AI"],
    desc: "高階 ASIC 設計服務商,聚焦 AI/HPC 客製化晶片,雲端業者自研晶片的重要夥伴。" },
  { id: "3529", name: "力旺",     sector: "ic", tier: 2, market: "tpex", tags: [],
    desc: "嵌入式非揮發性記憶體(eNVM)矽智財龍頭,以授權金與權利金模式獲利。" },
  { id: "8299", name: "群聯",     sector: "ic", tier: 2, market: "tpex", tags: [],
    desc: "NAND Flash 控制晶片與儲存模組大廠,SSD 控制晶片全球領先。" },
  { id: "5269", name: "祥碩",     sector: "ic", tier: 2, market: "twse", tags: [],
    desc: "華碩旗下高速傳輸介面晶片設計公司,超微(AMD)平台晶片組的主要合作夥伴。" },
  { id: "5274", name: "信驊",     sector: "ic", tier: 2, market: "tpex", tags: ["AI", "伺服器"],
    desc: "伺服器遠端管理晶片(BMC)全球龍頭,AI 伺服器建置潮的直接受惠者。" },
  { id: "4966", name: "譜瑞-KY",  sector: "ic", tier: 2, market: "tpex", tags: [],
    desc: "高速傳輸介面 IC 設計商,DisplayPort 時序控制與 Retimer 晶片供應筆電大廠。" },
  { id: "3227", name: "原相",     sector: "ic", tier: 3, market: "twse", tags: [],
    desc: "光學感測晶片廠,滑鼠感測器與遊戲機體感元件的主要供應商。" },
  { id: "6415", name: "矽力-KY",  sector: "ic", tier: 2, market: "twse", tags: [],
    desc: "類比電源管理 IC 設計公司,產品線橫跨消費性、工控與車用電源。" },

  // --- 晶圓製造 ---------------------------------------------------------------
  { id: "2330", name: "台積電",   sector: "fab", tier: 1, market: "twse", tags: ["AI", "蘋果鏈"],
    desc: "全球晶圓代工龍頭,先進製程市占率逾九成;輝達、蘋果、超微等 AI 與手機晶片的主要製造者,台股市值第一。" },
  { id: "2303", name: "聯電",     sector: "fab", tier: 1, market: "twse", tags: [],
    desc: "成熟製程晶圓代工大廠,28 奈米以上特殊製程布局完整,驅動 IC 與網通晶片的主要產能來源。" },
  { id: "5347", name: "世界先進", sector: "fab", tier: 2, market: "tpex", tags: [],
    desc: "台積電轉投資的 8 吋晶圓代工廠,專攻電源管理與顯示驅動 IC 製程。" },
  { id: "6770", name: "力積電",   sector: "fab", tier: 2, market: "twse", tags: [],
    desc: "記憶體與邏輯晶圓代工廠,利基型 DRAM 與電源管理 IC 代工並行。" },
  { id: "3105", name: "穩懋",     sector: "fab", tier: 2, market: "tpex", tags: ["手機"],
    desc: "砷化鎵(GaAs)晶圓代工龍頭,手機射頻功率放大器(PA)的主要製造者。" },

  // --- 記憶體 -----------------------------------------------------------------
  { id: "2408", name: "南亞科",   sector: "mem", tier: 2, market: "twse", tags: [],
    desc: "台塑集團旗下 DRAM 製造廠,台灣自主 DRAM 產能的代表。" },
  { id: "2344", name: "華邦電",   sector: "mem", tier: 2, market: "twse", tags: [],
    desc: "利基型 DRAM 與 NOR Flash 製造廠,車用與工控記憶體布局深。" },
  { id: "2337", name: "旺宏",     sector: "mem", tier: 2, market: "twse", tags: [],
    desc: "NOR Flash 與唯讀記憶體大廠,遊戲機與車用市場的重要供應商。" },
  { id: "3260", name: "威剛",     sector: "mem", tier: 3, market: "tpex", tags: [],
    desc: "記憶體模組廠,DRAM 模組與 SSD 品牌行銷全球。" },

  // --- 封裝測試 ---------------------------------------------------------------
  { id: "3711", name: "日月光投控", sector: "osat", tier: 1, market: "twse", tags: ["蘋果鏈"],
    desc: "全球委外封測(OSAT)龍頭,先進封裝與系統級封裝(SiP)技術領先。" },
  { id: "6239", name: "力成",     sector: "osat", tier: 2, market: "twse", tags: [],
    desc: "記憶體封測大廠,美光在台的重要封測夥伴。" },
  { id: "2449", name: "京元電子", sector: "osat", tier: 2, market: "twse", tags: ["AI"],
    desc: "晶圓測試龍頭,承接輝達等 AI 晶片的關鍵測試訂單。" },
  { id: "6147", name: "頎邦",     sector: "osat", tier: 3, market: "tpex", tags: [],
    desc: "驅動 IC 封測龍頭,金凸塊與捲帶封裝技術市占第一。" },

  // --- 設備與材料 -------------------------------------------------------------
  { id: "3680", name: "家登",     sector: "equip", tier: 2, market: "tpex", tags: [],
    desc: "EUV 光罩傳送盒(Pod)全球獨家量產供應商,深度綁定台積電先進製程。" },
  { id: "6196", name: "帆宣",     sector: "equip", tier: 2, market: "twse", tags: [],
    desc: "半導體廠務系統工程與設備代理商,晶圓廠擴建的直接受惠者。" },
  { id: "3583", name: "辛耘",     sector: "equip", tier: 3, market: "twse", tags: [],
    desc: "濕製程設備自製與再生晶圓服務商,服務台積電等先進製程客戶。" },
  { id: "5434", name: "崇越",     sector: "equip", tier: 2, market: "twse", tags: [],
    desc: "半導體材料通路龍頭,代理信越光阻劑、石英等關鍵耗材。" },

  // --- 關鍵零組件 -------------------------------------------------------------
  { id: "3037", name: "欣興",     sector: "comp", tier: 2, market: "twse", tags: ["AI"],
    desc: "ABF 載板三雄之首,高階 IC 載板與 HDI 板供應 AI 晶片封裝。" },
  { id: "8046", name: "南電",     sector: "comp", tier: 2, market: "twse", tags: [],
    desc: "台塑集團旗下 ABF 載板廠,高階載板供應國際晶片大廠。" },
  { id: "3189", name: "景碩",     sector: "comp", tier: 3, market: "twse", tags: [],
    desc: "IC 載板廠,BT 與 ABF 載板並行,射頻與記憶體載板見長。" },
  { id: "4958", name: "臻鼎-KY",  sector: "comp", tier: 2, market: "twse", tags: ["蘋果鏈"],
    desc: "全球營收最大 PCB 廠(鴻海集團),蘋果軟板的主力供應商。" },
  { id: "3044", name: "健鼎",     sector: "comp", tier: 3, market: "twse", tags: ["伺服器"],
    desc: "多層 PCB 大廠,伺服器與車用電路板布局完整。" },
  { id: "2327", name: "國巨",     sector: "comp", tier: 1, market: "twse", tags: [],
    desc: "全球前三大被動元件廠,MLCC 與晶片電阻透過購併擴張版圖。" },
  { id: "2492", name: "華新科",   sector: "comp", tier: 3, market: "twse", tags: [],
    desc: "華新麗華集團旗下被動元件廠,MLCC 與晶片電阻主要二供。" },
  { id: "3533", name: "嘉澤",     sector: "comp", tier: 2, market: "twse", tags: ["AI", "伺服器"],
    desc: "CPU 插槽與高速連接器大廠,英特爾/超微伺服器平台的核心供應商。" },
  { id: "3017", name: "奇鋐",     sector: "comp", tier: 2, market: "twse", tags: ["AI", "伺服器"],
    desc: "AI 伺服器散熱龍頭,3D VC 與水冷板技術直接供應輝達生態系。" },
  { id: "3324", name: "雙鴻",     sector: "comp", tier: 3, market: "tpex", tags: ["AI", "伺服器"],
    desc: "散熱模組廠,AI 伺服器水冷板的主要供應商之一。" },
  { id: "2308", name: "台達電",   sector: "comp", tier: 1, market: "twse", tags: ["AI", "伺服器"],
    desc: "電源供應器全球龍頭,AI 資料中心電源與散熱方案、電動車動力系統多引擎成長。" },
  { id: "2301", name: "光寶科",   sector: "comp", tier: 2, market: "twse", tags: ["伺服器"],
    desc: "電源管理與光電元件大廠,雲端伺服器電源的主要供應商。" },
  { id: "3008", name: "大立光",   sector: "comp", tier: 1, market: "twse", tags: ["蘋果鏈", "手機"],
    desc: "手機光學鏡頭龍頭,iPhone 高階鏡頭的最主要供應商。" },
  { id: "3406", name: "玉晶光",   sector: "comp", tier: 3, market: "twse", tags: ["蘋果鏈", "手機"],
    desc: "光學鏡頭廠,蘋果鏡頭第二供應商,與大立光直接競爭。" },

  // --- 組裝與代工 -------------------------------------------------------------
  { id: "2317", name: "鴻海",     sector: "ems", tier: 1, market: "twse", tags: ["AI", "蘋果鏈", "伺服器"],
    desc: "全球最大電子代工廠(EMS),iPhone 主力組裝者,近年強攻 AI 伺服器與電動車。" },
  { id: "2382", name: "廣達",     sector: "ems", tier: 1, market: "twse", tags: ["AI", "伺服器"],
    desc: "筆電代工龍頭轉型 AI 伺服器主力,輝達高階 AI 伺服器的核心組裝廠。" },
  { id: "3231", name: "緯創",     sector: "ems", tier: 2, market: "twse", tags: ["AI", "伺服器"],
    desc: "筆電與伺服器代工廠,輝達 AI 加速卡基板的重要供應商。" },
  { id: "4938", name: "和碩",     sector: "ems", tier: 2, market: "twse", tags: ["蘋果鏈"],
    desc: "iPhone 組裝第二大廠,通訊與消費電子代工並行。" },
  { id: "2324", name: "仁寶",     sector: "ems", tier: 2, market: "twse", tags: [],
    desc: "筆電代工大廠,穿戴與智慧裝置代工多角化。" },
  { id: "2356", name: "英業達",   sector: "ems", tier: 2, market: "twse", tags: ["伺服器"],
    desc: "筆電與伺服器代工廠,通用伺服器出貨量居前。" },
  { id: "6669", name: "緯穎",     sector: "ems", tier: 2, market: "twse", tags: ["AI", "伺服器"],
    desc: "緯創旗下雲端資料中心伺服器廠,直接服務 Meta、微軟等超大型資料中心客戶。" },

  // --- 品牌與網通 -------------------------------------------------------------
  { id: "2357", name: "華碩",     sector: "brand", tier: 1, market: "twse", tags: ["AI"],
    desc: "主機板與電競品牌龍頭,筆電、顯卡與 AI 伺服器多線布局。" },
  { id: "2353", name: "宏碁",     sector: "brand", tier: 3, market: "twse", tags: [],
    desc: "PC 品牌大廠,筆電與顯示器為主力,轉投資事業陸續分拆上市。" },
  { id: "2376", name: "技嘉",     sector: "brand", tier: 2, market: "twse", tags: ["AI", "伺服器"],
    desc: "主機板與顯卡大廠,AI 伺服器業務快速放大,輝達重要板卡夥伴。" },
  { id: "2377", name: "微星",     sector: "brand", tier: 2, market: "twse", tags: [],
    desc: "電競品牌大廠,主機板、顯卡與電競筆電全球市占領先。" },
  { id: "2345", name: "智邦",     sector: "brand", tier: 2, market: "twse", tags: ["AI", "伺服器"],
    desc: "資料中心網路交換器代工龍頭,白牌交換器直供雲端巨頭。" },
  { id: "6285", name: "啟碁",     sector: "brand", tier: 3, market: "twse", tags: ["網通"],
    desc: "網通設備廠,車用雷達與衛星通訊產品線成長中。" },
  { id: "5388", name: "中磊",     sector: "brand", tier: 3, market: "twse", tags: ["網通"],
    desc: "寬頻網通設備廠,電信營運商客戶為主。" },

  // --- 海外要角(供應鏈上下游的境外錨點)--------------------------------------
  { id: "NVDA", name: "輝達",     sector: "abroad", tier: 1, market: "foreign", tags: ["AI"],
    desc: "AI GPU 絕對龍頭,晶片由台積電製造,整機由台灣代工廠組裝 — 台灣 AI 供應鏈的最大需求來源。" },
  { id: "AAPL", name: "蘋果",     sector: "abroad", tier: 1, market: "foreign", tags: ["蘋果鏈", "手機"],
    desc: "iPhone/Mac 品牌商,台灣供應鏈最大單一客戶,從晶片、鏡頭到組裝深度依賴台廠。" },
  { id: "AMD",  name: "超微",     sector: "abroad", tier: 2, market: "foreign", tags: ["AI"],
    desc: "CPU/GPU 設計大廠,晶片委由台積電製造,與台灣板卡及伺服器供應鏈關係緊密。" },
  { id: "QCOM", name: "高通",     sector: "abroad", tier: 2, market: "foreign", tags: ["手機"],
    desc: "手機 SoC 龍頭之一,晶片委外台積電等代工,與聯發科正面競爭。" },
  { id: "INTC", name: "英特爾",   sector: "abroad", tier: 2, market: "foreign", tags: [],
    desc: "CPU 大廠,部分先進晶片小晶片(tile)委外台積電製造。" },
  { id: "MU",   name: "美光",     sector: "abroad", tier: 2, market: "foreign", tags: [],
    desc: "DRAM 三巨頭之一,在台設有晶圓廠,封測大量委外台灣力成等廠。" },
  { id: "CSP",  name: "雲端巨頭", sector: "abroad", tier: 1, market: "foreign", tags: ["AI", "伺服器"],
    desc: "微軟、Meta、谷歌、亞馬遜等超大型資料中心業者 — 台灣伺服器與交換器供應鏈的終端客戶。" },
  { id: "PCB",  name: "國際 PC 品牌", sector: "abroad", tier: 3, market: "foreign", tags: [],
    desc: "惠普、戴爾、聯想等 PC 品牌 — 台灣筆電代工五哥的主要客戶。" },
];

const LINKS = [
  // --- 晶圓代工 → IC 設計 / 海外晶片商(supply:source 供應 target)----------
  { source: "2330", target: "2454", type: "supply", label: "先進製程晶圓代工" },
  { source: "2330", target: "3443", type: "supply", label: "ASIC 量產代工" },
  { source: "2330", target: "3661", type: "supply", label: "AI ASIC 先進製程代工" },
  { source: "2330", target: "4966", type: "supply", label: "晶圓代工" },
  { source: "2330", target: "5269", type: "supply", label: "晶圓代工" },
  { source: "2330", target: "5274", type: "supply", label: "晶圓代工" },
  { source: "2330", target: "NVDA", type: "supply", label: "AI GPU 先進製程獨家代工" },
  { source: "2330", target: "AAPL", type: "supply", label: "iPhone/Mac 處理器獨家代工" },
  { source: "2330", target: "AMD",  type: "supply", label: "CPU/GPU 先進製程代工" },
  { source: "2330", target: "QCOM", type: "supply", label: "手機 SoC 代工" },
  { source: "2330", target: "INTC", type: "supply", label: "部分晶片小晶片委外代工" },
  { source: "2303", target: "3034", type: "supply", label: "驅動 IC 成熟製程代工" },
  { source: "2303", target: "2379", type: "supply", label: "網通晶片代工" },
  { source: "2303", target: "3227", type: "supply", label: "感測晶片代工" },
  { source: "5347", target: "3034", type: "supply", label: "8 吋驅動 IC 代工" },
  { source: "5347", target: "6415", type: "supply", label: "電源管理 IC 代工" },
  { source: "3105", target: "AAPL", type: "supply", label: "手機射頻 PA 代工(經射頻廠間接供應)" },

  // --- 矽智財授權 -------------------------------------------------------------
  { source: "3529", target: "2330", type: "supply", label: "eNVM 矽智財授權" },
  { source: "3529", target: "2303", type: "supply", label: "eNVM 矽智財授權" },
  { source: "3529", target: "5347", type: "supply", label: "eNVM 矽智財授權" },
  { source: "3661", target: "CSP",  type: "supply", label: "雲端自研 AI 晶片設計服務" },

  // --- 封測服務 ---------------------------------------------------------------
  { source: "3711", target: "2454", type: "supply", label: "晶片封測服務" },
  { source: "3711", target: "AAPL", type: "supply", label: "SiP 系統級封裝" },
  { source: "3711", target: "AMD",  type: "supply", label: "先進封裝服務" },
  { source: "2449", target: "2454", type: "supply", label: "晶片測試服務" },
  { source: "2449", target: "NVDA", type: "supply", label: "AI GPU 測試服務" },
  { source: "6239", target: "MU",   type: "supply", label: "記憶體封測服務" },
  { source: "6239", target: "8299", type: "supply", label: "NAND 產品封測" },
  { source: "6147", target: "3034", type: "supply", label: "驅動 IC 金凸塊封測" },

  // --- 設備與材料 → 晶圓廠 -----------------------------------------------------
  { source: "3680", target: "2330", type: "supply", label: "EUV 光罩傳送盒獨家供應" },
  { source: "6196", target: "2330", type: "supply", label: "廠務系統工程" },
  { source: "3583", target: "2330", type: "supply", label: "濕製程設備/再生晶圓" },
  { source: "5434", target: "2330", type: "supply", label: "光阻劑、石英等關鍵材料" },

  // --- 記憶體鏈 ---------------------------------------------------------------
  { source: "2408", target: "3260", type: "supply", label: "DRAM 顆粒供應模組廠" },
  { source: "MU",   target: "8299", type: "supply", label: "NAND 顆粒供應" },
  { source: "MU",   target: "3260", type: "supply", label: "記憶體顆粒供應" },

  // --- 載板 / PCB --------------------------------------------------------------
  { source: "3037", target: "3711", type: "supply", label: "ABF 載板供應封測" },
  { source: "3037", target: "NVDA", type: "supply", label: "AI GPU 高階載板" },
  { source: "8046", target: "3711", type: "supply", label: "ABF 載板供應封測" },
  { source: "3189", target: "3711", type: "supply", label: "IC 載板供應封測" },
  { source: "4958", target: "AAPL", type: "supply", label: "iPhone 軟板" },
  { source: "3044", target: "2382", type: "supply", label: "伺服器 PCB" },

  // --- 被動元件 / 連接器 / 散熱 / 電源 / 光學 → 系統廠 --------------------------
  { source: "2327", target: "2317", type: "supply", label: "MLCC 等被動元件" },
  { source: "2327", target: "2382", type: "supply", label: "MLCC 等被動元件" },
  { source: "3533", target: "2382", type: "supply", label: "CPU 插槽/高速連接器" },
  { source: "3533", target: "2317", type: "supply", label: "連接器" },
  { source: "3017", target: "2382", type: "supply", label: "AI 伺服器散熱模組" },
  { source: "3017", target: "NVDA", type: "supply", label: "水冷散熱方案(GB 系列)" },
  { source: "3324", target: "2382", type: "supply", label: "水冷板/散熱模組" },
  { source: "2308", target: "2382", type: "supply", label: "伺服器電源" },
  { source: "2308", target: "NVDA", type: "supply", label: "AI 資料中心電源方案" },
  { source: "2301", target: "CSP",  type: "supply", label: "雲端伺服器電源" },
  { source: "3008", target: "AAPL", type: "supply", label: "iPhone 高階鏡頭主供" },
  { source: "3406", target: "AAPL", type: "supply", label: "iPhone 鏡頭二供" },

  // --- 組裝代工 → 終端品牌 -----------------------------------------------------
  { source: "2317", target: "AAPL", type: "supply", label: "iPhone 主力組裝" },
  { source: "2317", target: "NVDA", type: "supply", label: "AI 伺服器/模組代工" },
  { source: "4938", target: "AAPL", type: "supply", label: "iPhone 組裝二供" },
  { source: "2382", target: "NVDA", type: "supply", label: "GB 系列 AI 伺服器主力組裝" },
  { source: "2382", target: "CSP",  type: "supply", label: "雲端伺服器代工" },
  { source: "2382", target: "AAPL", type: "supply", label: "MacBook 組裝" },
  { source: "2382", target: "PCB",  type: "supply", label: "筆電代工" },
  { source: "3231", target: "NVDA", type: "supply", label: "AI 加速卡基板代工" },
  { source: "3231", target: "PCB",  type: "supply", label: "筆電代工" },
  { source: "2324", target: "PCB",  type: "supply", label: "筆電代工" },
  { source: "2356", target: "PCB",  type: "supply", label: "筆電代工" },
  { source: "2356", target: "CSP",  type: "supply", label: "通用伺服器代工" },
  { source: "6669", target: "CSP",  type: "supply", label: "資料中心伺服器直供" },
  { source: "2345", target: "CSP",  type: "supply", label: "資料中心白牌交換器" },

  // --- 晶片 → 品牌 / 網通 ------------------------------------------------------
  { source: "NVDA", target: "2357", type: "supply", label: "GPU 晶片供應顯卡" },
  { source: "NVDA", target: "2376", type: "supply", label: "GPU 晶片/AI 伺服器夥伴" },
  { source: "NVDA", target: "2377", type: "supply", label: "GPU 晶片供應顯卡" },
  { source: "2454", target: "5388", type: "supply", label: "網通晶片" },
  { source: "2379", target: "5388", type: "supply", label: "寬頻設備晶片" },
  { source: "2379", target: "6285", type: "supply", label: "網通晶片" },

  // --- 集團 / 持股關係 ---------------------------------------------------------
  { source: "2330", target: "3443", type: "group", label: "台積電為創意最大股東(約 35%)" },
  { source: "2330", target: "5347", type: "group", label: "台積電轉投資世界先進(約 28%)" },
  { source: "2317", target: "4958", type: "group", label: "同屬鴻海集團" },
  { source: "3231", target: "6669", type: "group", label: "緯創為緯穎母公司" },
  { source: "2357", target: "5269", type: "group", label: "華碩為祥碩母公司" },
  { source: "2408", target: "8046", type: "group", label: "同屬台塑集團" },
  { source: "2303", target: "2454", type: "group", label: "聯發科自聯電分拆(聯家軍)" },
  { source: "2303", target: "3034", type: "group", label: "聯詠自聯電分拆(聯家軍)" },

  // --- 競爭關係 ---------------------------------------------------------------
  { source: "2330", target: "2303", type: "rival", label: "晶圓代工競爭(先進 vs 成熟製程)" },
  { source: "2303", target: "6770", type: "rival", label: "成熟製程代工競爭" },
  { source: "5347", target: "6770", type: "rival", label: "利基代工競爭" },
  { source: "2454", target: "QCOM", type: "rival", label: "手機 SoC 直接競爭" },
  { source: "3008", target: "3406", type: "rival", label: "手機鏡頭競爭" },
  { source: "2327", target: "2492", type: "rival", label: "被動元件競爭" },
  { source: "3017", target: "3324", type: "rival", label: "伺服器散熱競爭" },
  { source: "2308", target: "2301", type: "rival", label: "電源供應器競爭" },
  { source: "3037", target: "8046", type: "rival", label: "ABF 載板競爭" },
  { source: "8046", target: "3189", type: "rival", label: "IC 載板競爭" },
  { source: "2382", target: "2317", type: "rival", label: "AI 伺服器代工競爭" },
  { source: "2382", target: "2324", type: "rival", label: "筆電代工競爭" },
  { source: "2324", target: "3231", type: "rival", label: "筆電代工競爭" },
  { source: "3231", target: "2356", type: "rival", label: "筆電/伺服器代工競爭" },
  { source: "2357", target: "2353", type: "rival", label: "PC 品牌競爭" },
  { source: "2376", target: "2377", type: "rival", label: "主機板/顯卡競爭" },
  { source: "2357", target: "2376", type: "rival", label: "主機板/顯卡競爭" },
  { source: "2408", target: "2344", type: "rival", label: "利基 DRAM 競爭" },
  { source: "2344", target: "2337", type: "rival", label: "NOR Flash 競爭" },
  { source: "8299", target: "3260", type: "rival", label: "記憶體模組競爭" },
  { source: "NVDA", target: "AMD",  type: "rival", label: "GPU 競爭" },
  { source: "AMD",  target: "INTC", type: "rival", label: "CPU 競爭" },
];

// 供 app.js 使用
window.MAP_DATA = { sectors: SECTORS, nodes: NODES, links: LINKS };
