#!/usr/bin/env bash
# Refresca el snapshot de Pi en el repo desde la máquina viva.
#
# El resto de la configuración se edita en el repo y viaja por symlink, así
# que no necesita nada de esto. Solo el estado de Pi se copia (install.sh lo
# copia, no lo enlaza) y por eso necesita un refresh explícito.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO_DIR/home"
H="${HOME:?}"

say() { printf '%s\n' "$*"; }

# Lo que Pi escribe en runtime y no va al repo.
runtime=(
  "agent/auth.json"
  "agent/sessions"
  "agent/gentle-agents"
  "agent/npm"
  "agent/models-store.json"
  "agent/crashes.json"
  "agent/mcp-cache.json"
  "agent/mcp-npx-cache.json"
  "agent/mcp-onboarding.json"
  "agent/mcp-last-seen-version.json"
  "agent/pi-tui-crash.log"
  "gentle-ai/agent-status"
  "gentle-ai/scratch"
)

is_runtime() {
  local rel="$1"
  local skip
  for skip in "${runtime[@]}"; do
    [ "$rel" = ".pi/$skip" ] && return 0
  done
  return 1
}

mkdir -p "$SRC/.pi/agent" "$SRC/.pi/gentle-ai"

# Un archivo suelto del home al repo, saltando lo que es runtime.
sync_one() {
  local rel="$1"
  is_runtime "$rel" && return 0
  mkdir -p "$(dirname "$SRC/$rel")"
  cp -f "$H/$rel" "$SRC/$rel"
  say "  $rel"
}

sync_one ".pi/agent/settings.json"
sync_one ".pi/agent/mcp.json"

for dir in agents chains skills themes extensions extensions-disabled; do
  [ -d "$H/.pi/agent/$dir" ] || continue
  mkdir -p "$SRC/.pi/agent/$dir"
  rsync -a --delete --exclude='node_modules/' "$H/.pi/agent/$dir/" "$SRC/.pi/agent/$dir/"
  say "  .pi/agent/$dir/"
done

if [ -d "$H/.pi/agent/gentle-ai" ]; then
  rsync -a --delete "$H/.pi/agent/gentle-ai/" "$SRC/.pi/agent/gentle-ai/"
  say "  .pi/agent/gentle-ai/"
fi

for f in profiles.json star-prompt.json; do
  [ -f "$H/.pi/gentle-ai/$f" ] && sync_one ".pi/gentle-ai/$f"
done

say "Snapshot de Pi actualizado en $SRC/.pi"
