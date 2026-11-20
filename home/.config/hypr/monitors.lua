-- See https://wiki.hypr.land/Configuring/Basics/Monitors/
-- List current monitors and supported resolutions with: hyprctl monitors all

local omarchy_gdk_scale = 1
local omarchy_monitor_scale = 1

hl.env("GDK_SCALE", tostring(omarchy_gdk_scale))

-- ============================================================
-- MODO 1: SEGUNDO MONITOR NORMAL (extendido)
-- Cada monitor independiente: laptop a la izquierda, externo a la derecha.
-- ============================================================
hl.monitor({ output = "eDP-1", mode = "preferred", position = "0x0", scale = omarchy_monitor_scale })
hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "1920x0", scale = omarchy_monitor_scale })


-- ============================================================
-- MODO 2: DUPLICAR PANTALLA (mirror)
-- ============================================================
-- hl.monitor({ output = "eDP-1", mode = "preferred", position = "0x0", scale = 1 })
-- hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "auto", scale = 1, mirror = "eDP-1" })

