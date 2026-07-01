#!/usr/bin/env bash
# Deploy the vita-handler edge function.
#
# Why this script exists: data/resume.json is the single source of truth, but
# the edge function bundles its own copy at deploy time. This script keeps the
# two in sync so a stale resume can never ship by accident.
#
# Usage:  ./scripts/deploy-backend.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# The committed resume.json is fictional template data; the gitignored
# .private.json twin (the real resume) wins when it exists.
SRC="data/resume.json"
[ -f data/resume.private.json ] && SRC="data/resume.private.json"

echo "→ Syncing ${SRC} into the function bundle..."
cp "$SRC" supabase/functions/vita-handler/resume.json

echo "→ Deploying vita-handler to Supabase..."
supabase functions deploy vita-handler

echo "✓ Done. The widget picks up the new resume on its next request."
