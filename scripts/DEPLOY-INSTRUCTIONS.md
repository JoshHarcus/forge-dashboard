# Deploy instructions

For Josh, on his Mac, the morning after the Phase 1 build.

## What you have

Phase 1 produced a working hub shell at `outputs/forge-hq/`. Three placeholder decision docs demonstrate the structure. Everything renders, but the brain tree is mostly empty pending consolidation.

Phase 2 runs three scripts, in order, on your machine.

## Order of operations

| # | Script | Duration | What it does | What to verify |
|---|---|---|---|---|
| 1 | `consolidate.sh` | 30-60s | Walks the six Cowork session folders, copies extracted markdown into `brain/extracted/{hubspot,drive,comms}/`, updates `extraction-state.json`, regenerates `brain/manifest.json`. | Counts in extraction-state.json match what the script reports. No FAIL lines in the log. |
| 2 | `merge-brain-backfill.sh` | 5-15s | Copies the 9 brain backfill docs from the Dispatch parent session into `brain/curated/`. Stamps `visible_to: [josh]` on any doc missing the field. | 9 files copied. Spot-check one doc has visible_to set. |
| 3 | `deploy.sh` | 10-30s | Backs up current dashboard repo state, moves existing v2 cockpit to `/cockpit/`, copies hub files into root, commits, pushes to gh-pages. | Live URLs respond (give it 30-90s after push). Cockpit still works at /cockpit/ with password 1835. |

## Step by step

```bash
cd ~/path/to/forge-hq    # wherever you placed the Phase 1 outputs

# Step 1: consolidate
./scripts/consolidate.sh
# Expect counts roughly:
#   HubSpot/Asana: 2,670
#   Drive:         429
#   Slack/Gmail/Gong: 68
# Conflicts > 0 is fine, just means the same node was extracted twice.
# Open scripts/consolidate.log if anything looks off.

# Step 2: merge backfill
# You need the Dispatch parent session's outputs/forge-backfill/ path.
# That session ID will look like local_<uuid>. Find it under:
#   ~/Library/Application Support/Claude/local-agent-mode-sessions/<...>/<sessionId>/outputs/forge-backfill
# Then:
./scripts/merge-brain-backfill.sh "/path/to/dispatch-parent/outputs/forge-backfill"
# Or just run it without args and it will prompt.

# Optional: re-run consolidate to refresh the manifest after the backfill
./scripts/consolidate.sh

# Step 3: deploy
# First time: dry-run to see what will happen
./scripts/deploy.sh --dry-run

# Then for real
./scripts/deploy.sh
```

## What to verify after deploy

1. Open `https://joshharcus.github.io/forge-dashboard/` (no password). Hub homepage should render with eggshell cream background, FORGE HQ wordmark top-left, lede headline, status bar with node counts, eight nav cards in a 4-up grid.

2. Open `https://joshharcus.github.io/forge-dashboard/cockpit/`. Should prompt for password. Enter 1835. Graph should render in deep navy with the same nodes as before.

3. Open `https://joshharcus.github.io/forge-dashboard/brain/`. Tree should show curated/decisions/ expanded with three or more entries. Click one. It should render with the editorial styling.

4. Open `https://joshharcus.github.io/forge-dashboard/decisions/`. List should match the manifest count. Click any entry, it should jump to the brain doc browser with that doc loaded.

## If something is wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Cockpit URL 404s | deploy.sh did not move files into /cockpit/ correctly | check git log on the gh-pages branch, restore from backup branch listed in deploy.log |
| Brain docs do not render | marked.js failed to load (offline) or wrong path | check browser console; the `?doc=` URL should be relative to /brain/ |
| Counts in extraction-state.json look wrong | one of the six sessions had a different folder shape | open consolidate.log, find the failing session, adjust the SESSIONS array in consolidate.sh |
| Cockpit hash routes broken | base URL changed | the cockpit was at root, now at /cockpit/. internal hash links should still work because they are relative. if they reference absolute paths, fix in the cockpit source |
| Deploy fails on push | gh-pages branch protected or auth missing | run `gh auth status`, verify `git push` works manually from `~/code/forge-dashboard` |

## Backout

`deploy.sh` creates a backup branch named `pre-hub-backup-<timestamp>` before any restructure. To revert:

```bash
cd ~/code/forge-dashboard
git checkout gh-pages
git reset --hard pre-hub-backup-<timestamp>
git push --force-with-lease origin gh-pages
```

## Total expected runtime

About 2 minutes of script work, plus 1 to 2 minutes for gh-pages to propagate. Call it 5 minutes start to finish.

## After deploy

- Move the three sample decision docs out of the deploy if the real backfill includes them under different names. The samples are: hub-cockpit-split, federated-identity, extraction-strategy.
- Add real GTM artifact files (`gtm-decision-brief.html`, `diagnostic.html`) to `forge-hq/artifacts/` and re-run deploy.sh.
- The `extraction-state.json` `open_enrichment_questions` is hardcoded to 12 in Phase 1. Update by hand or wire it to a real source later.
