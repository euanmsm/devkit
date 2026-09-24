export const patching = {
  name: 'patching',
  description: 'rebase, cherry-pick, revert, apply',
  sections: [
    {
      title: 'Patching',
      items: [
        {
          kind: 'cmd',
          name: 'git cherry-pick <commit>...',
          desc: 'Apply existing commits',
          children: [
            { kind: 'flag', name: '-e, --edit', desc: 'Edit message' },
            {
              kind: 'flag',
              name: '-x',
              desc: "Append '(cherry picked from ...)'",
            },
            {
              kind: 'flag',
              name: '-m, --mainline <n>',
              desc: 'Parent number for merges',
            },
            {
              kind: 'flag',
              name: '-n, --no-commit',
              desc: 'Apply without committing',
            },
            { kind: 'flag', name: '-s, --signoff', desc: 'Add Signed-off-by' },
            { kind: 'flag', name: '-S, --gpg-sign', desc: 'GPG-sign' },
            { kind: 'flag', name: '--ff', desc: 'Fast-forward if possible' },
            {
              kind: 'flag',
              name: '--strategy / -X',
              desc: 'Merge strategy/options',
            },
            {
              kind: 'flag',
              name: '--allow-empty',
              desc: 'Allow empty commits',
            },
            {
              kind: 'flag',
              name: '--empty=<drop|keep|stop>',
              desc: 'Handle redundant commits',
            },
            {
              kind: 'flag',
              name: '--abort / --continue / --skip / --quit',
              desc: 'Control flow',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git revert <commit>...',
          desc: 'Create inverse commits',
          children: [
            {
              kind: 'flag',
              name: '-e, --edit / --no-edit',
              desc: 'Edit revert message',
            },
            {
              kind: 'flag',
              name: '-m, --mainline <n>',
              desc: 'Parent for merge revert',
            },
            {
              kind: 'flag',
              name: '-n, --no-commit',
              desc: "Don't auto-commit",
            },
            { kind: 'flag', name: '-s, --signoff', desc: 'Add Signed-off-by' },
            { kind: 'flag', name: '-S, --gpg-sign', desc: 'GPG-sign' },
            {
              kind: 'flag',
              name: '--strategy / -X',
              desc: 'Merge strategy/options',
            },
            {
              kind: 'flag',
              name: '--abort / --continue / --skip / --quit',
              desc: 'Control flow',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git stash [push]',
          desc: 'Stash working directory changes',
          children: [
            {
              kind: 'subcmd',
              name: 'push [-m <msg>] [<pathspec>]',
              desc: 'Save changes (default)',
            },
            { kind: 'subcmd', name: 'list', desc: 'List stash entries' },
            { kind: 'subcmd', name: 'show [<stash>]', desc: 'Show stash diff' },
            { kind: 'subcmd', name: 'pop [<stash>]', desc: 'Apply and drop' },
            {
              kind: 'subcmd',
              name: 'apply [<stash>]',
              desc: 'Apply without dropping',
            },
            { kind: 'subcmd', name: 'drop [<stash>]', desc: 'Delete an entry' },
            { kind: 'subcmd', name: 'clear', desc: 'Delete all entries' },
            {
              kind: 'subcmd',
              name: 'branch <branch> [<stash>]',
              desc: 'Create branch from stash',
            },
            {
              kind: 'flag',
              name: '-u, --include-untracked',
              desc: 'Include untracked files',
            },
            {
              kind: 'flag',
              name: '-a, --all',
              desc: 'Include ignored + untracked',
            },
            {
              kind: 'flag',
              name: '-k, --keep-index',
              desc: "Don't unstage already-staged",
            },
            {
              kind: 'flag',
              name: '-S, --staged',
              desc: 'Stash only staged changes',
            },
            {
              kind: 'flag',
              name: '-p, --patch',
              desc: 'Interactive hunk selection',
            },
            {
              kind: 'flag',
              name: '-m, --message <msg>',
              desc: 'Stash description',
            },
            {
              kind: 'flag',
              name: '--index',
              desc: 'Reinstate index state (pop/apply)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git apply <patch>',
          desc: 'Apply a patch',
          children: [
            { kind: 'flag', name: '--stat', desc: 'Diffstat only' },
            { kind: 'flag', name: '--check', desc: 'Check applicability' },
            {
              kind: 'flag',
              name: '--index',
              desc: 'Apply to index + working tree',
            },
            { kind: 'flag', name: '--cached', desc: 'Apply to index only' },
            {
              kind: 'flag',
              name: '-3, --3way',
              desc: 'Attempt three-way merge',
            },
            { kind: 'flag', name: '-R, --reverse', desc: 'Apply in reverse' },
            {
              kind: 'flag',
              name: '--reject',
              desc: 'Leave .rej files for failures',
            },
            {
              kind: 'flag',
              name: '--whitespace=<action>',
              desc: 'nowarn, warn, fix, error',
            },
            { kind: 'flag', name: '-p<n>', desc: 'Strip n path components' },
          ],
        },
        {
          kind: 'cmd',
          name: 'git format-patch <range>',
          desc: 'Prepare patches for email',
          children: [
            {
              kind: 'flag',
              name: '-o, --output-directory <dir>',
              desc: 'Output directory',
            },
            { kind: 'flag', name: '--stdout', desc: 'Output to stdout' },
            { kind: 'flag', name: '-n, --numbered', desc: 'Number patches' },
            { kind: 'flag', name: '-s, --signoff', desc: 'Add Signed-off-by' },
            {
              kind: 'flag',
              name: '--cover-letter',
              desc: 'Generate cover letter',
            },
            {
              kind: 'flag',
              name: '--subject-prefix=<prefix>',
              desc: 'Custom prefix',
            },
            {
              kind: 'flag',
              name: '--to / --cc <email>',
              desc: 'Add To/Cc headers',
            },
            {
              kind: 'flag',
              name: '-v, --reroll-count=<n>',
              desc: 'Reroll count',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git am <mbox>...',
          desc: 'Apply mailbox patches',
          children: [
            {
              kind: 'flag',
              name: '-3, --3way',
              desc: 'Fall back to three-way merge',
            },
            { kind: 'flag', name: '-s, --signoff', desc: 'Add Signed-off-by' },
            { kind: 'flag', name: '-k, --keep', desc: 'Keep Subject prefix' },
            { kind: 'flag', name: '-S, --gpg-sign', desc: 'GPG-sign' },
            {
              kind: 'flag',
              name: '--abort / --continue / --skip',
              desc: 'Control flow',
            },
          ],
        },
      ],
    },
  ],
};
