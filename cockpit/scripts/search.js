// Forge Cockpit · search palette (Cmd/Ctrl+K)
(function () {
  const Forge = (window.Forge = window.Forge || {});

  const palette = document.createElement("div");
  palette.className = "search-palette";
  palette.id = "search-palette";
  palette.setAttribute("aria-hidden", "true");
  palette.innerHTML = `
    <div class="search-palette-backdrop"></div>
    <div class="search-palette-modal">
      <div class="search-palette-input-row">
        <input type="text" id="search-input" placeholder="Search 3,226 nodes. Try name, person, company, tag, type. ESC to close." autocomplete="off" spellcheck="false">
        <span class="search-palette-hint">⌘K</span>
      </div>
      <div class="search-palette-filters">
        <button class="search-filter-btn active" data-filter-type="">All</button>
        <button class="search-filter-btn" data-filter-type="client">Clients</button>
        <button class="search-filter-btn" data-filter-type="deal">Deals</button>
        <button class="search-filter-btn" data-filter-type="playbook">Playbooks</button>
        <button class="search-filter-btn" data-filter-type="doc">Docs</button>
        <button class="search-filter-btn" data-filter-recent="1">Last 7 days</button>
        <button class="search-filter-btn" data-filter-rich="1">Rich (has body)</button>
      </div>
      <div class="search-palette-results" id="search-results"></div>
      <div class="search-palette-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> focus on graph</span>
        <span><kbd>⇧↵</kbd> open drawer</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  `;
  document.body.appendChild(palette);

  let allNodes = [];
  let visibleNodes = [];
  let selectedIndex = 0;
  let activeFilters = { type: "", recent: false, rich: false };

  function open() {
    palette.setAttribute("aria-hidden", "false");
    document.getElementById("search-input").focus();
    document.getElementById("search-input").select();
    runSearch();
  }
  function close() {
    palette.setAttribute("aria-hidden", "true");
    document.getElementById("search-input").value = "";
  }
  function isOpen() {
    return palette.getAttribute("aria-hidden") === "false";
  }

  function setNodes(nodes) {
    allNodes = nodes || [];
  }

  function scoreNode(node, q) {
    if (!q) return 1;
    const ql = q.toLowerCase();
    let score = 0;
    const name = (node.name || node.label || "").toLowerCase();
    if (name === ql) score += 1000;
    if (name.startsWith(ql)) score += 200;
    if (name.includes(ql)) score += 50;
    if (node.id && node.id.toLowerCase().includes(ql)) score += 30;
    for (const t of (node.tags || [])) {
      if (typeof t === "string" && t.toLowerCase().includes(ql)) score += 20;
    }
    for (const p of (node.people || [])) {
      if (typeof p === "string" && p.toLowerCase().includes(ql)) score += 40;
    }
    for (const c of (node.companies || [])) {
      if (typeof c === "string" && c.toLowerCase().includes(ql)) score += 40;
    }
    const body = (node.body || "").toLowerCase();
    if (body.includes(ql)) score += Math.min(15, 15 * (body.split(ql).length - 1));
    const desc = (node.description || "").toLowerCase();
    if (desc.includes(ql)) score += 10;
    return score;
  }

  function passesFilter(node) {
    if (activeFilters.type && node.type !== activeFilters.type) return false;
    if (activeFilters.recent) {
      const la = node.last_activity || node.captured_at || "";
      if (!la) return false;
      const date = new Date(la);
      const days = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 7 || days < 0) return false;
    }
    if (activeFilters.rich && (!node.body || node.body.length < 200)) return false;
    return true;
  }

  function fmtDate(s) {
    if (!s) return "";
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "today";
    if (days === 1) return "1d ago";
    if (days < 30) return days + "d ago";
    if (days < 365) return Math.floor(days / 30) + "mo ago";
    return Math.floor(days / 365) + "y ago";
  }

  function runSearch() {
    const q = document.getElementById("search-input").value.trim();
    let scored = allNodes.filter(passesFilter).map((n) => ({ n, score: scoreNode(n, q) }));
    if (q) {
      scored = scored.filter((s) => s.score > 0);
      scored.sort((a, b) => b.score - a.score);
    } else {
      // No query: surface high-priority + most-recent
      scored.sort((a, b) => {
        const pa = (a.n.priority === "high") ? 2 : (a.n.priority === "medium") ? 1 : 0;
        const pb = (b.n.priority === "high") ? 2 : (b.n.priority === "medium") ? 1 : 0;
        if (pb !== pa) return pb - pa;
        return (b.n.last_activity || "").localeCompare(a.n.last_activity || "");
      });
    }
    visibleNodes = scored.slice(0, 60).map((s) => s.n);
    selectedIndex = 0;
    render();
  }

  function render() {
    const container = document.getElementById("search-results");
    if (!visibleNodes.length) {
      container.innerHTML = `<div class="search-empty">No nodes match. Try a broader query.</div>`;
      return;
    }
    container.innerHTML = visibleNodes.map((n, i) => {
      const cls = i === selectedIndex ? "active" : "";
      const dept = n.department || "";
      const type = n.type || "doc";
      const richBadge = (n.body && n.body.length > 500) ? '<span class="result-badge rich">rich</span>' : "";
      const dateBadge = n.last_activity ? `<span class="result-date">${fmtDate(n.last_activity)}</span>` : "";
      const desc = (n.description || (n.body || "").slice(0, 140)).replace(/<[^>]+>/g, "").slice(0, 140);
      return `<div class="search-result ${cls}" data-idx="${i}" data-id="${n.id}">
        <div class="result-row">
          <span class="result-name">${escapeHtml(n.name || n.label || n.id)}</span>
          <span class="result-type type-${type}">${type}</span>
          ${richBadge}
          ${dateBadge}
        </div>
        <div class="result-meta">${escapeHtml(dept)} ${desc ? "· " + escapeHtml(desc) : ""}</div>
      </div>`;
    }).join("");

    container.querySelectorAll(".search-result").forEach((el) => {
      el.addEventListener("click", (e) => {
        const id = el.dataset.id;
        focusOnGraph(id);
        if (e.shiftKey) openDrawer(id);
        close();
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
  }

  function focusOnGraph(id) {
    if (Forge.graph && Forge.graph.focusNode) {
      Forge.graph.focusNode(id);
    } else if (window.location) {
      window.location.hash = "#/node/" + id;
    }
  }

  function openDrawer(id) {
    const node = allNodes.find((n) => n.id === id);
    if (node && Forge.drawer && Forge.drawer.showNode) {
      Forge.drawer.showNode(node);
    }
  }

  // Wire up
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (isOpen()) close();
      else open();
      return;
    }
    if (e.key === "/" && !isOpen() && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      open();
      return;
    }
    if (!isOpen()) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, visibleNodes.length - 1);
      render();
      const el = document.querySelector(".search-result.active");
      if (el) el.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      render();
      const el = document.querySelector(".search-result.active");
      if (el) el.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const node = visibleNodes[selectedIndex];
      if (node) {
        focusOnGraph(node.id);
        if (e.shiftKey) openDrawer(node.id);
        close();
      }
    }
  });

  document.querySelector(".search-palette-backdrop").addEventListener("click", close);

  document.getElementById("search-input").addEventListener("input", runSearch);

  document.querySelectorAll(".search-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.filterType !== undefined) {
        document.querySelectorAll('[data-filter-type]').forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilters.type = btn.dataset.filterType || "";
      }
      if (btn.dataset.filterRecent) {
        activeFilters.recent = !activeFilters.recent;
        btn.classList.toggle("active");
      }
      if (btn.dataset.filterRich) {
        activeFilters.rich = !activeFilters.rich;
        btn.classList.toggle("active");
      }
      runSearch();
    });
  });

  // Also add a visible HUD button to open
  const hudBtn = document.createElement("button");
  hudBtn.className = "hud-btn search-trigger";
  hudBtn.title = "Search (⌘K or /)";
  hudBtn.innerHTML = "🔍";
  hudBtn.addEventListener("click", open);
  const topRight = document.querySelector(".hud-top-right");
  if (topRight) topRight.prepend(hudBtn);

  Forge.search = { open, close, isOpen, setNodes };
})();

// Auto-wire: fetch nodes.json directly if graph.js hasn't given us nodes yet
(async function () {
  try {
    const r = await fetch("data/nodes.json");
    const nodes = await r.json();
    if (window.Forge && window.Forge.search) {
      window.Forge.search.setNodes(nodes);
    }
  } catch (e) {
    console.warn("Forge search: could not load nodes.json", e);
  }
})();
