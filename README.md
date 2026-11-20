# Dotfiles

Configuración de nvim, hyprland, kitty, omarchy, el stack de Pi (gentle-pi) y
los collectors que alimentan el panel de agentes de la bar.

Todo lo que está en `home/` se enlaza por symlink a su lugar en `$HOME`.
`install.sh` es idempotente: se puede correr las veces que haga falta.

## Instalación (Omarchy recién instalado)

```sh
git clone https://github.com/pyrrss/dotfiles ~/dotfiles
~/dotfiles/install.sh
```

`install.sh` avisa (no aborta) si falta algo del entorno. Después de correrlo
quedan estos pasos manuales:

| Paso | Comando / detalle |
| --- | --- |
| Credenciales de los providers | `pi` → `/login <provider>` por cada uno (opencode-go, anthropic, openrouter…). Las claves **no** viajan en el repo. |
| Pi instalado | `mise use -g npm:@earendil-works/pi-coding-agent` (la config de mise queda en `home/.config/mise/config.toml`). |
| Paquetes de Pi | `pi install npm:gentle-pi npm:pi-goal-x npm:pi-mcp-adapter npm:@tintinweb/pi-tasks` — o se restauran solos desde `home/.pi/agent/settings.json`. |
| Token de Canva (MCP) | `~/.config/canva/mcp-client.json` no se versiona: hay que rehacer el login de Canva. |
| Hermes | `hermes-gateway.service` queda instalado, pero el venv de `~/.hermes/` no: hay que reinstalar Hermes. |
| Neovim | LazyVim instala los plugins solo; `home/.config/nvim/lua/plugins/theme.lua` está versionado a propósito. |
| Temas de Omarchy | `home/.config/omarchy/themes/` no se versiona: son repos clonados. `omarchy theme set <tema>` los baja de nuevo. |

## Qué hay versionado

- **hyprland**: `bindings`, `input`, `looknfeel`, `autostart`, `hyprland.lua`,
  `monitors.lua`/`.conf` (los dos monitores), `shaders/*.glsl`, hypridle,
  hyprlock, hyprsunset.
- **omarchy**: `shell.json` (layout de la bar), `shell.toml`, `hooks/`,
  `extensions/`, y el logo de Pi para el panel de agentes.
- **nvim**: lazyvim con `theme.lua` incluido.
- **kitty**: `kitty.conf`.
- **git / starship / mise**: config de git, prompt, versiones de mise.
- **systemd**: `omarchy-agent-usage-{pi,opencode}.{service,timer}` y
  `hermes-gateway.service`.
- **Pi**: `settings.json` (packages, provider, modelo, modelos habilitados),
  `agents/` (los subagentes: gentle-ai-*, jd-*, review-*), `chains/`,
  `extensions/*.ts`, `skills/`, `mcp.json`, `themes/`, `gentle-ai/`.
- **skills**: `~/.agents/skills/`.

## Qué NO hay versionado (y por qué)

| Qué | Por qué |
| --- | --- |
| `~/.pi/agent/auth.json` | Credenciales. La política es rehacer `/login` en cada máquina. |
| Sesiones, catálogos y caché de Pi | Estado de runtime: `sessions/`, `npm/`, `models-store.json`, `mcp-cache.json`, `gentle-agents/`. |
| `~/.config/omarchy/themes/` | Cada tema es un repo clonado; `omarchy theme set` los vuelve a bajar. |
| Binarios de `~/.local/bin` (`kr`, `ngrok`) y symlinks a tools (`tvly`, `cua-driver`) | Se reinstalan con su propio gestor. |
| `node_modules/` | Se reinstalan con npm. |

## El panel de agentes

El panel de la bar (`omarchy.agents`) viene de un **clon** en
`~/.config/omarchy/plugins/<usuario>.agents/`, porque el plugin empaquetado
vive en `/usr/share/omarchy` y no se puede editar. El clon existe para poder
poner el logo de Pi:

```
home/.config/omarchy/plugins/<usuario>.agents/assets/pi.svg
```

`install.sh` clona el plugin si no está. Si el clon no se puede crear (el
shell no está corriendo), la bar vuelve al widget stock
(`omarchy.agents`) para no dejar la bar sin panel.

Los medidores de la suscripción Zen (Session / Weekly / Monthly) los reporta el
registro de Pi: `home/.local/bin/omarchy-agent-usage-pi` los pide al collector
stock de OpenCode, que es el que sabe la API y las credenciales.

## Uso diario

- Editá **en el repo**, no en `~/.config`: los symlinks escriben directo.
- Después de editar, `~/dotfiles/install.sh` reconecta lo que falta.
- `git add -A && git commit` cuando esté.
