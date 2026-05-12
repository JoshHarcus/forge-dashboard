#!/usr/bin/env node
/**
 * build-graph.js
 *
 * Walks the consolidated Forge brain tree, parses YAML frontmatter from every
 * markdown file, and emits nodes.json + edges.json for the cockpit graph view.
 *
 * Run after consolidate.sh + merge-brain-backfill.sh, before deploy.sh.
 *
 * Usage:
 *   node build-graph.js <forge-hq-root>
 *   node build-graph.js .                 (if cwd is forge-hq/)
 *
 * Output:
 *   <root>/cockpit/data/nodes.json
 *   <root>/cockpit/data/edges.json
 *
 * Schema (matches the existing cockpit v2 expectations):
 *
 * Node {
 *   id: string              // unique, derived from relative path
 *   label: string           // from frontmatter.name
 *   type: string            // from frontmatter.type (deal, contact, document, etc.)
 *   source: string          // hubspot, drive, slack, gmail, gong, asana, backfill, conversation
 *   client: string|null     // for client-scoped nodes
 *   depth: number           // 0-4 from frontmatter.depth or default 1
 *   priority: number        // 1-5 derived from type + status
 *   description: string
 *   url: string             // source_url if present
 *   captured_at: string     // ISO date
 *   tags: string[]
 * }
 *
 * Edge {
 *   source: string          // node id
 *   target: string          // node id
 *   relationship_type: string  // verb phrase
 *   weight: number          // 1-5
 * }
 */

const fs = require('fs');
const path = require('path');

// ---------- args ----------

const root = process.argv[2] || '.';
const rootAbs = path.resolve(root);
const brainDir = path.join(rootAbs, 'brain');
const cockpitDataDir = path.join(rootAbs, 'cockpit', 'data');

if (!fs.existsSync(brainDir)) {
  console.error(`Brain directory not found at ${brainDir}`);
  console.error(`Run consolidate.sh + merge-brain-backfill.sh first.`);
  process.exit(1);
}

if (!fs.existsSync(cockpitDataDir)) {
  fs.mkdirSync(cockpitDataDir, { recursive: true });
}

// ---------- frontmatter parser ----------

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { frontmatter: {}, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { frontmatter: {}, body: content };
  const fmText = content.slice(4, end).trim();
  const body = content.slice(end + 4).trim();
  const fm = {};
  let currentKey = null;
  let inList = false;
  let inMultiline = false;
  let multilineKey = null;
  const lines = fmText.split('\n');
  for (const line of lines) {
    if (inMultiline) {
      if (line.match(/^\S/)) {
        inMultiline = false;
      } else {
        fm[multilineKey] += ' ' + line.trim();
        continue;
      }
    }
    if (line.match(/^\s*-\s*/)) {
      // list item
      if (currentKey) {
        if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
        const val = line.replace(/^\s*-\s*/, '').trim();
        if (val) fm[currentKey].push(stripQuotes(val));
      }
      continue;
    }
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const rawVal = line.slice(colon + 1).trim();
    currentKey = key;
    if (rawVal === '' || rawVal === '[]') {
      fm[key] = rawVal === '[]' ? [] : null;
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      fm[key] = rawVal.slice(1, -1).split(',').map(s => stripQuotes(s.trim())).filter(Boolean);
    } else {
      fm[key] = stripQuotes(rawVal);
    }
  }
  return { frontmatter: fm, body };
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------- walker ----------

function walk(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, callback);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      callback(full);
    }
  }
}

// ---------- node + edge construction ----------

const nodes = [];
const nodeIndex = {};
const edgeSet = new Set();
const edges = [];

function nodeId(absPath) {
  return path.relative(brainDir, absPath).replace(/\.md$/, '').replace(/\//g, '__');
}

function deriveType(fm, filePath) {
  if (fm.type) return fm.type;
  const rel = path.relative(brainDir, filePath);
  if (rel.includes('CLIENT-SUMMARY')) return 'client_summary';
  if (rel.includes('curated/decisions')) return 'decision';
  if (rel.includes('curated/playbooks')) return 'playbook';
  if (rel.includes('curated/rules')) return 'rule';
  if (rel.includes('work/conversations')) return 'conversation';
  if (rel.includes('hubspot/deals')) return 'deal';
  if (rel.includes('hubspot/contacts')) return 'contact';
  if (rel.includes('hubspot/companies')) return 'company';
  if (rel.includes('hubspot/activities')) return 'activity';
  if (rel.includes('hubspot/owners')) return 'owner';
  if (rel.includes('asana/tasks')) return 'task';
  if (rel.includes('asana/projects')) return 'project';
  if (rel.includes('drive')) return 'document';
  if (rel.includes('slack')) return 'slack_channel';
  if (rel.includes('gmail')) return 'email_thread';
  if (rel.includes('gong')) return 'call';
  return 'document';
}

function deriveSource(fm, filePath) {
  if (fm.source) return fm.source;
  const rel = path.relative(brainDir, filePath);
  if (rel.startsWith('hubspot/')) return 'hubspot';
  if (rel.startsWith('asana/')) return 'asana';
  if (rel.startsWith('drive/')) return 'drive';
  if (rel.startsWith('slack/')) return 'slack';
  if (rel.startsWith('gmail/')) return 'gmail';
  if (rel.startsWith('gong/')) return 'gong';
  if (rel.startsWith('curated/') || rel.startsWith('work/')) return 'backfill';
  return 'unknown';
}

function deriveClient(fm, filePath) {
  if (fm.client) return fm.client;
  const rel = path.relative(brainDir, filePath);
  const match = rel.match(/(?:drive\/clients|extracted\/drive\/clients)\/([^/]+)/);
  if (match) return match[1];
  if (rel.match(/(carpenter|hansen|mediafly|gme|casepacer|ensight|seda|marin|blg|bronson|napoli|nspr)/i)) {
    return rel.match(/(carpenter|hansen|mediafly|gme|casepacer|ensight|seda|marin|blg|bronson|napoli|nspr)/i)[1].toLowerCase();
  }
  return null;
}

function priorityForType(type, fm) {
  if (type === 'decision' || type === 'playbook') return 5;
  if (type === 'client_summary') return 5;
  if (type === 'rule') return 4;
  if (type === 'deal' && fm.status === 'active') return 4;
  if (type === 'conversation') return 4;
  if (type === 'project') return 3;
  if (type === 'document') return 2;
  return 2;
}

// First pass: collect nodes
walk(brainDir, (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm } = parseFrontmatter(content);
    const id = nodeId(filePath);
    const type = deriveType(fm, filePath);
    const source = deriveSource(fm, filePath);
    const client = deriveClient(fm, filePath);
    const node = {
      id,
      label: fm.name || path.basename(filePath, '.md'),
      type,
      source,
      client,
      depth: parseInt(fm.depth) || 1,
      priority: priorityForType(type, fm),
      description: fm.description || '',
      url: fm.source_url || fm.url || '',
      captured_at: fm.captured_at || fm.created || '',
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      _path: path.relative(rootAbs, filePath),
    };
    nodes.push(node);
    nodeIndex[id] = node;

    // Track related: for edge construction
    node._related = Array.isArray(fm.related) ? fm.related : [];
  } catch (e) {
    console.warn(`Failed to parse ${filePath}: ${e.message}`);
  }
});

