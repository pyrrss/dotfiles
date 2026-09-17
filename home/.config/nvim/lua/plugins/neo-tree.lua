return {
    "nvim-neo-tree/neo-tree.nvim",
    opts = function(_, opts)
        opts.filesystem = opts.filesystem or {}

        opts.filesystem.follow_current_file = opts.filesystem.follow_current_file or {}
        opts.filesystem.follow_current_file.enabled = false

        opts.filesystem.use_libuv_file_watcher = false

        -- opts.enable_git_status = false
        -- opts.enable_diagnostics = false
    end,
}
