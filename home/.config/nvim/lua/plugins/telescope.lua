return {
    "nvim-telescope/telescope.nvim",
    dependencies = {
        "nvim-lua/plenary.nvim",
    },
    cmd = "Telescope",
    keys = {
        {
            "<leader>ff",
            function() require("telescope.builtin").find_files({ previewer = true, }) end,
            desc = "Buscar archivos"
        },

        {
            "<leader>fg",
            function() require("telescope.builtin").live_grep() end,
            desc = "Buscar texto"
        },

        {
            "<leader>fb",
            function() require("telescope.builtin").buffers() end,
            desc = "Buscar buffers"
        },

        {
            "<leader>fh",
            function() require("telescope.builtin").help_tags() end,
            desc = "Buscar ayuda"
        },

    },

    config = function()
        vim.keymap.set("n", "<leader>en", function()
            require("telescope.builtin").find_files {
                cwd = vim.fn.stdpath("config")
            }
        end)
    end
}