console.log(`Collected ${nodes.length} nodes.`);

// Second pass: build edges
function addEdge(source, target, verb, weight) {
  if (source === target) return;
  if (!nodeIndex[source] || !nodeIndex[target]) return;
  const key = `${source}|${target}|${verb}`;
  if (edgeSet.has(key)) return;
  edgeSet.add(key);
  edges.push({ source, target, relationship_type: verb, weight: weight || 1 });
}

// Edge type 1: explicit related: frontmatter
for (const node of nodes) {
  for (const rel of node._related) {
    const relId = rel.replace(/\.md$/, '').replace(/\//g, '__');
    addEdge(node.id, relId, 'references', 2);
  }
}

// Edge type 2: client clustering
const clientNodes = {};
for (const node of nodes) {
  if (node.client) {
    if (!clientNodes[node.client]) clientNodes[node.client] = [];
    clientNodes[node.client].push(node);
  }
}
for (const [client, members] of Object.entries(clientNodes)) {
  // Find or create a client-summary hub
  let hub = members.find(m => m.type === 'client_summary');
  if (!hub && members.length >= 3) {
    // Use the most central member (deal node if present, else first)
    hub = members.find(m => m.type === 'deal') || members[0];
  }
  if (hub) {
    for (const member of members) {
      if (member.id !== hub.id) {
        addEdge(member.id, hub.id, 'belongs to client', 1);
      }
    }
  }
}

// Edge type 3: source-source linkage (e.g., deal node references its company)
for (const node of nodes) {
  if (node.type === 'deal' && node.client) {
    const company = nodes.find(n => n.type === 'company' && n.client === node.client);
    if (company) addEdge(node.id, company.id, 'sold to', 3);
  }
  if (node.type === 'contact' && node.client) {
    const company = nodes.find(n => n.type === 'company' && n.client === node.client);
    if (company) addEdge(node.id, company.id, 'works at', 2);
  }
}

// Edge type 4: parent-child by path hierarchy
const dirIndex = {};
for (const node of nodes) {
  const dir = path.dirname(node._path);
  if (!dirIndex[dir]) dirIndex[dir] = [];
  dirIndex[dir].push(node);
}

console.log(`Built ${edges.length} edges.`);

// ---------- output ----------

// Strip internal _-prefixed fields before writing
const cleanNodes = nodes.map(n => {
  const c = { ...n };
  delete c._related;
  delete c._path;
  return c;
});

const nodesPath = path.join(cockpitDataDir, 'nodes.json');
const edgesPath = path.join(cockpitDataDir, 'edges.json');

fs.writeFileSync(nodesPath, JSON.stringify(cleanNodes, null, 2));
fs.writeFileSync(edgesPath, JSON.stringify(edges, null, 2));

console.log(`\nWrote ${cleanNodes.length} nodes to ${path.relative(rootAbs, nodesPath)}`);
console.log(`Wrote ${edges.length} edges to ${path.relative(rootAbs, edgesPath)}`);

// Summary by type
const byType = {};
for (const n of cleanNodes) {
  byType[n.type] = (byType[n.type] || 0) + 1;
}
console.log(`\nNode counts by type:`);
for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(20)} ${count}`);
}

// Summary by source
const bySource = {};
for (const n of cleanNodes) {
  bySource[n.source] = (bySource[n.source] || 0) + 1;
}
console.log(`\nNode counts by source:`);
for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${source.padEnd(20)} ${count}`);
}

// Update extraction-state.json totals if it exists
const statePath = path.join(rootAbs, 'extraction-state.json');
if (fs.existsSync(statePath)) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    state.totals = state.totals || {};
    state.totals.nodes = cleanNodes.length;
    state.totals.by_source = bySource;
    state.totals.by_type = byType;
    state.last_updated = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log(`\nUpdated ${path.relative(rootAbs, statePath)}`);
  } catch (e) {
    console.warn(`Couldn't update extraction-state.json: ${e.message}`);
  }
}

console.log(`\nDone. Next: ./scripts/deploy.sh`);
