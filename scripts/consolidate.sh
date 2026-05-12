#!/usr/bin/env bash
# consolidate.sh
#
# Walks the six known Cowork session folders from the night of 2026-05-08,
# copies extracted markdown nodes into forge-hq/brain/extracted/{source}/,
# updates extraction-state.json with actual counts, regenerates the brain
# manifest, and reports duplicates or conflicts.
#
# Idempotent: safe to re-run. Latest-wins on conflict, with both versions
# preserved under brain/extracted/{source}/_conflicts/.
#
# Usage:
#   cd forge-hq
#   ./scripts/consolidate.sh
#
# Requires: bash 4+, jq, rsync, find, awk. macOS default bash is 3.x but the
# script falls back to portable constructs.

set -euo pipefail

# -------- paths --------
HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COWORK_ROOT="$HOME/Library/Application Support/Claude/local-agent-mode-sessions/d50f4af2-5990-4218-bad4-7a0efaf8e0c2/c673142a-9fa7-4d8c-a2aa-ecfce1304598"
EXTRACTED_DIR="$HUB_ROOT/brain/extracted"
STATE_FILE="$HUB_ROOT/extraction-state.json"
MANIFEST_FILE="$HUB_ROOT/brain/manifest.json"
LOG_FILE="$HUB_ROOT/scripts/consolidate.log"

mkdir -p "$EXTRACTED_DIR/hubspot" "$EXTRACTED_DIR/drive" "$EXTRACTED_DIR/comms"
: > "$LOG_FILE"

# -------- session map --------
# Each entry: SESSION_ID|TARGET_SUBDIR|EXTRACTED_SUBPATH
SESSIONS=(
  "local_fc8c9015-47f0-44a6-96da-93afea2ea5d5|hubspot|outputs/forge-extracted"
  "local_bd10d68c-43c8-406a-b955-56087df5de89|hubspot|outputs/forge-extracted"
  "local_d9d55bc5-c5b7-4e05-bc23-eac940dd0404|drive|outputs/forge-extracted/drive"
  "local_4f8100c0-1ec3-46ea-b899-cb6cc1f5ddc0|drive|outputs/forge-extracted/drive"
  "local_7d03594a-bf26-41cd-afb4-954e1401f8d7|comms|outputs/forge-extracted"
  "local_d26814a2-73b7-4d46-85f4-6751fa3145fe|comms|outputs/forge-extracted"
)

log() { printf '[consolidate] %s\n' "$1" | tee -a "$LOG_FILE"; }
warn() { printf '[consolidate] WARN: %s\n' "$1" | tee -a "$LOG_FILE" >&2; }
fail() { printf '[consolidate] FAIL: %s\n' "$1" | tee -a "$LOG_FILE" >&2; exit 1; }

# -------- preflight --------
command -v jq >/dev/null 2>&1 || fail "jq is required. brew install jq"
command -v rsync >/dev/null 2>&1 || fail "rsync is required (ships with macOS)"
[ -d "$COWORK_ROOT" ] || fail "Cowork sessions directory not found: $COWORK_ROOT"

log "hub root: $HUB_ROOT"
log "cowork root: $COWORK_ROOT"

# -------- counters --------
TOTAL_HUBSPOT=0
TOTAL_DRIVE=0
TOTAL_COMMS=0
CONFLICTS=0

# -------- copy loop --------
for entry in "${SESSIONS[@]}"; do
  SESSION_ID="${entry%%|*}"
  rest="${entry#*|}"
  TARGET="${rest%%|*}"
  SRC_SUB="${rest#*|}"

  SRC="$COWORK_ROOT/$SESSION_ID/$SRC_SUB"
  DST="$EXTRACTED_DIR/$TARGET"

  log "session $SESSION_ID -> $TARGET"

  if [ ! -d "$SRC" ]; then
    warn "source missing, skipping: $SRC"
    continue
  fi

  # Find all .md files under SRC. For each, decide if it conflicts with an
  # existing file at DST (same relative path). If yes, move existing to
  # _conflicts and copy new in.
  while IFS= read -r -d '' md_path; do
    rel_path="${md_path#$SRC/}"
    target_path="$DST/$rel_path"
    target_dir="$(dirname "$target_path")"
    mkdir -p "$target_dir"

    if [ -f "$target_path" ]; then
      if ! cmp -s "$md_path" "$target_path"; then
        # Conflict: stash existing
        conflict_dir="$DST/_conflicts/$(date -u +%Y%m%dT%H%M%S)"
        mkdir -p "$conflict_dir/$(dirname "$rel_path")"
        mv "$target_path" "$conflict_dir/$rel_path"
        warn "conflict: $rel_path (kept new from $SESSION_ID, prior in _conflicts/)"
        CONFLICTS=$((CONFLICTS + 1))
      fi
    fi
    cp "$md_path" "$target_path"

    case "$TARGET" in
      hubspot) TOTAL_HUBSPOT=$((TOTAL_HUBSPOT + 1)) ;;
      drive)   TOTAL_DRIVE=$((TOTAL_DRIVE + 1)) ;;
      comms)   TOTAL_COMMS=$((TOTAL_COMMS + 1)) ;;
    esac
  done < <(find "$SRC" -type f -name '*.md' -print0)

  log "  $SESSION_ID complete"
done

