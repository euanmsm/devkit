export const setup = {
  name: 'setup',
  description: 'Config, init, clone and identity',
  sections: [
    {
      title: 'Setup & Config',
      items: [
        {
          kind: 'cmd',
          name: 'git init [<directory>]',
          desc: 'Create empty repository',
          children: [
            { kind: 'flag', name: '--bare', desc: 'Create bare repository' },
            {
              kind: 'flag',
              name: '-b, --initial-branch=<name>',
              desc: 'Initial branch name',
            },
            {
              kind: 'flag',
              name: '--template=<dir>',
              desc: 'Template directory',
            },
            {
              kind: 'flag',
              name: '--shared[=<perm>]',
              desc: 'Shared repo permissions',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git clone <url> [<dir>]',
          desc: 'Clone a repository',
          children: [
            {
              kind: 'flag',
              name: '-b, --branch <name>',
              desc: 'Checkout specific branch',
            },
            {
              kind: 'flag',
              name: '--depth <n>',
              desc: 'Shallow clone with n commits',
            },
            {
              kind: 'flag',
              name: '--shallow-since=<date>',
              desc: 'Shallow clone after date',
            },
            {
              kind: 'flag',
              name: '--single-branch',
              desc: 'Clone only one branch',
            },
            { kind: 'flag', name: '--no-tags', desc: "Don't clone tags" },
            {
              kind: 'flag',
              name: '--recurse-submodules',
              desc: 'Init and clone submodules',
            },
            {
              kind: 'flag',
              name: '-j, --jobs <n>',
              desc: 'Parallel submodule fetch jobs',
            },
            {
              kind: 'flag',
              name: '-o, --origin <name>',
              desc: 'Custom remote name',
            },
            {
              kind: 'flag',
              name: '--filter=<spec>',
              desc: 'Partial clone (e.g. blob:none)',
            },
            { kind: 'flag', name: '--sparse', desc: 'Enable sparse-checkout' },
            {
              kind: 'flag',
              name: '--mirror',
              desc: 'Set up mirror (implies --bare)',
            },
            {
              kind: 'flag',
              name: '-n, --no-checkout',
              desc: 'Skip checkout after clone',
            },
            { kind: 'flag', name: '--bare', desc: 'Create bare repository' },
          ],
        },
        {
          kind: 'cmd',
          name: 'git config <subcommand>',
          desc: 'Get/set options',
          children: [
            {
              kind: 'note',
              text: 'Subcommands: list, get, set, unset, edit, rename-section, remove-section',
            },
            {
              kind: 'flag',
              name: '--global',
              desc: 'Global config (~/.gitconfig)',
            },
            { kind: 'flag', name: '--system', desc: 'System config' },
            { kind: 'flag', name: '--local', desc: 'Repo config (default)' },
            { kind: 'flag', name: '--worktree', desc: 'Worktree config' },
            {
              kind: 'flag',
              name: '-f, --file <file>',
              desc: 'Specific config file',
            },
            {
              kind: 'flag',
              name: '--type=<type>',
              desc: 'Ensure type (bool, int, path, ...)',
            },
            {
              kind: 'flag',
              name: '--show-origin',
              desc: 'Show where value is defined',
            },
            {
              kind: 'flag',
              name: '--show-scope',
              desc: 'Show scope (system/global/local)',
            },
            {
              kind: 'flag',
              name: '--all',
              desc: 'All values for multi-valued key',
            },
          ],
        },
      ],
    },
  ],
};
