return {
    "yetone/avante.nvim",
    dependencies = {
        "nvim-tree/nvim-web-devicons",
        "stevearc/dressing.nvim",
        "nvim-lua/plenary.nvim",
        "MunifTanjim/nui.nvim",
        {
            "MeanderingProgrammer/render-markdown.nvim",
            opts = { file_types = { "markdown", "Avante" } },
            ft = { "markdown", "Avante" },
        },
    },
    build = "make",
    opts = {
        provider = "copilot",
        behaviour = {
            auto_suggestions = false, -- Experimental stage
            auto_set_highlight_group = true,
            auto_set_keymaps = true,
            auto_apply_diff_after_generation = false,
            support_paste_from_clipboard = false,
        },
        windows = {
            ---@type "right" | "left" | "top" | "bottom"
            position = "right",   -- the position of the sidebar
            wrap = true,          -- similar to vim.o.wrap
            width = 40,           -- default % based on available width
            sidebar_header = {
                enabled = true,   -- true, false to enable/disable the header
                align = "center", -- left, center, right for title
                rounded = true,
            },
            input = {
                prefix = "> ",
                height = 8, -- Height of the input window in vertical layout
            },
            edit = {
                start_insert = true, -- Start insert mode when opening the edit window
            },
            ask = {
                floating = true,         -- Open the 'AvanteAsk' prompt in a floating window
                start_insert = true,     -- Start insert mode when opening the ask window
                ---@type "ours" | "theirs"
                focus_on_apply = "ours", -- which diff to focus after applying
            },
        },
        highlights = {
            ---@type AvanteConflictHighlights
            diff = {
                current = "DiffText",
                incoming = "DiffAdd",
            },
        },
    },
}
