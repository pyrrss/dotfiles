#!/usr/bin/env bash
# Instala los dotfiles: enlaza cada archivo de home/ a su lugar en $HOME.
#
# Pensado para una instalación fresca de Omarchy: se puede correr tal cual
# varias veces (es idempotente) y avisa, en vez de abortar, cuando falta
# algo del entorno.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO_DIR/home"

say() { printf '%s\n' "$*"; }
warn() { printf 'install.sh: %s\n' "$*" >&2; }

# --------------------------------------------------------------- preflight

command -v omarchy >/dev/null 2>&1 ||
  warn "omarchy no está en el PATH: el panel de agentes y el collector de Zen no van a funcionar."
command -v python3 >/dev/null 2>&1 ||
  warn "python3 no está en el PATH: los collectors de uso no van a correr."

HAVE_JQ=1
command -v jq >/dev/null 2>&1 || {
  HAVE_JQ=0
  warn "jq no está instalado: sin él, el panel de agentes no puede volver al widget stock."
}

# ------------------------------------------- panel de agentes (un clon)

# El panel se clona para poder llevar el logo de Pi en sus assets; el plugin
# empaquetado vive en /usr/share/omarchy y no se puede editar.
AGENTS_ID="${USER:-$(id -un)}.agents"
AGENTS_DIR="$HOME/.config/omarchy/plugins/$AGENTS_ID"

if [ ! -f "$AGENTS_DIR/manifest.json" ] && command -v omarchy >/dev/null 2>&1; then
  say "Clonando el panel de agentes…"
  omarchy plugin clone omarchy.agents >/dev/null 2>&1 ||
    warn "no se pudo clonar el panel (¿el shell está corriendo?): la bar seguirá con el widget stock."
fi

# ---------------------------------------------------------------- enlaces

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
    # Un archivo real en el destino no se pisa en silencio: se aparta con
    # marca de tiempo para poder compararlo.
    local backup="$dest.detached-backup.$(date +%Y%m%d%H%M%S)"
    mv "$dest" "$backup"
    say "  $rel → $(basename "$backup")"
  fi
  ln -s "$src" "$dest"
}

# Solo archivos: los directorios se crean con mkdir -p al vuelo.
#
# El estado de Pi (settings.json, los assets gestionados, las skills) lo
# escribe el propio Pi en runtime: se copia en vez de enlazar, para que lo
# que escriba en runtime no ensucie el repo. Para refresharlo: ./sync.sh
copy_file() {
  local rel="$1"
  local src="$SRC/$rel"
  local dest="$HOME/$rel"
  mkdir -p "$(dirname "$dest")"
  [ -L "$dest" ] && rm "$dest"
  # -a para que un symlink (las skills que trae Omarchy) se copie como link.
  cp -a "$src" "$dest"
}

while IFS= read -r -d '' file; do
  rel="${file#"$SRC"/}"
  case "$rel" in
    .pi/*) copy_file "$rel" ;;
    *) link_file "$rel" ;;
  esac
done < <(find "$SRC" \( -type f -o -type l \) \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/__pycache__/*' \
  -not -name '*.pyc' \
  -not -name '.detached-backup*' \
  -print0)

# -------------------------------------- el bar necesita un plugin real

# El layout de la bar apunta al clon. Sin clon, el widget no existe y el
# panel de agentes desaparece de la bar: se vuelve al widget stock.
if [ ! -f "$AGENTS_DIR/manifest.json" ] && [ -f "$HOME/.config/omarchy/shell.json" ] && [ "$HAVE_JQ" = 1 ]; then
  jq --arg id "$AGENTS_ID" \
    '(.bar.layout.right[]? | select(.id == $id).id) = "omarchy.agents"' \
    "$HOME/.config/omarchy/shell.json" >"$HOME/.config/omarchy/shell.json.tmp" &&
    mv "$HOME/.config/omarchy/shell.json.tmp" "$HOME/.config/omarchy/shell.json" ||
    warn "no se pudo devolver shell.json al widget stock: revisá el id $AGENTS_ID a mano."
fi

# El tema de nvim lo genera Omarchy según el tema activo: cambia con el
# tema, así que no se versiona y se enlaza al que esté activo.
if [ ! -e "$HOME/.config/nvim/lua/plugins/theme.lua" ]; then
  mkdir -p "$HOME/.config/nvim/lua/plugins"
  ln -s "$HOME/.local/state/omarchy/current/theme/neovim.lua" \
    "$HOME/.config/nvim/lua/plugins/theme.lua"
fi

# ------------------------------------------------------------------ systemd

if systemctl --user daemon-reload >/dev/null 2>&1; then
  systemctl --user enable --now omarchy-agent-usage-pi.timer >/dev/null 2>&1 ||
    warn "no se pudo habilitar el timer de Pi"
  systemctl --user enable --now omarchy-agent-usage-opencode.timer >/dev/null 2>&1 ||
    warn "no se pudo habilitar el timer de OpenCode"
else
  warn "no hay sesión de systemd de usuario: los timers de uso quedan sin habilitar (corré esto dentro de tu sesión)."
fi

# -------------------------------------------------------------- collectors

mkdir -p "$HOME/.local/state/omarchy/agents/usage"
"$HOME/.local/bin/omarchy-agent-usage-opencode" --force \
  --output "$HOME/.local/state/omarchy/agents/usage/opencode.json" ||
  warn "no se pudo generar el registro de uso de OpenCode"
"$HOME/.local/bin/omarchy-agent-usage-pi" --force \
  --output "$HOME/.local/state/omarchy/agents/usage/pi.json" ||
  warn "no se pudo generar el registro de uso de Pi"

say "Instalados los dotfiles desde $REPO_DIR"
say "Pendiente a mano: /login de cada provider (las credenciales no viajan en el repo)."