# -------- update extraction-state.json --------
log "updating extraction-state.json"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S%z)"
# Backfill count is preserved from the prior state file (do not overwrite).
BACKFILL_COUNT="$(jq -r '(.sources[] | select(.key=="backfill") | .count) // 9' "$STATE_FILE" 2>/dev/null || echo 9)"
TOTAL=$((TOTAL_HUBSPOT + TOTAL_DRIVE + TOTAL_COMMS + BACKFILL_COUNT))

TMP="$(mktemp)"
jq \
  --arg now "$NOW" \
  --argjson hs "$TOTAL_HUBSPOT" \
  --argjson dr "$TOTAL_DRIVE" \
  --argjson co "$TOTAL_COMMS" \
  --argjson bf "$BACKFILL_COUNT" \
  --argjson total "$TOTAL" \
  '.last_sync = $now
   | .build_timestamp = $now
   | .total_nodes = $total
   | (.sources[] | select(.key=="hubspot_asana") | .count) = $hs
   | (.sources[] | select(.key=="drive") | .count) = $dr
   | (.sources[] | select(.key=="comms") | .count) = $co
   | (.sources[] | select(.key=="backfill") | .count) = $bf' \
  "$STATE_FILE" > "$TMP"
mv "$TMP" "$STATE_FILE"

# -------- regenerate brain/manifest.json --------
log "regenerating brain/manifest.json"

# Build arrays of relative paths for each tree using find. Sort + dedupe.
collect() {
  local dir="$1"
  if [ -d "$dir" ]; then
    (cd "$HUB_ROOT" && find "${dir#$HUB_ROOT/}" -type f -name '*.md' 2>/dev/null | sort) || true
  fi
}

CURATED_DECISIONS=$(collect "$HUB_ROOT/brain/curated/decisions" | jq -R . | jq -s .)
CURATED_THREADS=$(collect "$HUB_ROOT/brain/curated/threads" | jq -R . | jq -s .)
CURATED_PEOPLE=$(collect "$HUB_ROOT/brain/curated/people" | jq -R . | jq -s .)
CURATED_PROJECTS=$(collect "$HUB_ROOT/brain/curated/projects" | jq -R . | jq -s .)
CURATED_PLAYBOOKS=$(collect "$HUB_ROOT/brain/curated/playbooks" | jq -R . | jq -s .)
WORK_CONVERSATIONS=$(collect "$HUB_ROOT/brain/work/conversations" | jq -R . | jq -s .)
WORK_BRIEFS=$(collect "$HUB_ROOT/brain/work/briefs" | jq -R . | jq -s .)
WORK_SCRATCH=$(collect "$HUB_ROOT/brain/work/scratch" | jq -R . | jq -s .)
EXT_HUBSPOT=$(collect "$HUB_ROOT/brain/extracted/hubspot" | jq -R . | jq -s .)
EXT_DRIVE=$(collect "$HUB_ROOT/brain/extracted/drive" | jq -R . | jq -s .)
EXT_COMMS=$(collect "$HUB_ROOT/brain/extracted/comms" | jq -R . | jq -s .)

CURATED_COUNT=$(jq -s 'add | length' \
  <(echo "$CURATED_DECISIONS") <(echo "$CURATED_THREADS") <(echo "$CURATED_PEOPLE") \
  <(echo "$CURATED_PROJECTS") <(echo "$CURATED_PLAYBOOKS"))
WORK_COUNT=$(jq -s 'add | length' \
  <(echo "$WORK_CONVERSATIONS") <(echo "$WORK_BRIEFS") <(echo "$WORK_SCRATCH"))
EXT_COUNT=$(jq -s 'add | length' \
  <(echo "$EXT_HUBSPOT") <(echo "$EXT_DRIVE") <(echo "$EXT_COMMS"))

cat > "$MANIFEST_FILE" <<EOF
{
  "schema_version": 1,
  "generated_at": "$NOW",
  "tree": {
    "curated": {
      "decisions": $CURATED_DECISIONS,
      "threads": $CURATED_THREADS,
      "people": $CURATED_PEOPLE,
      "projects": $CURATED_PROJECTS,
      "playbooks": $CURATED_PLAYBOOKS
    },
    "work": {
      "conversations": $WORK_CONVERSATIONS,
      "briefs": $WORK_BRIEFS,
      "scratch": $WORK_SCRATCH
    },
    "extracted": {
      "hubspot": $EXT_HUBSPOT,
      "drive": $EXT_DRIVE,
      "comms": $EXT_COMMS
    }
  },
  "stats": {
    "curated_count": $CURATED_COUNT,
    "work_count": $WORK_COUNT,
    "extracted_count": $EXT_COUNT
  }
}
EOF

# -------- summary --------
log ""
log "==== summary ===="
log "HubSpot/Asana nodes:  $TOTAL_HUBSPOT"
log "Drive nodes:          $TOTAL_DRIVE"
log "Slack/Gmail/Gong:     $TOTAL_COMMS"
log "Backfill (preserved): $BACKFILL_COUNT"
log "TOTAL:                $TOTAL"
log "Conflicts resolved:   $CONFLICTS"
log ""
log "extraction-state.json updated."
log "brain/manifest.json regenerated."
log ""
log "Next: run ./scripts/merge-brain-backfill.sh <path-to-dispatch-parent-outputs>"
log "Then: run ./scripts/deploy.sh"
