# Dotfiles

Configuración de nvim, hyprland (bindings/input/looknfeel/autostart), kitty,
omarchy y un timer de systemd por usuario que alimenta la pestaña "OpenCode"
del panel de agentes de omarchy.

## Instalación en una máquina nueva

```sh
git clone <url> ~/dotfiles
~/dotfiles/install.sh
```

## Volver a aplicar

```sh
~/dotfiles/install.sh
```

El script es idempotente: enlaza por symlinks todo lo que está bajo `home/`
dentro de tu directorio de inicio, activa el `omarchy-agent-usage-opencode.timer`
y regenera el registro de uso del agente OpenCode. La pestaña aparece en el
panel de agentes una vez que opencode haya registrado uso en esa máquina.