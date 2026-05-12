#!/usr/bin/env bash
# merge-brain-backfill.sh
#
# Copies the brain backfill docs from the Dispatch parent session's
# outputs/forge-backfill/ directory into forge-hq/brain/curated/.
# Default-stamps any doc missing visible_to with [josh] for safety,
# then re-runs the manifest builder.
#
# Usage:
#   ./scripts/merge-brain-backfill.sh /path/to/dispatch-parent-outputs/forge-backfill
#
# If no path is given, prompts for one.

set -euo pipefail

HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$HUB_ROOT/scripts/merge-brain-backfill.log"
: > "$LOG_FILE"

log() { printf '[merge-backfill] %s\n' "$1" | tee -a "$LOG_FILE"; }
warn() { printf '[merge-backfill] WARN: %s\n' "$1" | tee -a "$LOG_FILE" >&2; }
fail() { printf '[merge-backfill] FAIL: %s\n' "$1" | tee -a "$LOG_FILE" >&2; exit 1; }

BACKFILL_SRC="${1:-}"
if [ -z "$BACKFILL_SRC" ]; then
  read -r -p "Path to dispatch parent backfill (e.g. ~/.../local_<id>/outputs/forge-backfill): " BACKFILL_SRC
fi
BACKFILL_SRC="${BACKFILL_SRC/#\~/$HOME}"

[ -d "$BACKFILL_SRC" ] || fail "backfill source not found: $BACKFILL_SRC"

CURATED_DST="$HUB_ROOT/brain/curated"
mkdir -p "$CURATED_DST/decisions" "$CURATED_DST/threads" "$CURATED_DST/people" "$CURATED_DST/projects" "$CURATED_DST/playbooks"

log "source:      $BACKFILL_SRC"
log "destination: $CURATED_DST"

COPIED=0
STAMPED=0

# Walk the backfill tree. We expect the same shape as our curated tree
# (decisions/, threads/, people/, projects/, playbooks/). If the parent
# uses a flatter shape, copy everything to curated/ root and let humans
# refile.
while IFS= read -r -d '' src_md; do
  rel="${src_md#$BACKFILL_SRC/}"
  dst="$CURATED_DST/$rel"
  dst_dir="$(dirname "$dst")"
  mkdir -p "$dst_dir"

  # Read the file. If it lacks a visible_to: line in frontmatter, inject
  # visible_to: [josh] as a safe default so it does not accidentally render
  # publicly without explicit permission.
  if head -n 1 "$src_md" | grep -q '^---'; then
    if ! awk '/^---/{c++; next} c==1' "$src_md" | grep -q '^visible_to:'; then
      # Inject visible_to: [josh] at end of frontmatter block
      awk 'BEGIN{c=0; ins=0}
           /^---/{c++; if (c==2 && !ins) {print "visible_to: [josh]"; ins=1} print; next}
           {print}' "$src_md" > "$dst"
      STAMPED=$((STAMPED + 1))
    else
      cp "$src_md" "$dst"
    fi
  else
    # No frontmatter at all. Wrap with a default frontmatter block.
    {
      echo "---"
      echo "visible_to: [josh]"
      echo "source: brain-backfill"
      echo "imported_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "---"
      echo ""
      cat "$src_md"
    } > "$dst"
    STAMPED=$((STAMPED + 1))
  fi
  COPIED=$((COPIED + 1))
done < <(find "$BACKFILL_SRC" -type f -name '*.md' -print0)

log ""
log "==== summary ===="
log "Copied:  $COPIED"
log "Stamped (visible_to defaulted to [josh]): $STAMPED"
log ""

# Re-run manifest builder if consolidate.sh helper exists
if [ -x "$HUB_ROOT/scripts/consolidate.sh" ]; then
  log "Tip: re-run ./scripts/consolidate.sh to rebuild brain/manifest.json"
fi

log "Next: run ./scripts/deploy.sh"
