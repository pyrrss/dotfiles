return {
	-- Load all theme plugins but don't apply them
	-- This ensures all colorschemes are available for hot-reloading
	{
		"ribru17/bamboo.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"bjarneo/aether.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"bjarneo/ethereal.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"bjarneo/hackerman.nvim",
		lazy = true,
		priority = 1000,
        name = "hackerman",
	},
	{
		"catppuccin/nvim",
		name = "catppuccin",
		lazy = true,
		priority = 1000,
	},
	{
		"sainnhe/everforest",
		lazy = true,
		priority = 1000,
	},
	{
		"kepano/flexoki-neovim",
		lazy = true,
		priority = 1000,
	},
	{
		"ellisonleao/gruvbox.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"rebelot/kanagawa.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"tahayvr/matteblack.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"loctvl842/monokai-pro.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"shaunsingh/nord.nvim",
		lazy = true,
		priority = 1000,
	},
	{
		"rose-pine/neovim",
		name = "rose-pine",
		lazy = true,
		priority = 1000,
        -- variant = "moon"
	},
	{
		"folke/tokyonight.nvim",
		lazy = true,
		priority = 1000,
	},
    {
        "alljokecake/naysayer-theme.nvim",
        lazy = true,
        priority = 1000,
    },
    {
        "zenbones-theme/zenbones.nvim",
        name = "zenbones",
        lazy = true,
        priority = 1000,
        dependencies = "rktjmp/lush.nvim",
    },
    {
        "datsfilipe/vesper.nvim",
        name = "vesper",
        lazy = true,
        priority = 1000,
    },
    {
        "vague-theme/vague.nvim",
        lazy = true,
        priority = 1000,
    },
    {
        "maxmx03/solarized.nvim",
        lazy = true,
        priority = 1000,
        config = function ()
            require("solarized").setup({
                variant = "autumn",
                palette = "solarized",
            })
            vim.o.background = "light"
        end,
    },
}



