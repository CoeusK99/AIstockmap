/* 台灣科技股產業地圖 — 產業鏈分層 / 自由網絡 雙模式關係圖 */
/* global d3, MAP_DATA */
(() => {
  const { sectors, nodes, links } = window.MAP_DATA;
  const sectorById = new Map(sectors.map((s) => [s.id, s]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ---------- 產業鏈階段(左 = 上游,右 = 下游)----------
  const STAGES = [
    { label: "設備・材料",   sectors: ["equip"] },
    { label: "晶圓・記憶體", sectors: ["fab", "mem"] },
    { label: "封裝測試",     sectors: ["osat"] },
    { label: "IC 設計",      sectors: ["ic"] },
    { label: "關鍵零組件",   sectors: ["comp"] },
    { label: "組裝・代工",   sectors: ["ems"] },
    { label: "品牌・網通",   sectors: ["brand"] },
    { label: "海外・終端",   sectors: ["abroad"] },
  ];
  const stageOfSector = new Map();
  STAGES.forEach((s, i) => s.sectors.forEach((id) => stageOfSector.set(id, i)));

  // 同一欄裡兩個產業時的垂直分工(晶圓上半、記憶體下半)
  const Y_BIAS = { fab: 0.38, mem: 0.80 };

  // 自由網絡模式的聚落中心
  const CLUSTER = {
    equip: [0.07, 0.32], fab: [0.20, 0.58], ic: [0.33, 0.25], mem: [0.30, 0.82],
    osat: [0.46, 0.62], comp: [0.58, 0.32], ems: [0.72, 0.62], brand: [0.83, 0.24],
    abroad: [0.90, 0.72],
  };

  const RADIUS = { 1: 22, 2: 14, 3: 10 };
  const r = (n) => RADIUS[n.tier] || 12;
  const HEADER_H = 64; // 分層模式頂部欄位標題保留高度

  // ---------- SVG 骨架 ----------
  const svg = d3.select("#graph");
  const tooltip = document.getElementById("tooltip");
  let width = 0;
  let height = 0;
  let mode = "chain"; // chain 產業鏈 | net 自由網絡

  const defs = svg.append("defs");
  // 每個產業一支同色箭頭,供應線的箭頭跟線色一致
  sectors.forEach((s) => {
    defs
      .append("marker")
      .attr("id", `arrow-${s.id}`)
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 7)
      .attr("refY", 0)
      .attr("markerWidth", 6.5)
      .attr("markerHeight", 6.5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4 L8,0 L0,4")
      .style("fill", `var(--s-${s.id})`);
  });

  const root = svg.append("g");
  const bgLayer = root.append("g");        // 欄位底色(跟著縮放)
  const linkLayer = root.append("g");
  const nodeLayer = root.append("g");
  const headerLayer = svg.append("g");     // 欄位標題(固定在畫面頂端,不跟縮放)

  const style = document.createElement("style");
  style.textContent = `
    #graph .stage-stripe { fill: var(--chip-bg); opacity: 0.45; }
    #graph .stage-label {
      fill: var(--text-secondary); font-size: 13px; font-weight: 700; text-anchor: middle;
      paint-order: stroke; stroke: var(--surface-1); stroke-width: 4px; stroke-linejoin: round;
    }
    #graph .stage-sub { fill: var(--text-muted); font-size: 10.5px; text-anchor: middle; }
    #graph .stage-arrow-head { fill: var(--baseline); }
    #graph .link-hit { stroke: transparent; stroke-width: 12; fill: none; cursor: pointer; }
    #graph .link { fill: none; stroke-width: 1.5; stroke: var(--baseline); }
    #graph .link.supply { opacity: 0.55; }
    #graph .link.group { stroke-dasharray: 6 3; stroke-width: 1.8; }
    #graph .link.rival { stroke-dasharray: 1.5 4; }
    #graph g.hl .link { stroke-width: 2.6; opacity: 1; }
    #graph g.hl .link.supply { stroke-dasharray: 7 4; animation: flow 0.5s linear infinite; }
    @keyframes flow { to { stroke-dashoffset: -11; } }
    #graph .node circle { stroke: var(--surface-1); stroke-width: 1.5; cursor: pointer; }
    #graph .node.sel circle { stroke: var(--text-primary); stroke-width: 2.5; }
    #graph .node text {
      fill: var(--text-primary); text-anchor: middle;
      paint-order: stroke; stroke: var(--surface-1); stroke-width: 3px; stroke-linejoin: round;
    }
    #graph .node .tk { fill: var(--text-muted); stroke-width: 2.5px; }
    #graph .faded { opacity: 0.08; }
  `;
  document.head.appendChild(style);

  // ---------- 連線(曲線 + 命中範圍)----------
  const simLinks = links.map((l) => ({ ...l }));
  const linkG = linkLayer
    .selectAll("g")
    .data(simLinks)
    .join("g");
  linkG
    .append("path")
    .attr("class", (d) => `link ${d.type}`)
    .style("stroke", (d) => (d.type === "supply" ? `var(--s-${nodeById.get(d.source).sector})` : null))
    .attr("marker-end", (d) => (d.type === "supply" ? `url(#arrow-${nodeById.get(d.source).sector})` : null));
  linkG
    .append("path")
    .attr("class", "link-hit")
    .on("mousemove", (ev, d) => showLinkTip(ev, d))
    .on("mouseleave", hideTip);

  function linkPath(d) {
    const sx = d.source.x, sy = d.source.y;
    let tx = d.target.x, ty = d.target.y;
    const dx = tx - sx, dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    if (d.type === "supply") {
      const pad = r(d.target) + 5;
      tx -= (dx / len) * pad;
      ty -= (dy / len) * pad;
    }
    const curve = Math.min(36, len * 0.14);
    const mx = (sx + tx) / 2 - (dy / len) * curve;
    const my = (sy + ty) / 2 + (dx / len) * curve;
    return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
  }

  // ---------- 節點 ----------
  const nodeSel = nodeLayer
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(
      d3.drag()
        .on("start", (ev, d) => {
          if (!ev.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev) => { if (!ev.active) sim.alphaTarget(0); })
    )
    .on("mousemove", (ev, d) => showNodeTip(ev, d))
    .on("mouseleave", hideTip)
    .on("click", (ev, d) => { ev.stopPropagation(); select(d.id); })
    .on("dblclick", (ev, d) => {
      ev.stopPropagation();
      d.fx = null; d.fy = null;
      sim.alpha(0.3).restart();
    });

  nodeSel.append("circle").attr("r", (d) => r(d)).style("fill", (d) => `var(--s-${d.sector})`);
  nodeSel
    .append("text")
    .attr("dy", (d) => r(d) + 13)
    .style("font-size", (d) => ({ 1: "13px", 2: "11.5px", 3: "10.5px" }[d.tier]))
    .style("font-weight", (d) => (d.tier === 1 ? 700 : 500))
    .text((d) => d.name);
  nodeSel
    .filter((d) => d.market !== "foreign")
    .append("text")
    .attr("class", "tk")
    .attr("dy", (d) => r(d) + 24)
    .style("font-size", "9px")
    .text((d) => d.id);

  // ---------- 力導向模擬(依模式配置)----------
  const stageX = (n) => {
    const i = stageOfSector.get(n.sector) ?? 4;
    return ((i + 0.5) / STAGES.length) * width;
  };
  const chainY = (n) => HEADER_H + (Y_BIAS[n.sector] ?? 0.5) * (height - HEADER_H);

  // 初始位置先落在各自欄位,收斂快、交錯少
  nodes.forEach((n, i) => {
    n.x = stageX(n) + (Math.sin(i * 7) * 20);
    n.y = HEADER_H + ((i * 53) % 617) / 617 * 600;
  });

  const sim = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(simLinks).id((d) => d.id))
    .force("charge", d3.forceManyBody())
    .force("collide", d3.forceCollide().radius((d) => r(d) + 17))
    .force("x", d3.forceX())
    .force("y", d3.forceY());

  function configureForces() {
    if (mode === "chain") {
      sim.force("link").distance(120).strength(0.02);
      sim.force("charge").strength(-130);
      sim.force("x").x(stageX).strength(0.95);
      sim.force("y").y(chainY).strength(0.06);
    } else {
      sim.force("link").distance((l) => (l.type === "group" ? 60 : 90)).strength(0.25);
      sim.force("charge").strength(-320);
      sim.force("x").x((d) => (CLUSTER[d.sector] ? CLUSTER[d.sector][0] * width : width / 2)).strength(0.14);
      sim.force("y").y((d) => (CLUSTER[d.sector] ? CLUSTER[d.sector][1] * height : height / 2)).strength(0.14);
    }
  }

  sim.on("tick", () => {
    linkG.selectAll("path").attr("d", (d) => linkPath(d));
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  // ---------- 欄位底色(世界座標)+ 欄位標題(螢幕座標,永遠可見)----------
  function drawStages() {
    bgLayer.selectAll("*").remove();
    headerLayer.selectAll("*").remove();
    if (mode !== "chain") return;
    const colW = width / STAGES.length;
    STAGES.forEach((s, i) => {
      if (i % 2 === 1) {
        bgLayer.append("rect")
          .attr("class", "stage-stripe")
          .attr("x", i * colW).attr("y", -height)
          .attr("width", colW).attr("height", height * 3);
      }
      const g = headerLayer.append("g").attr("class", "stage-head").datum(i);
      g.append("text").attr("class", "stage-label").attr("y", 22).text(s.label);
      // 標題底下的產業色短線,把分區跟圖例顏色連起來
      const barW = 14;
      s.sectors.forEach((secId, j) => {
        g.append("rect")
          .attr("x", -(s.sectors.length * (barW + 4) - 4) / 2 + j * (barW + 4))
          .attr("y", 29)
          .attr("width", barW).attr("height", 4).attr("rx", 2)
          .style("fill", `var(--s-${secId})`);
      });
      g.append("text").attr("class", "stage-sub").attr("y", 47)
        .text(i === 0 ? "上游" : i === STAGES.length - 1 ? "下游/需求端" : "");
      if (i < STAGES.length - 1) {
        g.append("path").attr("class", "stage-arrow-head").attr("d", "M0,18 l-6,-3.5 v7 z");
      }
    });
    updateHeaders(d3.zoomTransform(svg.node()));
  }

  // 依目前縮放,把螢幕座標的標題對齊各欄位中心
  function updateHeaders(t) {
    if (mode !== "chain") return;
    const colW = width / STAGES.length;
    headerLayer.selectAll("g.stage-head").each(function (i) {
      const cx = t.applyX((i + 0.5) * colW);
      const g = d3.select(this);
      g.attr("transform", `translate(${cx},0)`);
      // 欄位間的方向箭頭放在兩個標題中間
      g.select(".stage-arrow-head").attr("transform", `translate(${t.applyX((i + 1) * colW) - cx},0)`);
    });
  }

  function resize() {
    const rect = svg.node().getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    configureForces();
    drawStages();
    sim.alpha(0.5).restart();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- 模式切換 ----------
  document.querySelectorAll("#layout-toggle button").forEach((btn) => {
    btn.onclick = () => {
      if (btn.dataset.mode === mode) return;
      mode = btn.dataset.mode;
      document.querySelectorAll("#layout-toggle button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
      nodes.forEach((n) => { n.fx = null; n.fy = null; });
      configureForces();
      drawStages();
      sim.alpha(0.9).restart();
      setTimeout(fitView, 1100);
    };
  });

  // ---------- 縮放平移 ----------
  const zoom = d3.zoom().scaleExtent([0.35, 4]).on("zoom", (ev) => {
    root.attr("transform", ev.transform);
    updateHeaders(ev.transform);
  });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", () => select(null));

  document.getElementById("zoom-in").onclick = () => svg.transition().duration(200).call(zoom.scaleBy, 1.35);
  document.getElementById("zoom-out").onclick = () => svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.35);
  document.getElementById("zoom-fit").onclick = fitView;

  function fitView() {
    const b = nodeLayer.node().getBBox();
    if (!b.width || !b.height) return;
    // 產業鏈模式時,畫面頂端保留給欄位標題
    const topPad = mode === "chain" ? HEADER_H : 12;
    const availH = height - topPad - 12;
    const scale = Math.min(3, Math.min((width * 0.95) / b.width, availH / b.height));
    const tx = width / 2 - scale * (b.x + b.width / 2);
    const ty = topPad + availH / 2 - scale * (b.y + b.height / 2);
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }
  setTimeout(fitView, 1300);

  // ---------- 篩選狀態 ----------
  const state = {
    sectors: new Set(),
    tags: new Set(),
    edges: new Set(["supply", "group", "rival"]),
    selected: null,
  };

  const nodeVisible = (n) => {
    const bySector = state.sectors.size === 0 || state.sectors.has(n.sector);
    const byTag = state.tags.size === 0 || (n.tags || []).some((t) => state.tags.has(t));
    return bySector && byTag;
  };
  const linkVisible = (l) => state.edges.has(l.type) && nodeVisible(l.source) && nodeVisible(l.target);

  function applyFilters() {
    const neighbors = new Set();
    if (state.selected) {
      neighbors.add(state.selected);
      simLinks.forEach((l) => {
        if (!state.edges.has(l.type)) return;
        if (l.source.id === state.selected) neighbors.add(l.target.id);
        if (l.target.id === state.selected) neighbors.add(l.source.id);
      });
    }
    nodeSel
      .classed("faded", (d) => !nodeVisible(d) || (state.selected && !neighbors.has(d.id)))
      .classed("sel", (d) => d.id === state.selected);
    linkG
      .classed("faded", (d) => !linkVisible(d) || (state.selected && d.source.id !== state.selected && d.target.id !== state.selected))
      .classed("hl", (d) => state.selected && (d.source.id === state.selected || d.target.id === state.selected) && linkVisible(d));
  }

  // ---------- 產業圖例 ----------
  const legendBox = document.getElementById("sector-legend");
  sectors.forEach((s) => {
    const count = nodes.filter((n) => n.sector === s.id).length;
    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `<span class="dot" style="background:var(--s-${s.id})"></span>${s.name}<span class="n">${count}</span>`;
    div.onclick = () => {
      if (state.sectors.has(s.id)) state.sectors.delete(s.id);
      else state.sectors.add(s.id);
      [...legendBox.children].forEach((el, i) => {
        el.classList.toggle("off", state.sectors.size > 0 && !state.sectors.has(sectors[i].id));
      });
      applyFilters();
    };
    legendBox.appendChild(div);
  });

  // ---------- 題材標籤 ----------
  const TAG_ORDER = ["AI", "伺服器", "蘋果鏈", "手機", "網通"];
  const chipBox = document.getElementById("tag-chips");
  TAG_ORDER.forEach((t) => {
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = t;
    el.onclick = () => {
      if (state.tags.has(t)) state.tags.delete(t);
      else state.tags.add(t);
      el.classList.toggle("on", state.tags.has(t));
      applyFilters();
    };
    chipBox.appendChild(el);
  });

  // ---------- 關係線開關 ----------
  document.querySelectorAll("#edge-toggles input").forEach((cb) => {
    cb.onchange = () => {
      if (cb.checked) state.edges.add(cb.dataset.type);
      else state.edges.delete(cb.dataset.type);
      applyFilters();
    };
  });

  // ---------- 搜尋 ----------
  const search = document.getElementById("search");
  const datalist = document.getElementById("stock-list");
  nodes.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = `${n.id} ${n.name}`;
    datalist.appendChild(opt);
  });
  search.addEventListener("change", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const hit =
      nodes.find((n) => `${n.id} ${n.name}`.toLowerCase() === q) ||
      nodes.find((n) => n.id.toLowerCase() === q || n.name.toLowerCase() === q) ||
      nodes.find((n) => n.id.toLowerCase().startsWith(q) || n.name.toLowerCase().includes(q));
    if (hit) {
      select(hit.id);
      centerOn(hit);
      search.blur();
    }
  });

  function centerOn(n) {
    const k = 1.4;
    svg.transition().duration(500)
      .call(zoom.transform, d3.zoomIdentity.translate(width / 2 - k * n.x, height / 2 - k * n.y).scale(k));
  }

  // ---------- 報價 / 法說會 / 研究文件 ----------
  let quotes = {};
  let quoteDate = "";
  let confs = {};   // 法說會:交易所開放資料(伺服器代理)
  let docs = {};    // 研究文件:docs/<股號>/ 資料夾自動索引
  const quoteStatus = document.getElementById("quote-status");

  // 外部字串(API 資料、檔名)一律跳脫後才放進 innerHTML
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const rerenderPanel = () => {
    if (state.selected) renderPanel(nodeById.get(state.selected));
  };
  fetch("/api/conferences")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d) => { confs = d.conferences || {}; rerenderPanel(); })
    .catch(() => {});
  fetch("/api/docs")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d) => { docs = d.docs || {}; rerenderPanel(); })
    .catch(() => {});

  fetch("/api/quotes")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      quotes = data.quotes || {};
      quoteDate = data.date || "";
      const got = Object.keys(quotes).length;
      quoteStatus.textContent = got ? `收盤報價:${quoteDate}(台股慣例 紅漲綠跌)` : "尚無報價資料";
      if (state.selected) renderPanel(nodeById.get(state.selected));
    })
    .catch(() => {
      quoteStatus.textContent = "報價未載入(離線/靜態模式,地圖功能不受影響)";
    });

  const fmtQuote = (id) => {
    const q = quotes[id];
    if (!q || q.close == null) return null;
    const chg = q.change ?? 0;
    const cls = chg > 0 ? "up" : chg < 0 ? "down" : "";
    const sign = chg > 0 ? "▲" : chg < 0 ? "▼" : "—";
    const pct = q.close - chg !== 0 ? ((chg / (q.close - chg)) * 100).toFixed(2) : "0.00";
    return { close: q.close, cls, text: `${sign} ${Math.abs(chg).toFixed(2)}(${pct}%)` };
  };

  // ---------- 浮動提示 ----------
  function moveTip(ev) {
    const pad = 14;
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + tooltip.offsetWidth > window.innerWidth - 8) x = ev.clientX - tooltip.offsetWidth - pad;
    if (y + tooltip.offsetHeight > window.innerHeight - 8) y = ev.clientY - tooltip.offsetHeight - pad;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }
  function showNodeTip(ev, d) {
    const q = fmtQuote(d.id);
    tooltip.innerHTML = `
      <div class="t-name">${d.name} <span class="t-sub">${d.market === "foreign" ? "" : d.id}</span></div>
      <div class="t-sub">${sectorById.get(d.sector).name}${d.tags?.length ? " · " + d.tags.join("、") : ""}</div>
      ${q ? `<div>收盤 ${q.close} <span style="color:var(--quote-${q.cls || "up"})">${q.text}</span></div>` : ""}
      <div class="t-sub">點擊看詳細關係</div>`;
    tooltip.style.display = "block";
    moveTip(ev);
  }
  function showLinkTip(ev, d) {
    const arrow = d.type === "supply" ? " → " : " ↔ ";
    tooltip.innerHTML = `
      <div class="t-name">${d.source.name}${arrow}${d.target.name}</div>
      <div>${d.label || ""}</div>`;
    tooltip.style.display = "block";
    moveTip(ev);
  }
  function hideTip() {
    tooltip.style.display = "none";
  }

  // ---------- 個股面板 ----------
  const panel = document.getElementById("panel");

  function select(id) {
    state.selected = id;
    applyFilters();
    if (!id) {
      panel.classList.remove("open");
      panel.innerHTML = "";
      return;
    }
    renderPanel(nodeById.get(id));
  }

  function renderPanel(n) {
    const rel = { down: [], up: [], group: [], rival: [] };
    simLinks.forEach((l) => {
      if (l.source.id === n.id) {
        if (l.type === "supply") rel.down.push({ other: l.target, label: l.label });
        else rel[l.type].push({ other: l.target, label: l.label });
      } else if (l.target.id === n.id) {
        if (l.type === "supply") rel.up.push({ other: l.source, label: l.label });
        else rel[l.type].push({ other: l.source, label: l.label });
      }
    });
    const q = fmtQuote(n.id);
    const relBlock = (title, items, arrow) =>
      items.length
        ? `<h3>${title}</h3>` +
          items
            .map(
              (it) =>
                `<button class="rel-item" data-id="${it.other.id}">
                   <span class="who">${arrow === "←" ? "← " : arrow === "→" ? "→ " : ""}${it.other.name}${it.other.market === "foreign" ? "" : ` <span style="color:var(--text-muted);font-weight:400">${it.other.id}</span>`}</span>
                   <span class="what">${it.label || ""}</span>
                 </button>`
            )
            .join("")
        : "";

    // 法說會(僅台股;資料來自交易所開放資料)
    const confItems = (confs[n.id] || []).slice(0, 3);
    const confBlock = confItems.length
      ? `<h3>法說會</h3>` +
        confItems
          .map((c) => {
            const head = `<span class="who">${esc(c.date)}</span><span class="what">${esc(c.msg || c.place || "")}</span>`;
            return c.url && /^https?:/i.test(c.url)
              ? `<a class="rel-item" href="${esc(c.url)}" target="_blank" rel="noopener">${head}</a>`
              : `<div class="rel-item static">${head}</div>`;
          })
          .join("")
      : "";

    // 逐字稿來源:AlphaMemo 免費逐字稿(固定入口 + 個股站內搜尋)
    const transcriptLinks =
      n.market === "foreign"
        ? ""
        : `<div class="ext-links" style="margin-bottom:8px">
             <a href="https://www.alphamemo.ai/free-transcripts" target="_blank" rel="noopener">AlphaMemo 逐字稿庫</a>
             <a href="https://www.google.com/search?q=${encodeURIComponent(`site:alphamemo.ai ${n.name} 法說會`)}" target="_blank" rel="noopener">找 ${esc(n.name)} 的逐字稿</a>
           </div>`;

    // 研究文件(docs/<股號>/ 內的逐字稿、券商報告、簡報等)
    const docItems = docs[n.id] || [];
    const docBlock =
      n.market === "foreign" && !docItems.length
        ? ""
        : `<h3>研究文件${docItems.length ? `(${docItems.length})` : ""}</h3>` +
          transcriptLinks +
          (docItems.length
            ? docItems
                .map(
                  (d) =>
                    `<a class="rel-item" href="${esc(d.url)}" target="_blank" rel="noopener">
                       <span class="who"><span class="doc-type">${esc(d.type)}</span>${esc(d.title)}</span>
                       ${d.date ? `<span class="what">${esc(d.date)}</span>` : ""}
                     </a>`
                )
                .join("")
            : `<div class="doc-hint">將逐字稿或券商報告放入 <code>docs/${esc(n.id)}/</code><br>檔名:<code>日期_類型_標題.pdf</code>,重新整理即會列出。</div>`);

    // 外部資源(公開網站的個股頁)
    const extBlock =
      n.market === "foreign"
        ? ""
        : `<h3>外部資源</h3><div class="ext-links">
             <a href="https://mops.twse.com.tw/mops/#/web/t146sb05?companyId=${n.id}" target="_blank" rel="noopener">MOPS</a>
             <a href="https://statementdog.com/analysis/${n.id}" target="_blank" rel="noopener">財報狗</a>
             <a href="https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=${n.id}" target="_blank" rel="noopener">Goodinfo</a>
             <a href="https://tw.stock.yahoo.com/quote/${n.id}.TW" target="_blank" rel="noopener">Yahoo</a>
           </div>`;

    const stage = STAGES[stageOfSector.get(n.sector)];
    panel.innerHTML = `
      <button class="panel-close" title="關閉">✕</button>
      <h2>${n.name}</h2>
      <div class="ticker">${n.market === "foreign" ? "海外公司" : `${n.id} · ${n.market === "twse" ? "上市" : "上櫃"}`}</div>
      <div class="sector-chip"><span class="dot" style="background:var(--s-${n.sector})"></span>${sectorById.get(n.sector).name} · ${stage.label}</div>
      ${
        q
          ? `<div class="quote"><span class="price">${q.close}</span><span class="chg ${q.cls}">${q.text}</span><div class="asof">${quoteDate} 收盤</div></div>`
          : ""
      }
      <p class="desc">${n.desc}</p>
      ${confBlock}
      ${docBlock}
      ${relBlock("上游供應商", rel.up, "←")}
      ${relBlock("下游客戶", rel.down, "→")}
      ${relBlock("集團/持股", rel.group, "")}
      ${relBlock("競爭對手", rel.rival, "")}
      ${extBlock}
    `;
    panel.classList.add("open");
    panel.querySelector(".panel-close").onclick = () => select(null);
    panel.querySelectorAll(".rel-item").forEach((btn) => {
      btn.onclick = () => {
        const target = nodeById.get(btn.dataset.id);
        select(target.id);
        centerOn(target);
      };
    });
  }

  applyFilters();
})();
