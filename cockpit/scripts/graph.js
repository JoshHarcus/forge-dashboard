// Forge Cockpit · D3 force-directed graph v2
// Fit-to-page on load, source-coded colors, source toggle UI
(function () {
const Forge = (window.Forge = window.Forge || {});

// Source-based colors (primary). Falls back to department color, then default.
const SOURCE_COLOR = {
hubspot:   "#C9764A",  // rust - CRM/sales
drive:     "#FAF0DC",  // warm cream - documents
slack:     "#A89AC9",  // lavender - chat
gmail:     "#6B8AAE",  // muted blue - email
gong:      "#C9A34A",  // gold - calls
asana:     "#6B7B3A",  // olive - tasks
backfill:  "#C95E5E",  // soft red - curated knowledge
conversations: "#A89AC9",
notion:    "#EBE2D2",
imessages: "#9CA3AF",
unknown:   "#7A7A7A"
};

// Legacy department colors for old conceptual nodes
const DEPT_COLOR = {
sales: "#2D5E3E",
clients: "#1E4E8C",
marketing: "#C9A34A",
revops: "#5E3E73",
strategy: "#2A2A2A",
personal: "#7A7A7A"
};

const RADIUS = { high: 6, medium: 4, low: 3 };  // small, star-like

const svgEl = document.getElementById("graph");
const svg = d3.select(svgEl);
const stage = document.getElementById("stage");

let width = stage.clientWidth;
let height = stage.clientHeight;
svg.attr("viewBox", `0 0 ${width} ${height}`);

// Background stars
const bgGroup = svg.append("g").attr("class", "bg-layer");
function drawBackgroundStars() {
bgGroup.selectAll("*").remove();
const count = Math.min(300, Math.round((width * height) / 8000));
for (let i = 0; i < count; i++) {
bgGroup.append("circle")
.attr("class", "bg-star")
.attr("cx", Math.random() * width)
.attr("cy", Math.random() * height)
.attr("r", Math.random() * 0.9 + 0.2)
.attr("fill", "rgba(235, 226, 210, 0.18)");
}
}

// Zoomable layer
const zoomGroup = svg.append("g").attr("class", "zoom-layer");
const edgeGroup = zoomGroup.append("g").attr("class", "edges");
const nodeGroup = zoomGroup.append("g").attr("class", "nodes");

const zoom = d3.zoom()
.scaleExtent([0.08, 8])
.on("zoom", (e) => {
zoomGroup.attr("transform", e.transform);
});
svg.call(zoom);

svgEl.addEventListener("gesturestart", (e) => e.preventDefault());

let nodes = [];
let edges = [];
let nodesById = new Map();
let neighborsById = new Map();
let simulation = null;
let focusedId = null;
let sourceFilters = new Set();  // empty = show all
let allSources = new Set();

Promise.all([
fetch("data/nodes.json").then((r) => r.json()),
fetch("data/edges.json").then((r) => r.json()),
fetch("data/roadmap.json").then((r) => r.json()).catch(() => []),
fetch("data/activity.json").then((r) => r.json()).catch(() => [])
]).then(([nodesData, edgesData, roadmap, activity]) => {
nodes = nodesData.map((n) => ({
...n,
source: deriveSource(n),
_color: pickColor(n)
}));
edges = edgesData.map((e) => ({ ...e }));
nodesById = new Map(nodes.map((n) => [n.id, n]));

// Filter edges to only those between known nodes
edges = edges.filter((e) => {
const s = typeof e.source === "string" ? e.source : e.source.id;
const t = typeof e.target === "string" ? e.target : e.target.id;
return nodesById.has(s) && nodesById.has(t);
});

// Build neighbor map
neighborsById = new Map(nodes.map((n) => [n.id, new Set()]));
edges.forEach((e) => {
const s = typeof e.source === "string" ? e.source : e.source.id;
const t = typeof e.target === "string" ? e.target : e.target.id;
if (neighborsById.has(s)) neighborsById.get(s).add(t);
if (neighborsById.has(t)) neighborsById.get(t).add(s);
});

// Track all sources
nodes.forEach((n) => allSources.add(n.source));

Forge.data = { nodes, edges, roadmap, activity };
drawBackgroundStars();
buildSourceFilter();
buildGraph();
wireHud(roadmap, activity);
wireRouter();
setStatus(`${nodes.length} nodes loaded`);
}).catch((err) => {
console.error("Failed to load graph data:", err);
setStatus("Brain offline");
});

function deriveSource(n) {
if (n.source) return n.source;
// Legacy nodes use department/type
const t = (n.type || "").toLowerCase();
const d = (n.department || "").toLowerCase();
if (["deal", "contact", "company", "activity", "owner"].includes(t)) return "hubspot";
if (["task", "project"].includes(t)) return "asana";
if (["document", "spreadsheet", "presentation", "pdf", "folder"].includes(t)) return "drive";
if (t.includes("slack")) return "slack";
if (t.includes("email") || t.includes("gmail")) return "gmail";
if (t === "call") return "gong";
if (["decision", "playbook", "rule", "client_summary"].includes(t)) return "backfill";
if (["conversation"].includes(t)) return "conversations";
if (d) return d;
return "unknown";
}

function pickColor(n) {
const src = n.source;
if (SOURCE_COLOR[src]) return SOURCE_COLOR[src];
if (DEPT_COLOR[n.department]) return DEPT_COLOR[n.department];
return SOURCE_COLOR.unknown;
}

function setStatus(text) {
const el = document.getElementById("status-line");
if (el) el.textContent = text;
}

// Build source filter UI
function buildSourceFilter() {
let panel = document.getElementById("source-filter");
if (!panel) {
panel = document.createElement("div");
panel.id = "source-filter";
document.body.appendChild(panel);
}
const sources = Array.from(allSources).sort();
const counts = {};
nodes.forEach((n) => { counts[n.source] = (counts[n.source] || 0) + 1; });

panel.innerHTML = `
<style>
#source-filter {
position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
padding: 6px 10px; max-width: 80vw; z-index: 30;
font-family: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
font-size: 10px; letter-spacing: 0.12em;
}
.source-pill {
padding: 5px 10px; border-radius: 999px;
border: 1px solid rgba(235, 226, 210, 0.18);
background: rgba(20, 18, 14, 0.7); color: #EBE2D2;
cursor: pointer; user-select: none;
text-transform: uppercase;
transition: opacity 180ms, border-color 180ms;
}
.source-pill.off { opacity: 0.35; }
.source-pill .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.source-pill .count { opacity: 0.6; margin-left: 4px; }
.source-pill.all { border-color: rgba(201, 84, 43, 0.7); }
@media (max-width: 600px) {
#source-filter { top: 60px; }
.source-pill { padding: 4px 7px; font-size: 9px; }
}
</style>
<div class="source-pill all" data-source="__all__">SHOW ALL</div>
${sources.map((s) => `
<div class="source-pill" data-source="${s}">
<span class="swatch" style="background:${SOURCE_COLOR[s] || SOURCE_COLOR.unknown}"></span>
${s}<span class="count">${counts[s]}</span>
</div>
`).join("")}
`;

panel.addEventListener("click", (e) => {
const pill = e.target.closest(".source-pill");
if (!pill) return;
const src = pill.dataset.source;
if (src === "__all__") {
sourceFilters.clear();
} else {
if (sourceFilters.has(src)) sourceFilters.delete(src);
else {
// First click: start with just this one. Subsequent clicks toggle.
if (sourceFilters.size === 0) {
allSources.forEach((s) => { if (s !== src) sourceFilters.add(s); });
} else {
sourceFilters.add(src);
}
}
}
applyFilter();
updateFilterUI();
});
}

function updateFilterUI() {
document.querySelectorAll(".source-pill").forEach((p) => {
const src = p.dataset.source;
if (src === "__all__") {
p.classList.toggle("off", sourceFilters.size === 0 ? false : false);
} else {
p.classList.toggle("off", sourceFilters.has(src));
}
});
}

function applyFilter() {
const isVisible = (id) => {
const n = nodesById.get(id);
if (!n) return false;
return !sourceFilters.has(n.source);
};
nodeGroup.selectAll("g.node")
.style("display", (d) => isVisible(d.id) ? null : "none");
edgeGroup.selectAll("line")
.style("display", (d) => {
const s = typeof d.source === "string" ? d.source : d.source.id;
const t = typeof d.target === "string" ? d.target : d.target.id;
return isVisible(s) && isVisible(t) ? null : "none";
});
}

function buildGraph() {
const link = edgeGroup.selectAll("line")
.data(edges)
.join("line")
.attr("class", "edge")
.attr("stroke", "rgba(235, 226, 210, 0.08)")
.attr("stroke-width", 0.4);

const node = nodeGroup.selectAll("g.node")
.data(nodes, (d) => d.id)
.join((enter) => {
const g = enter.append("g")
.attr("class", (d) => "node " + statusClass(d))
.attr("data-id", (d) => d.id);
g.append("circle")
.attr("class", "node-halo")
.attr("r", (d) => (RADIUS[d.priority] || 4) + 8)
.attr("fill", (d) => d._color)
.attr("opacity", 0.18);
g.append("circle")
.attr("class", "node-core")
.attr("r", (d) => RADIUS[d.priority] || 4)
.attr("fill", (d) => d._color);
return g;
});

node.call(d3.drag()
.on("start", (event, d) => {
if (!event.active) simulation.alphaTarget(0.18).restart();
d.fx = d.x; d.fy = d.y;
})
.on("drag", (event, d) => {
d.fx = event.x; d.fy = event.y;
})
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

// Force sim tuned for 3000+ nodes
simulation = d3.forceSimulation(nodes)
.force("link", d3.forceLink(edges).id((d) => d.id).distance(45).strength(0.4))
.force("charge", d3.forceManyBody().strength(-30).distanceMax(180))
.force("center", d3.forceCenter(width / 2, height / 2))
.force("collide", d3.forceCollide().radius((d) => (RADIUS[d.priority] || 4) + 3))
.force("x", d3.forceX((d) => sourceX(d.source)).strength(0.04))
.force("y", d3.forceY((d) => sourceY(d.source)).strength(0.04))
.alphaDecay(0.025)
.on("tick", () => {
link
.attr("x1", (d) => d.source.x)
.attr("y1", (d) => d.source.y)
.attr("x2", (d) => d.target.x)
.attr("y2", (d) => d.target.y);
node.attr("transform", (d) => `translate(${d.x},${d.y})`);
})
.on("end", () => {
fitToView();
});

// Periodic fit while simulation runs (helps user see things forming up)
setTimeout(() => fitToView(), 1500);
setTimeout(() => fitToView(), 4000);
setTimeout(() => fitToView(), 8000);
}

// Cluster sources visually by giving each source a center point
function sourceX(src) {
const sourceList = Array.from(allSources).sort();
const idx = sourceList.indexOf(src);
const cols = Math.ceil(Math.sqrt(sourceList.length));
return width / 2 + ((idx % cols) - (cols - 1) / 2) * (width / cols);
}
function sourceY(src) {
const sourceList = Array.from(allSources).sort();
const idx = sourceList.indexOf(src);
const cols = Math.ceil(Math.sqrt(sourceList.length));
return height / 2 + (Math.floor(idx / cols) - (cols - 1) / 2) * (height / cols);
}

function fitToView() {
if (!nodes.length) return;
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
nodes.forEach((n) => {
if (typeof n.x !== "number" || typeof n.y !== "number") return;
if (sourceFilters.has(n.source)) return;
if (n.x < minX) minX = n.x;
if (n.y < minY) minY = n.y;
if (n.x > maxX) maxX = n.x;
if (n.y > maxY) maxY = n.y;
});
if (!isFinite(minX)) return;
const padding = 80;
const w = maxX - minX + padding * 2;
const h = maxY - minY + padding * 2;
const k = Math.min(width / w, height / h, 1);
const tx = (width - k * (minX + maxX)) / 2;
const ty = (height - k * (minY + maxY)) / 2;
svg.transition().duration(800).call(
zoom.transform,
d3.zoomIdentity.translate(tx, ty).scale(k)
);
}

function statusClass(n) {
if (n.status === "overdue") return "overdue";
if (n.status === "won" || n.status === "closed-won") return "won";
if (n.status === "lost" || n.status === "closed-lost") return "lost";
if (n.status === "active") return "has-pending";
return "";
}

function highlightNeighborhood(id) {
const neighbors = neighborsById.get(id) || new Set();
nodeGroup.selectAll("g.node").classed("dim", (d) => d.id !== id && !neighbors.has(d.id));
edgeGroup.selectAll("line")
.classed("dim", (d) => {
const sId = (d.source.id || d.source);
const tId = (d.target.id || d.target);
return sId !== id && tId !== id;
})
.attr("stroke", (d) => {
const sId = (d.source.id || d.source);
const tId = (d.target.id || d.target);
return (sId === id || tId === id) ? "#C9A34A" : "rgba(235, 226, 210, 0.06)";
})
.attr("stroke-width", (d) => {
const sId = (d.source.id || d.source);
const tId = (d.target.id || d.target);
return (sId === id || tId === id) ? 1.2 : 0.3;
});
}

function clearHighlight() {
nodeGroup.selectAll("g.node").classed("dim", false).classed("focused", false);
edgeGroup.selectAll("line").classed("dim", false)
.attr("stroke", "rgba(235, 226, 210, 0.08)")
.attr("stroke-width", 0.4);
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

if (typeof node.x === "number" && typeof node.y === "number") {
const cur = d3.zoomTransform(svg.node());
const targetK = Math.max(cur.k, 1.5);
const tx = width / 2 - node.x * targetK;
const ty = (height * 0.4) - node.y * targetK;
svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(targetK));
}
}

function applyFreshness(asOfMs) {
if (!Forge.time) return;
nodeGroup.selectAll("g.node")
.style("opacity", (d) => Forge.time.freshnessOpacity(d.last_activity, asOfMs));
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
e.stopPropagation();
if (Forge.drawer) Forge.drawer.showRoadmap(roadmap);
});
if (activityBtn) activityBtn.addEventListener("click", (e) => {
e.stopPropagation();
if (Forge.drawer) Forge.drawer.showActivity(activity, onActivityClick);
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
width = stage.clientWidth;
height = stage.clientHeight;
svg.attr("viewBox", `0 0 ${width} ${height}`);
bgGroup.selectAll("*").remove();
drawBackgroundStars();
if (simulation) {
simulation.force("center", d3.forceCenter(width / 2, height / 2));
simulation.alpha(0.2).restart();
}
setTimeout(() => fitToView(), 1200);
});

Forge.graph = { applyFreshness, focusNode, fitToView };
})();
