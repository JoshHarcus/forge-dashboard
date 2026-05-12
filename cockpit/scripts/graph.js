// Forge Cockpit · D3 force-directed graph, the cockpit core
(function () {
  const Forge = (window.Forge = window.Forge || {});

  const DEPT_COLOR = {
    sales: "#2D5E3E",
    clients: "#1E4E8C",
    marketing: "#C9A34A",
    revops: "#5E3E73",
    strategy: "#2A2A2A",
    personal: "#7A7A7A"
  };

  const RADIUS = { high: 24, medium: 16, low: 10 };

  const svgEl = document.getElementById("graph");
  const svg = d3.select(svgEl);
  const stage = document.getElementById("stage");

  let width = stage.clientWidth;
  let height = stage.clientHeight;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Background constellation layer (decorative)
  const bgGroup = svg.append("g").attr("class", "bg-layer");
  function drawBackgroundStars() {
    bgGroup.selectAll("*").remove();
    const count = Math.min(120, Math.round((width * height) / 14000));
    for (let i = 0; i < count; i++) {
      bgGroup.append("circle")
        .attr("class", "bg-star")
        .attr("cx", Math.random() * width)
        .attr("cy", Math.random() * height)
        .attr("r", Math.random() * 0.9 + 0.2);
    }
  }

  // Zoomable layer
  const zoomGroup = svg.append("g").attr("class", "zoom-layer");
  const edgeGroup = zoomGroup.append("g").attr("class", "edges");
  const nodeGroup = zoomGroup.append("g").attr("class", "nodes");

  const zoom = d3.zoom()
    .scaleExtent([0.35, 4])
    .on("zoom", (e) => {
      zoomGroup.attr("transform", e.transform);
    });
  svg.call(zoom);

  // Disable default touch behavior on touchmove for the graph (we use D3's gestures)
  svgEl.addEventListener("gesturestart", (e) => e.preventDefault());

  let nodes = [];
  let edges = [];
  let nodesById = new Map();
  let neighborsById = new Map();
  let simulation = null;
  let focusedId = null;

  Promise.all([
    fetch("data/nodes.json").then((r) => r.json()),
    fetch("data/edges.json").then((r) => r.json()),
    fetch("data/roadmap.json").then((r) => r.json()).catch(() => []),
    fetch("data/activity.json").then((r) => r.json()).catch(() => [])
  ]).then(([nodesData, edgesData, roadmap, activity]) => {
    nodes = nodesData.map((n) => ({ ...n }));
    edges = edgesData.map((e) => ({ ...e }));
    nodesById = new Map(nodes.map((n) => [n.id, n]));

    // Build neighbor map
    neighborsById = new Map(nodes.map((n) => [n.id, new Set()]));
    edges.forEach((e) => {
      if (neighborsById.has(e.source)) neighborsById.get(e.source).add(e.target);
      if (neighborsById.has(e.target)) neighborsById.get(e.target).add(e.source);
    });

    Forge.data = { nodes, edges, roadmap, activity };
    drawBackgroundStars();
    buildGraph();
    wireHud(roadmap, activity);
    wireRouter();
    setStatus(`${nodes.length} nodes loaded`);
    showHint();
  }).catch((err) => {
    console.error("Failed to load graph data:", err);
    setStatus("Brain offline");
  });

  function setStatus(text) {
    const el = document.getElementById("status-line");
    if (el) el.textContent = text;
  }

  function showHint() {
    const hint = document.getElementById("hint");
    if (!hint) return;
    setTimeout(() => hint.classList.add("show"), 700);
    setTimeout(() => hint.classList.remove("show"), 4500);
  }

  function buildGraph() {
    // Edges
    const link = edgeGroup.selectAll("line")
      .data(edges)
      .join("line")
      .attr("class", (d) => `edge ${d.type === "latent" ? "latent" : ""}`)
      .attr("stroke-width", (d) => Math.max(0.6, Math.min(2.4, (d.weight || 1) * 0.7)));

    // Nodes
    const node = nodeGroup.selectAll("g.node")
      .data(nodes, (d) => d.id)
      .join((enter) => {
        const g = enter.append("g")
          .attr("class", (d) => "node " + statusClass(d))
          .style("color", (d) => DEPT_COLOR[d.department] || "#888")
          .attr("data-id", (d) => d.id);
        g.append("circle")
          .attr("class", "node-halo")
          .attr("r", (d) => (RADIUS[d.priority] || 12) + 6);
        g.append("circle")
          .attr("class", "node-circle")
          .attr("r", (d) => RADIUS[d.priority] || 12)
          .attr("fill", "currentColor");
        g.append("text")
          .attr("class", "node-label")
          .attr("dy", (d) => (RADIUS[d.priority] || 12) + 16)
          .text((d) => d.name);
        return g;
      });

    // Drag
    node.call(d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        if (!d.pinned) { d.fx = null; d.fy = null; }
      }));

    // Click → drawer + deep link
    node.on("click", (event, d) => {
      event.stopPropagation();
      Forge.router.set({ type: "node", id: d.id });
      focusNode(d.id);
    });

    // Hover magnetism
    node
      .on("mouseenter", (event, d) => {
        if (matchMedia("(hover: none)").matches) return;
        magnetize(d.id);
      })
      .on("mouseleave", () => {
        if (matchMedia("(hover: none)").matches) return;
        if (!focusedId) clearMagnetize();
      });

    // Long-press to pin
    if (Forge.gestures) {
      Forge.gestures.attachLongPress(node, (d) => {
        d.pinned = true;
        d.fx = width / 2;
        d.fy = height / 2;
        focusNode(d.id);
      });
      Forge.gestures.attachSwipeUp(node, (d) => {
        Forge.router.set({ type: "node", id: d.id });
        focusNode(d.id);
      });
    }

    // Click empty space deselects
    svg.on("click", () => {
      focusedId = null;
      clearMagnetize();
      Forge.router.set({ type: "home" });
    });

    // Force simulation
    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d) => d.id).distance((d) => 90 + (4 - (d.weight || 1)) * 18).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d) => (RADIUS[d.priority] || 12) + 14))
      .alphaDecay(0.02)
      .on("tick", () => {
        link
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

    // Apply default freshness
    applyFreshness(Date.now());
  }

  function statusClass(n) {
    if (n.status === "overdue" || (n.signature_pending_days || 0) > 14) return "overdue";
    if (n.status === "won") return "won";
    if (n.status === "lost") return "lost";
    if (n.status === "active") return "has-pending";
    return "";
  }

  function magnetize(id) {
    const neighbors = neighborsById.get(id) || new Set();
    nodeGroup.selectAll("g.node").classed("dim", (d) => d.id !== id && !neighbors.has(d.id));
    edgeGroup.selectAll("line").classed("dim", (d) => {
      const sId = (d.source.id || d.source);
      const tId = (d.target.id || d.target);
      return sId !== id && tId !== id;
    }).classed("bright", (d) => {
      const sId = (d.source.id || d.source);
      const tId = (d.target.id || d.target);
      return sId === id || tId === id;
    });

    // Magnetic pull: increase link strength temporarily by drawing connected nodes inward
    const center = nodesById.get(id);
    if (!center) return;
    nodes.forEach((n) => {
      if (neighbors.has(n.id)) {
        // Bias toward the focused node
        const dx = (center.x || width / 2) - (n.x || 0);
        const dy = (center.y || height / 2) - (n.y || 0);
        n.vx = (n.vx || 0) + dx * 0.012;
        n.vy = (n.vy || 0) + dy * 0.012;
      }
    });
    if (simulation) simulation.alphaTarget(0.18).restart();
    clearTimeout(magnetize._t);
    magnetize._t = setTimeout(() => simulation && simulation.alphaTarget(0), 600);
  }

  function clearMagnetize() {
    nodeGroup.selectAll("g.node").classed("dim", false).classed("focused", false);
    edgeGroup.selectAll("line").classed("dim", false).classed("bright", false);
    focusedId = null;
  }

  function focusNode(id) {
    const node = nodesById.get(id);
    if (!node) return;
    focusedId = id;

    nodeGroup.selectAll("g.node")
      .classed("focused", (d) => d.id === id)
      .classed("dim", (d) => d.id !== id && !(neighborsById.get(id) || new Set()).has(d.id));

    edgeGroup.selectAll("line").classed("dim", (d) => {
      const sId = (d.source.id || d.source);
      const tId = (d.target.id || d.target);
      return sId !== id && tId !== id;
    }).classed("bright", (d) => {
      const sId = (d.source.id || d.source);
      const tId = (d.target.id || d.target);
      return sId === id || tId === id;
    });

    Forge.drawer.showNode(node);

    // Camera: pan to node
    if (typeof node.x === "number" && typeof node.y === "number") {
      const cur = d3.zoomTransform(svg.node());
      const targetK = Math.max(cur.k, 1.1);
      const tx = width / 2 - node.x * targetK;
      const ty = (height * 0.35) - node.y * targetK;
      svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(targetK));
    }
  }

  function applyFreshness(asOfMs) {
    if (!Forge.time) return;
    nodeGroup.selectAll("g.node")
      .style("opacity", (d) => Forge.time.freshnessOpacity(d.last_activity, asOfMs));
  }

  function wireHud(roadmap, activity) {
    const onActivityClick = (id) => {
      Forge.drawer.close("drawer-activity");
      Forge.router.set({ type: "node", id });
      setTimeout(() => focusNode(id), 220);
    };

    const roadmapBtn = document.getElementById("open-roadmap");
    const activityBtn = document.getElementById("open-activity");
    if (roadmapBtn) roadmapBtn.addEventListener("click", (e) => { e.stopPropagation(); Forge.drawer.showRoadmap(roadmap); });
    if (activityBtn) activityBtn.addEventListener("click", (e) => { e.stopPropagation(); Forge.drawer.showActivity(activity, onActivityClick); });

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "r" || e.key === "R") Forge.drawer.showRoadmap(roadmap);
      if (e.key === "a" || e.key === "A") Forge.drawer.showActivity(activity, onActivityClick);
      if (e.key === "Escape") clearMagnetize();
    });
  }

  function wireRouter() {
    Forge.router.on((state) => {
      if (state.type === "node") focusNode(state.id);
      else if (state.type === "home") {
        Forge.drawer.closeAll();
        clearMagnetize();
      }
    });
    // Initial state
    const init = Forge.router.parse();
    if (init.type === "node") setTimeout(() => focusNode(init.id), 320);
  }

  // Resize handling
  window.addEventListener("resize", () => {
    width = stage.clientWidth;
    height = stage.clientHeight;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    bgGroup.selectAll("*").remove();
    drawBackgroundStars();
    if (simulation) {
      simulation.force("center", d3.forceCenter(width / 2, height / 2));
      simulation.alpha(0.3).restart();
    }
  });

  Forge.graph = { applyFreshness, focusNode };
})();
