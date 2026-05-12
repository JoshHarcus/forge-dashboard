/* FORGE HQ — shared client JS
 *
 * Responsibilities:
 *   - Render the masthead nav consistently
 *   - Lazy-load and render markdown via marked.js (CDN)
 *   - Parse YAML-ish frontmatter and respect visible_to gating
 *   - Provide tree view of brain/curated and brain/work
 *   - Stamp build timestamp from extraction-state.json
 */

const FORGE = {
  ROOT: '',  // computed below based on page depth
  ALLOWED_VISIBILITY: ['josh', 'internal-huify', 'public'],
  STATE: null
};

// Detect how deep this page sits so relative links work both locally and on gh-pages.
(function computeRoot() {
  const path = window.location.pathname.replace(/\/+$/, '');
  // Strip filename if present
  const segs = path.split('/').filter(Boolean);
  // If last segment ends in .html, it's a file; otherwise a dir
  const last = segs[segs.length - 1] || '';
  const isFile = last.endsWith('.html');
  const dirSegs = isFile ? segs.slice(0, -1) : segs;

  // The hub root is the path *after* the gh-pages base. We don't know the base
  // statically, so we use ../ count from the current depth within forge-hq.
  // Convention: hub pages live at /, /brain/, /gtm/, /extraction/, etc.
  // For local dev served from forge-hq/ root, dirSegs may include 'brain'.
  const knownTops = ['brain', 'gtm', 'extraction', 'decisions', 'conversations', 'artifacts', 'about', 'cockpit'];
  const topIdx = dirSegs.findIndex(s => knownTops.includes(s));
  let depth;
  if (topIdx === -1) {
    depth = 0;
  } else {
    depth = dirSegs.length - topIdx;
  }
  FORGE.ROOT = depth === 0 ? './' : '../'.repeat(depth);
})();

function rel(p) {
  if (p.startsWith('http')) return p;
  return FORGE.ROOT + p.replace(/^\/+/, '');
}

/* -------- masthead -------- */
function renderMasthead(active) {
  const el = document.querySelector('header.masthead');
  if (!el) return;
  const links = [
    ['Brain', 'brain/'],
    ['Cockpit', 'cockpit/'],
    ['GTM', 'gtm/'],
    ['Extraction', 'extraction/'],
    ['Decisions', 'decisions/'],
    ['Artifacts', 'artifacts/'],
    ['About', 'about/']
  ];
  el.innerHTML = `
    <div class="wordmark"><a href="${rel('')}">FORGE HQ</a><span class="tag">Hüify operational brain</span></div>
    <nav class="toplinks">
      ${links.map(([name, href]) => `<a href="${rel(href)}" class="${active === name.toLowerCase() ? 'active' : ''}">${name}</a>`).join('')}
    </nav>
  `;
}

/* -------- footer -------- */
function renderFooter() {
  const el = document.querySelector('footer.foot');
  if (!el) return;
  const ts = (FORGE.STATE && FORGE.STATE.build_timestamp) || new Date().toISOString();
  el.innerHTML = `
    <div>BUILD ${ts.replace('T', ' ').replace(/\..+/, '').slice(0, 16)} · FORGE HQ v1</div>
    <div><span class="gate">/cockpit gated · 1835</span> · <a href="${rel('about/')}">about</a> · josh@huify.com</div>
  `;
}

/* -------- state loader -------- */
async function loadState() {
  if (FORGE.STATE) return FORGE.STATE;
  try {
    const res = await fetch(rel('extraction-state.json'), { cache: 'no-store' });
    if (!res.ok) throw new Error('state missing');
    FORGE.STATE = await res.json();
  } catch (e) {
    FORGE.STATE = { last_sync: null, total_nodes: 0, sources: [], build_timestamp: new Date().toISOString() };
  }
  return FORGE.STATE;
}

/* -------- frontmatter parser -------- */
function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  m[1].split('\n').forEach(line => {
    const kv = line.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/);
    if (!kv) return;
    let val = kv[2].trim();
    // strip wrapping quotes
    val = val.replace(/^["'](.*)["']$/, '$1');
    // arrays in inline form: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["'](.*)["']$/, '$1'));
    }
    meta[kv[1]] = val;
  });
  return { meta, body: m[2] };
}

