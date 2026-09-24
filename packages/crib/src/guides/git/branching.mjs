export const branching = {
  name: 'branching',
  description: 'branch, checkout, switch, merge, worktree',
  sections: [
    {
      title: 'Branching & Merging',
      items: [
        {
          kind: 'cmd',
          name: 'git branch [<options>]',
          desc: 'List, create, delete branches',
          children: [
            { kind: 'flag', name: '-a, --all', desc: 'List local and remote' },
            {
              kind: 'flag',
              name: '-r, --remotes',
              desc: 'List remote-tracking',
            },
            {
              kind: 'flag',
              name: '-d, --delete',
              desc: 'Delete (must be merged)',
            },
            { kind: 'flag', name: '-D', desc: 'Force delete' },
            { kind: 'flag', name: '-m, --move', desc: 'Rename' },
            { kind: 'flag', name: '-M', desc: 'Force rename' },
            {
              kind: 'flag',
              name: '-c, --copy',
              desc: 'Copy branch and reflog',
            },
            { kind: 'flag', name: '-f, --force', desc: 'Force create/reset' },
            {
              kind: 'flag',
              name: '-v, -vv',
              desc: 'Show SHA + subject (vv: upstream)',
            },
            {
              kind: 'flag',
              name: '--show-current',
              desc: 'Print current branch name',
            },
            {
              kind: 'flag',
              name: '-u, --set-upstream-to=<upstream>',
              desc: 'Set upstream',
            },
            { kind: 'flag', name: '--unset-upstream', desc: 'Remove upstream' },
            { kind: 'flag', name: '--sort=<key>', desc: 'Sort order' },
            {
              kind: 'flag',
              name: '--contains / --no-contains <commit>',
              desc: 'Filter by containment',
            },
            {
              kind: 'flag',
              name: '--merged / --no-merged <commit>',
              desc: 'Filter by merge state',
            },
            {
              kind: 'flag',
              name: '-t, --track[=direct|inherit]',
              desc: 'Set up tracking',
            },
            {
              kind: 'flag',
              name: '--edit-description',
              desc: 'Edit branch description',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git switch <branch>',
          desc: 'Switch branches',
          children: [
            {
              kind: 'flag',
              name: '-c, --create <branch>',
              desc: 'Create and switch',
            },
            {
              kind: 'flag',
              name: '-C, --force-create <branch>',
              desc: 'Create/reset and switch',
            },
            { kind: 'flag', name: '-d, --detach', desc: 'Detach HEAD' },
            { kind: 'flag', name: '-m, --merge', desc: 'Three-way merge' },
            {
              kind: 'flag',
              name: '--discard-changes',
              desc: 'Discard local changes',
            },
            {
              kind: 'flag',
              name: '--guess / --no-guess',
              desc: 'Auto-create from remote',
            },
            {
              kind: 'flag',
              name: '--orphan <branch>',
              desc: 'Create orphan branch',
            },
            { kind: 'flag', name: '-t, --track', desc: 'Set up tracking' },
          ],
        },
        {
          kind: 'cmd',
          name: 'git checkout <branch|pathspec>',
          desc: 'Switch or restore',
          children: [
            { kind: 'flag', name: '-b <branch>', desc: 'Create and switch' },
            {
              kind: 'flag',
              name: '-B <branch>',
              desc: 'Create/reset and switch',
            },
            { kind: 'flag', name: '-d, --detach', desc: 'Detach HEAD' },
            {
              kind: 'flag',
              name: '--orphan <branch>',
              desc: 'Create orphan branch',
            },
            { kind: 'flag', name: '-t, --track', desc: 'Set up tracking' },
            { kind: 'flag', name: '-f, --force', desc: 'Force switch' },
            { kind: 'flag', name: '-m, --merge', desc: 'Three-way merge' },
            {
              kind: 'flag',
              name: '--ours / --theirs',
              desc: 'Merge stage for paths',
            },
            {
              kind: 'flag',
              name: '-p, --patch',
              desc: 'Interactive hunk selection',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git merge <branch>...',
          desc: 'Merge branches',
          children: [
            {
              kind: 'flag',
              name: '--ff / --no-ff / --ff-only',
              desc: 'Fast-forward strategy',
            },
            {
              kind: 'flag',
              name: '--squash',
              desc: 'Squash merge (no merge commit)',
            },
            { kind: 'flag', name: '-m <msg>', desc: 'Merge message' },
            {
              kind: 'flag',
              name: '-s, --strategy=<strategy>',
              desc: 'ort, recursive, octopus, ours',
            },
            {
              kind: 'flag',
              name: '-X, --strategy-option=<opt>',
              desc: 'Strategy option',
            },
            {
              kind: 'flag',
              name: '--no-commit',
              desc: 'Merge without committing',
            },
            {
              kind: 'flag',
              name: '-e, --edit / --no-edit',
              desc: 'Edit merge message',
            },
            { kind: 'flag', name: '--signoff', desc: 'Add Signed-off-by' },
            { kind: 'flag', name: '-S, --gpg-sign', desc: 'GPG-sign' },
            {
              kind: 'flag',
              name: '--verify-signatures',
              desc: 'Verify GPG sigs on commits',
            },
            {
              kind: 'flag',
              name: '--autostash',
              desc: 'Auto-stash before merge',
            },
            {
              kind: 'flag',
              name: '--allow-unrelated-histories',
              desc: 'Allow unrelated histories',
            },
            {
              kind: 'flag',
              name: '--abort / --continue / --quit',
              desc: 'Conflict resolution',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git rebase [<upstream>] [<branch>]',
          desc: 'Reapply commits',
          children: [
            {
              kind: 'flag',
              name: '--onto <newbase>',
              desc: 'Rebase onto specified base',
            },
            {
              kind: 'flag',
              name: '-i, --interactive',
              desc: 'Interactive rebase',
            },
            {
              kind: 'flag',
              name: '--root',
              desc: 'Rebase all reachable commits',
            },
            {
              kind: 'flag',
              name: '--exec <cmd>',
              desc: 'Run command after each commit',
            },
            {
              kind: 'flag',
              name: '--rebase-merges',
              desc: 'Recreate merge commits',
            },
            {
              kind: 'flag',
              name: '--autosquash',
              desc: 'Auto-squash fixup!/squash!',
            },
            { kind: 'flag', name: '--autostash', desc: 'Auto-stash/unstash' },
            {
              kind: 'flag',
              name: '--update-refs',
              desc: 'Update stacked branches',
            },
            {
              kind: 'flag',
              name: '-f, --force-rebase',
              desc: 'Force even if up-to-date',
            },
            {
              kind: 'flag',
              name: '-s, --strategy=<strategy>',
              desc: 'Merge strategy',
            },
            {
              kind: 'flag',
              name: '-X, --strategy-option=<opt>',
              desc: 'Strategy option',
            },
            { kind: 'flag', name: '--signoff', desc: 'Add Signed-off-by' },
            { kind: 'flag', name: '-S, --gpg-sign', desc: 'GPG-sign' },
            { kind: 'flag', name: '--no-verify', desc: 'Bypass hooks' },
            {
              kind: 'flag',
              name: '--committer-date-is-author-date',
              desc: 'Keep author date',
            },
            { kind: 'flag', name: '--ignore-date', desc: 'Use current time' },
            {
              kind: 'flag',
              name: '--empty=<drop|keep|stop>',
              desc: 'Handle empty commits',
            },
            {
              kind: 'flag',
              name: '--abort / --continue / --skip / --quit',
              desc: 'Control flow',
            },
            {
              kind: 'flag',
              name: '--edit-todo',
              desc: 'Edit interactive todo',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git tag [<name>] [<commit>]',
          desc: 'Create, list, delete tags',
          children: [
            {
              kind: 'flag',
              name: '-a, --annotate',
              desc: 'Create annotated tag',
            },
            { kind: 'flag', name: '-m, --message <msg>', desc: 'Tag message' },
            {
              kind: 'flag',
              name: '-F, --file <file>',
              desc: 'Read message from file',
            },
            { kind: 'flag', name: '-s, --sign', desc: 'GPG-sign' },
            { kind: 'flag', name: '-d, --delete', desc: 'Delete tag' },
            {
              kind: 'flag',
              name: '-v, --verify',
              desc: 'Verify GPG signature',
            },
            { kind: 'flag', name: '-l, --list', desc: 'List tags' },
            { kind: 'flag', name: '-f, --force', desc: 'Replace existing tag' },
            { kind: 'flag', name: '--sort=<key>', desc: 'Sort order' },
            {
              kind: 'flag',
              name: '--contains / --no-contains',
              desc: 'Filter by containment',
            },
            {
              kind: 'flag',
              name: '--merged / --no-merged',
              desc: 'Filter by merge state',
            },
            {
              kind: 'flag',
              name: '--points-at <object>',
              desc: 'Filter by target',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git worktree <subcommand>',
          desc: 'Manage working trees',
          children: [
            {
              kind: 'subcmd',
              name: 'add <path> [<branch>]',
              desc: 'Add a linked working tree',
            },
            { kind: 'subcmd', name: 'list', desc: 'List working trees' },
            {
              kind: 'subcmd',
              name: 'remove <worktree>',
              desc: 'Remove a working tree',
            },
            {
              kind: 'subcmd',
              name: 'move <worktree> <new-path>',
              desc: 'Move a working tree',
            },
            {
              kind: 'subcmd',
              name: 'prune',
              desc: 'Prune stale worktree info',
            },
            {
              kind: 'subcmd',
              name: 'lock / unlock <worktree>',
              desc: 'Lock/unlock worktree',
            },
            {
              kind: 'flag',
              name: '-b, -B <branch>',
              desc: 'Create new branch',
            },
            { kind: 'flag', name: '-d, --detach', desc: 'Detach HEAD' },
            { kind: 'flag', name: '--lock', desc: 'Lock after creation' },
            {
              kind: 'flag',
              name: '--orphan',
              desc: 'Create with unborn branch',
            },
          ],
        },
      ],
    },
  ],
};
