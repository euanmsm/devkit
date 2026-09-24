export const sharing = {
  name: 'sharing',
  description: 'remote, fetch, pull, push, submodules',
  sections: [
    {
      title: 'Sharing & Updating',
      items: [
        {
          kind: 'cmd',
          name: 'git remote [<subcommand>]',
          desc: 'Manage remotes',
          children: [
            { kind: 'subcmd', name: 'add <name> <url>', desc: 'Add a remote' },
            {
              kind: 'subcmd',
              name: 'remove / rm <name>',
              desc: 'Remove a remote',
            },
            {
              kind: 'subcmd',
              name: 'rename <old> <new>',
              desc: 'Rename a remote',
            },
            {
              kind: 'subcmd',
              name: 'show <name>',
              desc: 'Show remote details',
            },
            {
              kind: 'subcmd',
              name: 'get-url / set-url <name>',
              desc: 'Get/set URLs',
            },
            { kind: 'subcmd', name: 'prune <name>', desc: 'Remove stale refs' },
            {
              kind: 'subcmd',
              name: 'update [<group|name>]',
              desc: 'Fetch updates',
            },
            {
              kind: 'subcmd',
              name: 'set-head <name> <branch>',
              desc: 'Set remote HEAD',
            },
            {
              kind: 'subcmd',
              name: 'set-branches <name> <br>...',
              desc: 'Set tracked branches',
            },
            { kind: 'flag', name: '-v, --verbose', desc: 'Show remote URLs' },
          ],
        },
        {
          kind: 'cmd',
          name: 'git fetch [<remote>] [<refspec>]',
          desc: 'Download objects and refs',
          children: [
            { kind: 'flag', name: '--all', desc: 'Fetch all remotes' },
            {
              kind: 'flag',
              name: '-p, --prune',
              desc: 'Remove stale remote-tracking refs',
            },
            {
              kind: 'flag',
              name: '-P, --prune-tags',
              desc: 'Remove stale local tags',
            },
            { kind: 'flag', name: '-t, --tags', desc: 'Fetch all tags' },
            { kind: 'flag', name: '--no-tags', desc: "Don't auto-follow tags" },
            { kind: 'flag', name: '--depth=<n>', desc: 'Limit fetch depth' },
            { kind: 'flag', name: '--deepen=<n>', desc: 'Deepen by n commits' },
            {
              kind: 'flag',
              name: '--unshallow',
              desc: 'Convert shallow to complete',
            },
            {
              kind: 'flag',
              name: '--filter=<spec>',
              desc: 'Partial clone filter',
            },
            {
              kind: 'flag',
              name: '--set-upstream',
              desc: 'Set upstream tracking',
            },
            {
              kind: 'flag',
              name: '-j, --jobs=<n>',
              desc: 'Parallel submodule fetch',
            },
            {
              kind: 'flag',
              name: '--recurse-submodules',
              desc: 'Recurse into submodules',
            },
            { kind: 'flag', name: '--atomic', desc: 'Atomic ref update' },
            {
              kind: 'flag',
              name: '--dry-run',
              desc: 'Show what would be done',
            },
            { kind: 'flag', name: '--refetch', desc: 'Re-fetch all objects' },
            {
              kind: 'flag',
              name: '--prefetch',
              desc: 'Place refs in refs/prefetch/',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git pull [<remote>] [<branch>]',
          desc: 'Fetch and integrate',
          children: [
            {
              kind: 'flag',
              name: '-r, --rebase[=true|merges|interactive]',
              desc: 'Rebase instead of merge',
            },
            { kind: 'flag', name: '--no-rebase', desc: 'Force merge' },
            {
              kind: 'flag',
              name: '--ff / --no-ff / --ff-only',
              desc: 'Fast-forward strategy',
            },
            { kind: 'flag', name: '--squash', desc: 'Squash merge' },
            { kind: 'flag', name: '--autostash', desc: 'Auto-stash before' },
            { kind: 'flag', name: '--all', desc: 'Fetch all remotes' },
            {
              kind: 'note',
              text: 'Also accepts all git fetch and git merge/rebase flags',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git push [<remote>] [<refspec>]',
          desc: 'Update remote refs',
          children: [
            {
              kind: 'flag',
              name: '-u, --set-upstream',
              desc: 'Set upstream tracking',
            },
            {
              kind: 'flag',
              name: '--all / --branches',
              desc: 'Push all branches',
            },
            { kind: 'flag', name: '--tags', desc: 'Push all tags' },
            {
              kind: 'flag',
              name: '--follow-tags',
              desc: 'Push reachable annotated tags',
            },
            { kind: 'flag', name: '-f, --force', desc: 'Force push' },
            {
              kind: 'flag',
              name: '--force-with-lease[=<ref>:<expect>]',
              desc: 'Safe force push',
            },
            {
              kind: 'flag',
              name: '--force-if-includes',
              desc: 'Verify remote tip integrated',
            },
            { kind: 'flag', name: '-d, --delete', desc: 'Delete remote ref' },
            {
              kind: 'flag',
              name: '--prune',
              desc: 'Remove remote refs without local',
            },
            { kind: 'flag', name: '--mirror', desc: 'Mirror all refs' },
            { kind: 'flag', name: '--atomic', desc: 'Atomic ref update' },
            {
              kind: 'flag',
              name: '--dry-run',
              desc: 'Show what would be pushed',
            },
            { kind: 'flag', name: '--no-verify', desc: 'Skip pre-push hook' },
            {
              kind: 'flag',
              name: '--recurse-submodules=<check|on-demand>',
              desc: 'Submodule push control',
            },
            {
              kind: 'flag',
              name: '-o, --push-option=<opt>',
              desc: 'Push option to server',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git submodule <subcommand>',
          desc: 'Manage submodules',
          children: [
            {
              kind: 'subcmd',
              name: 'add <url> [<path>]',
              desc: 'Add a submodule',
            },
            {
              kind: 'subcmd',
              name: 'init [<path>...]',
              desc: 'Initialize submodules',
            },
            {
              kind: 'subcmd',
              name: 'update [<path>...]',
              desc: 'Update submodules',
            },
            {
              kind: 'subcmd',
              name: 'status [<path>...]',
              desc: 'Show submodule status',
            },
            {
              kind: 'subcmd',
              name: 'summary [<path>...]',
              desc: 'Show commit summary',
            },
            {
              kind: 'subcmd',
              name: 'foreach <cmd>',
              desc: 'Run command in each',
            },
            {
              kind: 'subcmd',
              name: 'sync [<path>...]',
              desc: 'Sync URL config',
            },
            {
              kind: 'subcmd',
              name: 'deinit <path>...',
              desc: 'Unregister submodules',
            },
            { kind: 'subcmd', name: 'set-branch <path>', desc: 'Set branch' },
            { kind: 'subcmd', name: 'set-url <path> <url>', desc: 'Set URL' },
            {
              kind: 'subcmd',
              name: 'absorbgitdirs',
              desc: 'Move .git dirs into superproject',
            },
            {
              kind: 'flag',
              name: '--remote',
              desc: 'Use remote-tracking branch',
            },
            {
              kind: 'flag',
              name: '--recursive',
              desc: 'Recurse into nested submodules',
            },
            { kind: 'flag', name: '--init', desc: 'Initialize before update' },
            {
              kind: 'flag',
              name: '-j, --jobs <n>',
              desc: 'Parallel clone jobs',
            },
          ],
        },
      ],
    },
  ],
};
