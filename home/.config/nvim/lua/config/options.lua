require("config.remote_clipboard").setup()
-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here


vim.opt.guicursor = ""
-- vim.opt.guicursor = "n-v-c:block-Cursor/lCursor-blinkon0,i-ci-ve:ver25-Cursor/lCursor,r-cr:hor20-Cursor/lCursor"

vim.opt.mouse = "a"

vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true

vim.opt.smartindent = true

vim.opt.wrap = false

vim.opt.swapfile = false
vim.opt.backup = false

vim.opt.hlsearch = false
vim.opt.incsearch = true

vim.opt.termguicolors = true

vim.opt.scrolloff = 8
vim.opt.signcolumn = "yes"
vim.opt.isfname:append("@-@")

vim.opt.updatetime = 50

vim.g.mapleader = " "

vim.g.autoformat = false

-- Disable inline "ghost text" suggestions from the completion engine.
-- Keeps Copilot's own inline suggestions.
vim.g.ai_cmp = false

-- Colores

-- vim.api.nvim_set_hl(0, "Normal", { bg = "none" })
-- vim.api.nvim_set_hl(0, "NormalFloat", { bg = "none" })

-- background colors
-- vim.cmd("hi Normal guibg=#2c2c2c ctermbg=NONE")
-- vim.cmd("hi NormalNC guibg=#2c2c2c")
-- vim.cmd("hi NormalFloat guibg=#2c2c2c")
-- vim.cmd("hi VertSplit guibg=#2c2c2c")
