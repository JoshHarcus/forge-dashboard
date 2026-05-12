// Forge Cockpit · D3 force-directed graph v3
// Canonical sources, compact collapsible filter, free movement, fit-to-view
(function () {
const Forge = (window.Forge = window.Forge || {});

const SOURCE_COLOR = {
hubspot:       "#C9764A",
drive:         "#FAF0DC",
slack:         "#A89AC9",
gmail:         "#6B8AAE",
gong:          "#C9A34A",
asana:         "#6B7B3A",
backfill:      "#C95E5E",
conversations: "#D4A8C9",
notion:        "#EBE2D2",
imessages:     "#9CA3AF",
unknown:       "#5A5A5A"
};

const SOURCE_LABEL = {
hubspot: "HubSpot",
drive: "Drive",
slack: "Slack",
gmail: "Gmail",
gong: "Gong",
asana: "Asana",
backfill: "Brain",
conversations: "Convos",
notion: "Notion",
imessages: "iMsg",
unknown: "Other"
};

const SOURCE_ORDER = ["hubspot", "drive", "asana", "slack", "gmail", "gong", "backfill", "conversations", "notion", "imessages", "unknown"];

const DEPT_COLOR = {
sales: "#2D5E3E", clients: "#1E4E8C", marketing: "#C9A34A",
revops: "#5E3E73", strategy: "#2A2A2A", personal: "#7A7A7A"
};

const RADIUS = { high: 5, medium: 3.5, low: 2.5 };

const svgEl = document.getElementById("graph");
const svg = d3.select(svgEl);
const stage = document.getElementById("stage");

let width = stage.clientWidth;
let height = stage.clientHeight;
svg.attr("viewBox", `0 0 ${width} ${height}`);

const bgGroup = svg.append("g").attr("class", "bg-layer");
function drawBackgroundStars() {
bgGroup.selectAll("*").remove();
const count = Math.min(300, Math.round((width * height) / 8000));
for (let i = 0; i < count; i++) {
bgGroup.append("circle")
.attr("cx", Math.random() * width).attr("cy", Math.random() * height)
.attr("r", Math.random() * 0.8 + 0.2)
.attr("fill", "rgba(235, 226, 210, 0.15)");
}
}

const zoomGroup = svg.append("g").attr("class", "zoom-layer");
const edgeGroup = zoomGroup.append("g").attr("class", "edges");
const nodeGroup = zoomGroup.append("g").attr("class", "nodes");

const zoom = d3.zoom().scaleExtent([0.05, 10])
.on("zoom", (e) => { zoomGroup.attr("transform", e.transform); });
svg.call(zoom);
svgEl.addEventListener("gesturestart", (e) => e.preventDefault());

let nodes = [], edges = [], nodesById = new Map(), neighborsById = new Map();
let simulation = null, focusedId = null;
let hiddenSources = new Set();
let presentSources = new Set();

Promise.all([
fetch("data/nodes.json").then((r) => r.json()),
fetch("data/edges.json").then((r) => r.json()),
fetch("data/roadmap.json").then((r) => r.json()).catch(() => []),
fetch("data/activity.json").then((r) => r.json()).catch(() => [])
]).then(([nodesData, edgesData, roadmap, activity]) => {
nodes = nodesData.map((n) => {
const cs = canonicalSource(n);
return { ...n, _src: cs, _color: SOURCE_COLOR[cs] || SOURCE_COLOR.unknown };
});
edges = edgesData.map((e) => ({ ...e }));
nodesById = new Map(nodes.map((n) => [n.id, n]));

edges = edges.filter((e) => {
const s = typeof e.source === "string" ? e.source : e.source.id;
const t = typeof e.target === "string" ? e.target : e.target.id;
return nodesById.has(s) && nodesById.has(t);
});

neighborsById = new Map(nodes.map((n) => [n.id, new Set()]));
edges.forEach((e) => {
const s = typeof e.source === "string" ? e.source : e.source.id;
const t = typeof e.target === "string" ? e.target : e.target.id;
neighborsById.get(s).add(t);
neighborsById.get(t).add(s);
});

nodes.forEach((n) => presentSources.add(n._src));

Forge.data = { nodes, edges, roadmap, activity };
drawBackgroundStars();
buildFilterUI();
buildGraph();
wireHud(roadmap, activity);
wireRouter();
setStatus(`${nodes.length} nodes loaded`);
}).catch((err) => {
console.error("Failed to load graph data:", err);
setStatus("Brain offline");
});

function canonicalSource(n) {
const raw = ((n.source || "") + " " + (n.type || "") + " " + (n.department || "") + " " + (n._path || "")).toLowerCase();
if (raw.includes("hubspot")) return "hubspot";
if (raw.includes("asana")) return "asana";
if (raw.includes("drive")) return "drive";
if (raw.includes("slack")) return "slack";
if (raw.includes("gmail")) return "gmail";
if (raw.includes("gong")) return "gong";
if (raw.includes("notion")) return "notion";
if (raw.includes("imessage")) return "imessages";
if (raw.includes("conversation")) return "conversations";
if (raw.includes("backfill") || raw.includes("curated") || raw.includes("decision") || raw.includes("playbook") || raw.includes("rule") || raw.includes("client_summary")) return "backfill";
// Fall back to type
const t = (n.type || "").toLowerCase();
if (["deal", "contact", "company", "activity", "owner"].includes(t)) return "hubspot";
if (["task", "project"].includes(t)) return "asana";
if (["document", "spreadsheet", "presentation", "pdf", "folder"].includes(t)) return "drive";
if (t.includes("slack")) return "slack";
if (t.includes("email")) return "gmail";
if (t === "call") return "gong";
if (["decision", "playbook", "rule", "client_summary"].includes(t)) return "backfill";
return "unknown";
}

function setStatus(text) {
const el = document.getElementById("status-line");
if (el) el.textContent = text;
}

function buildFilterUI() {
let bar = document.getElementById("source-filter");
if (!bar) { bar = document.createElement("div"); bar.id = "source-filter"; document.body.appendChild(bar); }

const sources = SOURCE_ORDER.filter((s) => presentSources.has(s));
const counts = {};
nodes.forEach((n) => { counts[n._src] = (counts[n._src] || 0) + 1; });

bar.innerHTML = `
<style>
#source-filter {
position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
display: flex; align-items: center; gap: 4px;
padding: 4px 6px; border-radius: 999px;
background: rgba(15, 14, 12, 0.7); backdrop-filter: blur(8px);
border: 1px solid rgba(235, 226, 210, 0.1);
z-index: 30;
font-family: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
font-size: 9.5px; letter-spacing: 0.1em;
max-width: calc(100vw - 200px);
overflow: hidden;
transition: max-width 250ms ease, padding 250ms ease;
}
#source-filter.collapsed { max-width: 90px; padding: 4px; }
#source-filter.collapsed .source-pill:not(.toggle) { display: none; }
.source-pill {
display: inline-flex; align-items: center; gap: 5px;
padding: 4px 8px; border-radius: 999px;
color: #EBE2D2; cursor: pointer; user-select: none;
text-transform: uppercase; white-space: nowrap;
transition: opacity 180ms, background 180ms;
}
.source-pill:hover { background: rgba(235, 226, 210, 0.08); }
.source-pill.off { opacity: 0.3; }
.source-pill.toggle {
background: rgba(235, 226, 210, 0.06);
border: 1px solid rgba(235, 226, 210, 0.12);
}
.source-pill .swatch { width: 7px; height: 7px; border-radius: 50%; }
.source-pill .count { opacity: 0.5; font-variant-numeric: tabular-nums; }
@media (max-width: 720px) {
#source-filter { font-size: 9px; max-width: calc(100vw - 100px); }
.source-pill { padding: 3px 6px; }
}
</style>
<div class="source-pill toggle" data-action="toggle-bar">
<span style="font-size: 11px;">⊕</span> Filters
</div>
<div class="source-pill" data-source="__all__">All</div>
${sources.map((s) => `
<div class="source-pill" data-source="${s}">
<span class="swatch" style="background:${SOURCE_COLOR[s]}"></span>${SOURCE_LABEL[s]}<span class="count">${counts[s]}</span>
</div>
`).join("")}
`;

// Start collapsed on narrow screens
if (window.innerWidth < 900) bar.classList.add("collapsed");

bar.addEventListener("click", (e) => {
const pill = e.target.closest(".source-pill");
if (!pill) return;
if (pill.dataset.action === "toggle-bar") {
bar.classList.toggle("collapsed");
return;
}
const src = pill.dataset.source;
if (src === "__all__") {
hiddenSources.clear();
} else {
if (hiddenSources.has(src)) hiddenSources.delete(src);
else hiddenSources.add(src);
}
applyFilter();
updateFilterUI();
});
}

function updateFilterUI() {
document.querySelectorAll(".source-pill").forEach((p) => {
const src = p.dataset.source;
if (src === "__all__" || p.dataset.action) return;
p.classList.toggle("off", hiddenSources.has(src));
});
}

function applyFilter() {
const visible = (n) => !hiddenSources.has(n._src);
nodeGroup.selectAll("g.node").style("display", (d) => visible(d) ? null : "none");
edgeGroup.selectAll("line").style("display", (d) => {
const s = nodesById.get(d.source.id || d.source);
const t = nodesById.get(d.target.id || d.target);
return (s && t && visible(s) && visible(t)) ? null : "none";
});
}

function buildGraph() {
const link = edgeGroup.selectAll("line").data(edges).join("line")
.attr("class", "edge")
.attr("stroke", "rgba(235, 226, 210, 0.05)")
.attr("stroke-width", 0.35);

const node = nodeGroup.selectAll("g.node").data(nodes, (d) => d.id)
.join((enter) => {
const g = enter.append("g").attr("class", "node").attr("data-id", (d) => d.id);
g.append("circle").attr("class", "node-halo")
.attr("r", (d) => (RADIUS[d.priority] || 3) + 6)
.attr("fill", (d) => d._color).attr("opacity", 0.15);
g.append("circle").attr("class", "node-core")
.attr("r", (d) => RADIUS[d.priority] || 3)
.attr("fill", (d) => d._color);
return g;
});

node.call(d3.drag()
.on("start", (event, d) => {
if (!event.active) simulation.alphaTarget(0.12).restart();
d.fx = d.x; d.fy = d.y;
})
.on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
.on("end", (event, d) => {
if (!event.active) simulation.alphaTarget(0);
if (!d.pinned) { d.fx = null; d.fy = null; }
}));

node.on("click", (event, d) => {
event.stopPropagation();
if (Forge.router) Forge.router.set({ type: "node", id: d.id });
focusNode(d.id);
});

node
.on("mouseenter", (event, d) => {
if (matchMedia("(hover: none)").matches) return;
highlightNeighborhood(d.id);
})
.on("mouseleave", () => {
if (matchMedia("(hover: none)").matches) return;
if (!focusedId) clearHighlight();
});

svg.on("click", () => {
focusedId = null;
clearHighlight();
if (Forge.router) Forge.router.set({ type: "home" });
});

// Looser, more organic force simulation — no source clustering force
simulation = d3.forceSimulation(nodes)
.force("link", d3.forceLink(edges).id((d) => d.id).distance(35).strength(0.3))
.force("charge", d3.forceManyBody().strength(-22).distanceMax(200))
.force("center", d3.forceCenter(width / 2, height / 2))
.force("collide", d3.forceCollide().radius((d) => (RADIUS[d.priority] || 3) + 2.5))
.alphaDecay(0.018)
.on("tick", () => {
link
.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
.attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
node.attr("transform", (d) => `translate(${d.x},${d.y})`);
})
.on("end", () => { fitToView(); });

setTimeout(() => fitToView(), 2000);
setTimeout(() => fitToView(), 5000);
setTimeout(() => fitToView(), 10000);
}

function fitToView() {
if (!nodes.length) return;
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
nodes.forEach((n) => {
if (typeof n.x !== "number" || typeof n.y !== "number") return;
if (hiddenSources.has(n._src)) return;
count++;
if (n.x < minX) minX = n.x;
if (n.y < minY) minY = n.y;
if (n.x > maxX) maxX = n.x;
if (n.y > maxY) maxY = n.y;
});
if (!isFinite(minX) || count === 0) return;
const padding = 60;
const w = maxX - minX + padding * 2;
const h = maxY - minY + padding * 2;
const k = Math.min(width / w, height / h, 1.5);
const tx = (width - k * (minX + maxX)) / 2;
const ty = (height - k * (minY + maxY)) / 2;
svg.transition().duration(700).call(
zoom.transform,
d3.zoomIdentity.translate(tx, ty).scale(k)
);
}

function highlightNeighborhood(id) {
const neighbors = neighborsById.get(id) || new Set();
nodeGroup.selectAll("g.node").classed("dim", (d) => d.id !== id && !neighbors.has(d.id));
edgeGroup.selectAll("line")
.attr("stroke", (d) => {
const sId = (d.source.id || d.source);
const tId = (d.target.id || d.target);
return (sId === id || tId === id) ? "#C9A34A" : "rgba(235, 226, 210, 0.04)";
})
.attr("stroke-width", (d) => {
const sId = (d.source.id || d.source);
const tId = (d.target.id || d.target);
return (sId === id || tId === id) ? 1.2 : 0.3;
});
}

function clearHighlight() {
nodeGroup.selectAll("g.node").classed("dim", false).classed("focused", false);
edgeGroup.selectAll("line")
.attr("stroke", "rgba(235, 226, 210, 0.05)")
.attr("stroke-width", 0.35);
focusedId = null;
}

function focusNode(id) {
const node = nodesById.get(id);
if (!node) return;
focusedId = id;
nodeGroup.selectAll("g.node")
.classed("focused", (d) => d.id === id)
.classed("dim", (d) => d.id !== id && !(neighborsById.get(id) || new Set()).has(d.id));
highlightNeighborhood(id);
if (Forge.drawer) Forge.drawer.showNode(node);
if (typeof node.x === "number") {
const cur = d3.zoomTransform(svg.node());
const targetK = Math.max(cur.k, 1.5);
const tx = width / 2 - node.x * targetK;
const ty = (height * 0.4) - node.y * targetK;
svg.transition().duration(700).call(zoom.transform,
d3.zoomIdentity.translate(tx, ty).scale(targetK));
}
}

function wireHud(roadmap, activity) {
const onActivityClick = (id) => {
if (Forge.drawer) Forge.drawer.close("drawer-activity");
if (Forge.router) Forge.router.set({ type: "node", id });
setTimeout(() => focusNode(id), 220);
};
const roadmapBtn = document.getElementById("open-roadmap");
const activityBtn = document.getElementById("open-activity");
if (roadmapBtn) roadmapBtn.addEventListener("click", (e) => {
e.stopPropagation(); if (Forge.drawer) Forge.drawer.showRoadmap(roadmap);
});
if (activityBtn) activityBtn.addEventListener("click", (e) => {
e.stopPropagation(); if (Forge.drawer) Forge.drawer.showActivity(activity, onActivityClick);
});

document.addEventListener("keydown", (e) => {
if (e.target.tagName === "INPUT") return;
if (e.key === "r" || e.key === "R") { if (Forge.drawer) Forge.drawer.showRoadmap(roadmap); }
if (e.key === "a" || e.key === "A") { if (Forge.drawer) Forge.drawer.showActivity(activity, onActivityClick); }
if (e.key === "f" || e.key === "F") fitToView();
if (e.key === "Escape") clearHighlight();
});
}

function wireRouter() {
if (!Forge.router) return;
Forge.router.on((state) => {
if (state.type === "node") focusNode(state.id);
else if (state.type === "home") {
if (Forge.drawer) Forge.drawer.closeAll();
clearHighlight();
}
});
const init = Forge.router.parse();
if (init.type === "node") setTimeout(() => focusNode(init.id), 320);
}

window.addEventListener("resize", () => {
width = stage.clientWidth; height = stage.clientHeight;
svg.attr("viewBox", `0 0 ${width} ${height}`);
bgGroup.selectAll("*").remove(); drawBackgroundStars();
if (simulation) {
simulation.force("center", d3.forceCenter(width / 2, height / 2));
simulation.alpha(0.15).restart();
}
setTimeout(() => fitToView(), 1200);
});

Forge.graph = { focusNode, fitToView };
})();