function isVisible(meta) {
  if (!meta || !meta.visible_to) return true;  // unspecified = default open
  const list = Array.isArray(meta.visible_to) ? meta.visible_to : [meta.visible_to];
  // If any allowed value matches, render. Anything outside the allowlist (e.g. josh-only) is hidden.
  return list.some(v => FORGE.ALLOWED_VISIBILITY.includes(v));
}

/* -------- markdown loader -------- */
let _markedReady = null;
function ensureMarked() {
  if (window.marked) return Promise.resolve();
  if (_markedReady) return _markedReady;
  _markedReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('marked failed to load'));
    document.head.appendChild(s);
  });
  return _markedReady;
}

async function loadDoc(path, target) {
  await ensureMarked();
  target.innerHTML = '<div class="loading">loading…</div>';
  try {
    const res = await fetch(rel(path), { cache: 'no-store' });
    if (!res.ok) throw new Error('doc not found: ' + path);
    const text = await res.text();
    const { meta, body } = parseFrontmatter(text);

    if (!isVisible(meta)) {
      target.innerHTML = `<div class="notice"><strong>Restricted.</strong> This document is gated to a narrower audience than the public hub. Ask Josh if you need access.</div>`;
      return;
    }

    const fmHtml = Object.keys(meta).length
      ? `<div class="frontmatter">${
          Object.entries(meta).map(([k, v]) =>
            `<span><span class="k">${k}</span> <span class="v">${Array.isArray(v) ? v.join(', ') : v}</span></span>`
          ).join('')
        }</div>`
      : '';

    target.innerHTML = fmHtml + window.marked.parse(body);
  } catch (e) {
    target.innerHTML = `<div class="notice"><strong>Doc not found.</strong> Path: <code>${path}</code><br>This is expected before Phase 2 consolidation runs. The shell is in place; content arrives when <code>consolidate.sh</code> + <code>merge-brain-backfill.sh</code> are executed.</div>`;
  }
}

/* -------- tree builder -------- */
async function buildTree(manifestPath, target) {
  try {
    const res = await fetch(rel(manifestPath), { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const manifest = await res.json();
    target.innerHTML = renderTree(manifest);
  } catch (e) {
    target.innerHTML = `<div class="loading">no manifest yet · run consolidate.sh to populate</div>`;
  }
}

function renderTree(node, prefix = '') {
  if (Array.isArray(node)) {
    return `<ul>${node.map(item => {
      if (typeof item === 'string') {
        const name = item.split('/').pop().replace(/\.md$/, '');
        return `<li><a href="?doc=${encodeURIComponent(prefix + item)}">${name}</a></li>`;
      } else {
        return renderTree(item, prefix);
      }
    }).join('')}</ul>`;
  }
  if (typeof node === 'object') {
    return Object.entries(node).map(([k, v]) =>
      `<details ${prefix === '' ? 'open' : ''}><summary>${k}</summary>${renderTree(v, prefix + k + '/')}</details>`
    ).join('');
  }
  return '';
}

/* -------- doc page route -------- */
function getDocParam() {
  const u = new URL(window.location.href);
  return u.searchParams.get('doc');
}

/* -------- bar render helper -------- */
function renderBars(target, sources, totalNodes) {
  const max = Math.max(...sources.map(s => s.count), 1);
  target.innerHTML = `
    ${sources.map(s => {
      const pct = (s.count / max) * 100;
      const cls = s.color === 'rust' ? 'rust' : s.color === 'olive' ? 'olive' : s.color === 'muted' ? 'muted' : '';
      return `<div class="row">
        <div class="src">${s.name}</div>
        <div class="bar ${cls}"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="n">${s.count.toLocaleString()}</div>
      </div>`;
    }).join('')}
    <div class="total"><div>TOTAL</div><div class="n">${totalNodes.toLocaleString()}</div></div>
  `;
}

/* -------- exports -------- */
window.FORGE_HUB = {
  rel,
  renderMasthead,
  renderFooter,
  loadState,
  loadDoc,
  buildTree,
  getDocParam,
  renderBars,
  parseFrontmatter,
  isVisible
};
