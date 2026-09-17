return {
    "ThePrimeagen/harpoon",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
        require("harpoon").setup({
            global_settings = {
                save_on_toggle = true,
                save_on_change = true,
            },
        })


        -- Keybindings
        local mark = require("harpoon.mark")
        local ui = require("harpoon.ui")

        vim.keymap.set("n", "<leader>h", mark.add_file, { desc = "Agregar archivo a Harpoon" })
        vim.keymap.set("n", "<leader>m", ui.toggle_quick_menu, { desc = "Abrir menú Harpoon" })
        vim.keymap.set("n", "<M-1>", function() ui.nav_file(1) end, { desc = "Ir a archivo 1" })
        vim.keymap.set("n", "<M-2>", function() ui.nav_file(2) end, { desc = "Ir a archivo 2" })
        vim.keymap.set("n", "<M-3>", function() ui.nav_file(3) end, { desc = "Ir a archivo 3" })
        vim.keymap.set("n", "<M-4>", function() ui.nav_file(4) end, { desc = "Ir a archivo 4" })
    end,


}
