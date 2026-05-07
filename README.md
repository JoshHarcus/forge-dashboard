# Forge Cockpit

Graph-as-home navigation for the federated identity brain. Live at https://joshharcus.github.io/forge-dashboard/.

The home page is the graph. No menu bar. No tabs. Click a node, content drawer slides up. Hover, related nodes drift toward you. Time slider at the bottom recalibrates opacity to show what was active at any point. Day, night, focus modes. Mobile gestures.

## Using the site

Password gate uses SHA256 of `1835`. Once unlocked, your browser remembers it via localStorage so reloads keep you in.

Once inside:

- Click any node, drawer slides up with the node's content
- Drag empty space to pan, scroll or pinch to zoom
- Top-right toggles day, night, and focus modes
- Bottom strip is a time slider, drag it to see how the brain looked at any past moment
- Press `R` or click `Roadmap` for the shipping checklist
- Press `A` or click `Recently` for the activity feed
- Press `Esc` to clear focus and close drawers

Mobile:

- Pinch to zoom
- Long-press a node to pin it to center
- Swipe up on a node to open its drawer
- Swipe down on the drawer to close it

Deep links work: `#/node/carpenter-chartered` opens the graph focused on that node.

## How to deploy

```bash
# Once. Clone the GitHub Pages repo.
git clone git@github.com:JoshHarcus/forge-dashboard.git ~/code/forge-dashboard

# Whenever you want to ship.
cd /path/to/forge-cockpit
bash deploy.sh
```

The deploy script copies everything in this folder into `~/code/forge-dashboard`, commits, and pushes. GitHub Pages picks it up in about two minutes.

Override the destination:
```bash
FORGE_DASHBOARD_PATH=/elsewhere/forge-dashboard bash deploy.sh
```

## How the brain feeds the graph

The cockpit reads `data/nodes.json` and `data/edges.json`. Those get rebuilt from `~/code/josh-identity` (or wherever the brain repo lives) by:

```bash
bash scripts/build-graph-data.sh ~/code/josh-identity
```

That walks the repo, parses frontmatter from every `.md` file, and writes `data/nodes.json` and `data/edges.json` here. Cross-references between markdown files become edges.

### Frontmatter contract

Each `.md` file in the brain repo should declare:

```yaml
---
id: stable-slug
name: Carpenter Chartered
type: deal
scope: exploratory
department: sales
priority: high
status: active
last_activity: 2026-05-06
tags: [accounting, advisor-frame]
---
```

Fields:

- `id`: stable slug, used in deep links and edge references. Optional, defaults to slugified file path.
- `name`: human-readable label shown on the node and drawer header.
- `type`: deal, client, playbook, rule, doc, skill, scheduled-skill, project, idea
- `scope`: more specific shape inside the type (exploratory, in-progress, won, etc.)
- `department`: sales, clients, marketing, revops, strategy, personal. Drives node color.
- `priority`: high, medium, low. Drives node radius (24, 16, 10).
- `status`: active, overdue, won, lost, parked. Drives halo style.
- `last_activity`: ISO date. Drives opacity via the freshness curve (100 percent at 0 to 7 days, dropping to 20 percent past 90 days).
- `tags`: free-form list.

Edges come from wikilinks (`[[other-id]]`) or relative markdown links (`[link](other-file.md)`).

## Scheduled rebuilds

`.github/workflows/deploy.yml` runs daily at 3am Pacific (and on manual workflow_dispatch). It:

1. Checks out this repo and the brain repo
2. Re-runs `build-graph-data.js`
3. Appends an entry to `activity.json`
4. Commits and pushes if anything changed

GitHub Pages serves the new files on the next build cycle, no separate deploy step needed.

If the brain repo is private, set a `BRAIN_PAT` repository secret with a personal access token that has read access. Otherwise the workflow falls back to leaving existing data in place.

## File layout

```
forge-cockpit/
  index.html              password gate
  app.html                cockpit shell
  data/
    nodes.json            graph nodes (one per brain file)
    edges.json            graph edges (cross-references)
    nodes.example.json    fallback if rebuild fails
    roadmap.json          shipping checklist
    activity.json         recent log entries
  styles/
    system.css            tokens, modes, drawers, HUD
    graph.css             nodes, edges, halos
  scripts/
    router.js             hash-based deep linking
    drawer.js             drawer open/close + content
    modes.js              day, night, focus
    time.js               slider + freshness curve
    gestures.js           long-press, swipe-down
    graph.js              D3 force graph, magnetism, click handlers
    build-graph-data.js   brain → nodes.json + edges.json
    build-graph-data.sh   wrapper
  deploy.sh               one-command deploy
  .github/workflows/
    deploy.yml            scheduled rebuild action
```

## Phase 2 (this week)

Three big upgrades, in order of impact:

1. Three.js depth. Departments occupy distinct Z layers so the graph reads as a 3D space, not a flat web. Camera dolly when you focus a node.
2. Wormhole transitions. Click a node, camera warps through it into the drawer view, no jump cut.
3. Real magnetic physics. Replace the current velocity nudge with proper attraction-repulsion forces tuned per edge weight.

Plus: voice nav (`show me Carpenter`), AI-suggested latent connections rendered as faint dotted edges.

## Phase 3 (next two weeks)

1. PWA install. Manifest, service worker, home screen icon, full-screen on mobile.
2. Auto-pull from josh-identity. No commit, no rebuild step. The cockpit watches the repo.
3. Real-time activity stream. Commits push events live to the graph. New nodes appear with a particle trail along the edges that connect them.
4. Two-repo federation. When huify-identity exists, dual-source. Filter by repo with one toggle.

## What got cut from MVP

Nothing was cut from the spec, but a few things were stubbed rather than fully built:

- AI-discovered latent connections render with the dotted edge style (the data shape supports it via `type: latent` in `edges.json`), but no AI is producing those edges yet. The single example latent edge between Plus One MMO and Mediafly is hand-authored.
- Two-finger rotate on touch is honored where the OS sends `gesturechange` events, but a proper rotation gizmo is Phase 2.
- Markdown rendering in the drawer is intentionally minimal. The build script supports h3, lists, code, links, bold, italic. Anything more complex should be authored as HTML inside the markdown body.

## Voice and copy

No emdashes. No corporate filler. Sparse copy. The graph speaks for itself.
