// Forge Cockpit · drawer open/close + content rendering
(function () {
  const Forge = (window.Forge = window.Forge || {});

  function open(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
  }

  function close(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
  }

  function closeAll() {
    document.querySelectorAll(".drawer").forEach((d) => d.setAttribute("aria-hidden", "true"));
    document.body.classList.remove("drawer-open");
  }

  function isOpen(id) {
    const el = document.getElementById(id);
    return el && el.getAttribute("aria-hidden") === "false";
  }

  function showNode(node) {
    if (!node) return;
    document.getElementById("drawer-title").textContent = node.name;
    const meta = [
      node.department,
      node.scope,
      node.priority + " priority",
      "last touch " + node.last_activity
    ].filter(Boolean).join("  ·  ");
    document.getElementById("drawer-meta").textContent = meta;
    document.getElementById("drawer-body").innerHTML = node.body || "<p>Nothing here yet.</p>";
    open("drawer-node");
  }

  function showRoadmap(items) {
    const body = document.getElementById("roadmap-body");
    if (!items || !items.length) {
      body.innerHTML = "<p>Nothing here yet.</p>";
      open("drawer-roadmap");
      return;
    }
    const phases = ["1", "2", "3", "later"];
    const phaseLabels = { "1": "Phase 1 · shipping now", "2": "Phase 2 · this week", "3": "Phase 3 · next two weeks", "later": "Parked" };
    let html = "";
    for (const p of phases) {
      const filtered = items.filter((i) => String(i.phase) === p);
      if (!filtered.length) continue;
      html += `<h3>${phaseLabels[p]}</h3>`;
      for (const item of filtered) {
        const cls = (item.status || "planned").replace(/_/g, "-");
        html += `<div class="road-item">
          <div class="road-tag ${cls}"></div>
          <div>
            <div class="road-name">${escapeHtml(item.name)}</div>
            <div class="road-status">${cls.replace(/-/g, " ")}</div>
          </div>
        </div>`;
      }
    }
    body.innerHTML = html;
    open("drawer-roadmap");
  }

  function showActivity(items, onNodeClick) {
    const body = document.getElementById("activity-body");
    if (!items || !items.length) {
      body.innerHTML = "<p>Nothing here yet.</p>";
      open("drawer-activity");
      return;
    }
    body.innerHTML = items.slice(0, 20).map((it) => {
      const date = new Date(it.ts);
      const stamp = isNaN(date.getTime()) ? it.ts : date.toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
      });
      return `<div class="act-item" data-node="${it.node || ""}">
        <div class="act-time">${stamp}</div>
        <div class="act-text">${escapeHtml(it.text)}</div>
        ${it.node ? `<div class="act-link">Focus →</div>` : ""}
      </div>`;
    }).join("");

    body.querySelectorAll(".act-item").forEach((row) => {
      row.addEventListener("click", () => {
        const n = row.dataset.node;
        if (n && onNodeClick) onNodeClick(n);
      });
    });

    open("drawer-activity");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[c]);
  }

  // Wire up close buttons
  document.addEventListener("click", (e) => {
    if (e.target.id === "drawer-close") close("drawer-node");
    if (e.target.dataset && e.target.dataset.close) close(e.target.dataset.close);
  });

  // Esc closes drawers
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  Forge.drawer = { open, close, closeAll, isOpen, showNode, showRoadmap, showActivity };
})();
