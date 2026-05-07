#!/usr/bin/env node
/**
 * Forge Cockpit · graph data builder
 *
 * Walks a brain repo (markdown files with frontmatter), produces:
 *   data/nodes.json
 *   data/edges.json
 *
 * Usage:
 *   node scripts/build-graph-data.js <brain-repo-path> <output-data-dir>
 *
 * Frontmatter contract (per .md file):
 *   ---
 *   id: stable-slug         (optional, defaults to slugified file path)
 *   name: Carpenter Chartered
 *   type: deal | client | playbook | rule | doc | skill | scheduled-skill | project | idea
 *   scope: exploratory | in-progress | won | playbook | rule | doc | skill | project | idea
 *   department: sales | clients | marketing | revops | strategy | personal
 *   priority: high | medium | low
 *   status: active | overdue | won | lost | parked
 *   last_activity: 2026-05-06
 *   tags: [a, b, c]
 *   ---
 *
 * Edges come from markdown wikilinks: [[other-id]] or relative md links.
 */

const fs = require("fs");
const path = require("path");

const [, , brainPath = ".", outDir = "data"] = process.argv;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function slug(s) {
  return s.toLowerCase().replace(/\.md$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, body: text };
  const yaml = m[1];
  const body = text.slice(m[0].length);
  const meta = {};
  for (const line of yaml.split("\n")) {
    const mm = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!mm) continue;
    const k = mm[1];
    let v = mm[2].trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
    } else {
      v = v.replace(/^['"]|['"]$/g, "");
    }
    meta[k] = v;
  }
  return { meta, body };
}

function mdToHtml(md) {
  // Tiny renderer. Not full markdown, but enough for h3/p/ul/li/strong/em/links/code.
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Lists
  html = html.replace(/(^|\n)([-*] .+(?:\n[-*] .+)*)/g, (match, p, items) => {
    const lis = items.split("\n").map((l) => l.replace(/^[-*] /, "").trim()).filter(Boolean).map((s) => `<li>${s}</li>`).join("");
    return `${p}<ul>${lis}</ul>`;
  });
  // Paragraphs
  html = html.split(/\n{2,}/).map((block) => {
    if (/^<(h3|ul|p|pre|blockquote)/i.test(block.trim())) return block;
    return `<p>${block.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
  return html;
}

function buildNode(file, brainRoot) {
  const text = fs.readFileSync(file, "utf8");
  const { meta, body } = parseFrontmatter(text);
  const rel = path.relative(brainRoot, file);
  const id = meta.id || slug(rel);
  const name = meta.name || path.basename(file, ".md");

  return {
    id,
    name,
    type: meta.type || "doc",
    department: meta.department || inferDept(rel),
    scope: meta.scope || meta.type || "doc",
    priority: meta.priority || "medium",
    status: meta.status || "active",
    last_activity: meta.last_activity || new Date().toISOString().slice(0, 10),
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    body: mdToHtml(body),
    _file: rel
  };
}

function inferDept(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.includes("sales") || lower.includes("deals")) return "sales";
  if (lower.includes("clients")) return "clients";
  if (lower.includes("marketing")) return "marketing";
  if (lower.includes("revops") || lower.includes("ops") || lower.includes("skills")) return "revops";
  if (lower.includes("strategy") || lower.includes("rules")) return "strategy";
  if (lower.includes("personal") || lower.includes("ideas")) return "personal";
  return "strategy";
}

function buildEdges(node, allNodesById, file, brainRoot) {
  const text = fs.readFileSync(file, "utf8");
  const { body } = parseFrontmatter(text);
  const edges = [];
  const counts = new Map();

  // Wikilinks
  const wikis = body.match(/\[\[([^\]]+)\]\]/g) || [];
  wikis.forEach((w) => {
    const ref = w.slice(2, -2).split("|")[0].trim();
    const id = slug(ref);
    if (allNodesById.has(id) && id !== node.id) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  });

  // Relative .md links
  const rels = body.match(/\]\(([^)]+\.md)\)/g) || [];
  rels.forEach((r) => {
    const ref = r.slice(2, -1);
    const id = slug(ref);
    if (allNodesById.has(id) && id !== node.id) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  });

  for (const [target, weight] of counts) {
    edges.push({ source: node.id, target, weight, type: "explicit" });
  }
  return edges;
}

function dedupeEdges(edges) {
  const seen = new Map();
  for (const e of edges) {
    const key = [e.source, e.target].sort().join("|");
    const prev = seen.get(key);
    if (!prev || (e.weight > prev.weight)) seen.set(key, e);
  }
  return Array.from(seen.values());
}

function main() {
  if (!fs.existsSync(brainPath)) {
    console.error(`Brain path not found: ${brainPath}`);
    process.exit(1);
  }
  const files = walk(brainPath);
  if (!files.length) {
    console.error("No .md files found.");
    process.exit(1);
  }

  const nodes = files.map((f) => buildNode(f, brainPath));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  let edges = [];
  for (const file of files) {
    const node = nodes.find((n) => n._file === path.relative(brainPath, file));
    if (!node) continue;
    edges.push(...buildEdges(node, nodesById, file, brainPath));
  }
  edges = dedupeEdges(edges);

  // Strip internal fields
  const cleanNodes = nodes.map(({ _file, ...rest }) => rest);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "nodes.json"), JSON.stringify(cleanNodes, null, 2));
  fs.writeFileSync(path.join(outDir, "edges.json"), JSON.stringify(edges, null, 2));

  console.log(`Wrote ${cleanNodes.length} nodes, ${edges.length} edges to ${outDir}/`);
}

main();
