#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO_DIR/home"

link_file() {
  local rel="$1"
  local src="$SRC/$rel"
  local dest="$HOME/$rel"
  mkdir -p "$(dirname "$dest")"
  if [ -L "$dest" ]; then
    if [ "$(readlink "$dest")" = "$src" ]; then
      return 0
    fi
    rm "$dest"
  elif [ -e "$dest" ]; then
    mv "$dest" "$dest.detached-backup"
  fi
  ln -s "$src" "$dest"
}

while IFS= read -r -d '' file; do
  rel="${file#"$SRC"/}"
  link_file "$rel"
done < <(find "$SRC" -type f -print0)

systemctl --user daemon-reload
systemctl --user enable --now omarchy-agent-usage-opencode.timer >/dev/null

"$HOME/.local/bin/omarchy-agent-usage-opencode" --force \
  --output "$HOME/.local/state/omarchy/agents/usage/opencode.json"

echo "Installed dotfiles from $REPO_DIR"