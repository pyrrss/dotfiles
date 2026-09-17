# Dotfiles

Config of nvim, omarchy, and a user systemd timer that feeds the
"OpenCode" tab in the omarchy agents panel.

## Install on a new machine

```sh
git clone <url> ~/dotfiles
~/dotfiles/install.sh
```

## Apply again

```sh
~/dotfiles/install.sh
```

The script is idempotent: it symlinks everything under `home/` into your
home directory, enables the `omarchy-agent-usage-opencode.timer`, and
regenerates the usage record for the OpenCode agent. The tab appears in the
agents panel once opencode has recorded any usage on that machine.