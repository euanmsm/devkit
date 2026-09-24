export const stack = {
  name: 'stack',
  description: 'Stacked pull requests — chains of dependent PRs',
  sections: [
    {
      title: 'stack — Stacked pull requests',
      items: [
        {
          kind: 'note',
          text: 'Not built in. Install: gh extension install github/gh-stack',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: "A stack is an ordered list of branches, bottom to top. Each PR's base is the branch below it; the bottom sits on trunk.",
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: "A stack has a number of its own, shown in GitHub's UI, and it never collides with a PR number — commands take either.",
        },
        { kind: 'gap' },
        { kind: 'note', text: 'Docs: https://gh.io/stacks' },
      ],
    },
    {
      title: 'A typical run',
      items: [
        {
          kind: 'cmd',
          name: 'gh stack init auth-layer',
          desc: 'Start a stack, first branch on main',
        },
        {
          kind: 'cmd',
          name: "gh stack add -Am 'API routes'",
          desc: 'Commit everything, branch on top',
        },
        {
          kind: 'cmd',
          name: 'gh stack submit',
          desc: 'Push the lot and open the PRs',
        },
        {
          kind: 'cmd',
          name: 'gh stack down',
          desc: 'Drop back a branch to fix review notes',
        },
        {
          kind: 'cmd',
          name: 'gh stack sync --prune',
          desc: 'Rebase, push, delete merged branches',
        },
      ],
    },
    {
      title: 'Building a stack',
      items: [
        {
          kind: 'cmd',
          name: 'gh stack init [<branch>...]',
          desc: 'Start a stack in this repo',
          children: [
            {
              kind: 'flag',
              name: '-b, --base <branch>',
              desc: 'Trunk to build on (default: default branch)',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'Several names build several layers at once, bottom first. Branches that exist already are adopted, the rest created.',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack add [<branch>]',
          desc: 'Add a branch on top of the stack',
          children: [
            {
              kind: 'flag',
              name: '-m, --message <text>',
              desc: 'Commit with this message first',
            },
            {
              kind: 'flag',
              name: '-A, --all',
              desc: 'Stage everything, untracked included',
            },
            {
              kind: 'flag',
              name: '-u, --update',
              desc: 'Stage tracked files only',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: '-m with no branch name invents one from the message. -A or -u without -m opens your editor for the message.',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack modify',
          desc: 'Restructure the stack in a TUI',
          children: [
            {
              kind: 'flag',
              name: '--continue',
              desc: 'Carry on after fixing conflicts',
            },
            {
              kind: 'flag',
              name: '--abort',
              desc: 'Throw it away, restore the stack',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'Drop, fold, insert, reorder, rename. Ctrl+S applies it all. Run submit afterwards if those branches already have PRs.',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack unstack [<stack-no>]',
          desc: 'Unstack here and on GitHub',
          children: [
            {
              kind: 'flag',
              name: '--local',
              desc: 'Only forget it here, leave GitHub alone',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'Also spelled `gh stack delete`. Nothing is deleted — the PRs and branches stay, they just stop being a stack. PRs queued or on auto-merge refuse, and the stack is kept.',
            },
          ],
        },
      ],
    },
    {
      title: 'Onto GitHub and back',
      items: [
        {
          kind: 'cmd',
          name: 'gh stack submit',
          desc: 'Push branches, create/update the PRs',
          children: [
            {
              kind: 'flag',
              name: '--auto',
              desc: 'No editor, auto-generated titles',
            },
            {
              kind: 'flag',
              name: '--open',
              desc: 'Ready for review rather than draft',
            },
            {
              kind: 'flag',
              name: '--remote <name>',
              desc: 'Remote to push to (default: detected)',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'One screen to title and describe every new PR: ^x deselects, Ctrl+S sends the lot. --auto skips it and creates drafts unless you add --open.',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack sync',
          desc: 'Fetch, rebase, push, reconcile PR state',
          children: [
            {
              kind: 'flag',
              name: '--prune',
              desc: 'Delete local branches of merged PRs',
            },
            {
              kind: 'flag',
              name: '--remote <name>',
              desc: 'Remote to use (default: detected)',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: "Fast-forwards trunk, cascade-rebases, pushes every branch at once with --force-with-lease --atomic, then links the PRs. PRs added to the stack on GitHub are pulled down. If the two sides disagree it asks which wins; cancelling pushes nothing. A conflict rolls it all back — use `gh stack rebase` instead. Never opens PRs, that being submit's job.",
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack rebase [<branch>]',
          desc: 'Cascading rebase across the stack',
          children: [
            {
              kind: 'flag',
              name: '--downstack',
              desc: 'Trunk up to the current branch only',
            },
            {
              kind: 'flag',
              name: '--upstack',
              desc: 'Current branch to the top only',
            },
            {
              kind: 'flag',
              name: '--no-trunk',
              desc: 'Skip trunk, rebase branches on each other',
            },
            {
              kind: 'flag',
              name: '--continue',
              desc: 'Carry on after fixing conflicts',
            },
            {
              kind: 'flag',
              name: '--abort',
              desc: 'Stop and restore every branch',
            },
            {
              kind: 'flag',
              name: '--preserve-dates',
              desc: 'Keep author dates as committer dates',
            },
            {
              kind: 'flag',
              name: '--committer-date-is-author-date',
              desc: 'The long spelling of --preserve-dates',
            },
            {
              kind: 'flag',
              name: '--remote <name>',
              desc: 'Remote to fetch from (default: detected)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack push',
          desc: "Push the stack's active branches",
          children: [
            {
              kind: 'flag',
              name: '--remote <name>',
              desc: 'Remote to push to (default: detected)',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'Per-branch --force-with-lease, and not atomic: one branch can land while another is rejected. Fix it and run again — what went up stays put. Merged and queued branches are skipped.',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack merge [<stack-no>|<pr-no>]',
          desc: 'Merge the stack, all or nothing',
          children: [
            {
              kind: 'flag',
              name: '-y, --yes',
              desc: 'No wizard, no confirmation',
            },
            { kind: 'flag', name: '--squash', desc: 'Squash and merge' },
            { kind: 'flag', name: '--merge', desc: 'Merge commit' },
            { kind: 'flag', name: '--rebase', desc: 'Rebase and merge' },
            {
              kind: 'flag',
              name: '--merge-method <merge|squash|rebase>',
              desc: 'The same, spelled out',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: "Everything up to and including your chosen PR merges in one operation: if any of them can't merge, none of them do. A bare number is read as a stack number first, then as a PR. GitHub judges branch protection as it runs, and a stack merge cannot bypass it. A merge queue on the base takes the stack.",
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack link <branch|pr>...',
          desc: 'Stack PRs on GitHub, no local tracking',
          children: [
            {
              kind: 'flag',
              name: '--base <branch>',
              desc: 'Base for the bottom (default: default branch)',
            },
            {
              kind: 'flag',
              name: '--open',
              desc: 'Ready for review rather than draft',
            },
            {
              kind: 'flag',
              name: '--remote <name>',
              desc: 'Remote to push to (default: detected)',
            },
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'For branches managed elsewhere — jj, Sapling, ghstack, git-town. Arguments go bottom to top; branches are pushed and given PRs if they lack them, and existing PRs are never removed. A stack number first appends to that stack.',
            },
          ],
        },
      ],
    },
    {
      title: 'Looking and moving around',
      items: [
        {
          kind: 'cmd',
          name: 'gh stack view',
          desc: 'The current stack and its PR states',
          children: [
            { kind: 'flag', name: '-s, --short', desc: 'One line per branch' },
            { kind: 'flag', name: '--json', desc: 'Machine-readable output' },
            { kind: 'gap' },
            {
              kind: 'note',
              text: '✓ merged   ◎ queued   ○ open   ⚠ needs rebase',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack checkout [<what>]',
          desc: 'Check out a stack',
          children: [
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'Takes a stack number, PR number, PR URL or branch name. A PR not tracked here is looked up on GitHub and set up locally. No argument gives a picker of every stack open to you, local or not, with the fully merged ones left out.',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack switch',
          desc: 'Pick a branch in this stack from a list',
        },
        {
          kind: 'cmd',
          name: 'gh stack up [<n>]',
          desc: 'Up n branches, away from trunk',
        },
        {
          kind: 'cmd',
          name: 'gh stack down [<n>]',
          desc: 'Down n branches, towards trunk',
        },
        {
          kind: 'cmd',
          name: 'gh stack top',
          desc: 'The top branch, furthest from trunk',
        },
        {
          kind: 'cmd',
          name: 'gh stack bottom',
          desc: 'The bottom branch, nearest trunk',
        },
        {
          kind: 'cmd',
          name: 'gh stack trunk',
          desc: 'The branch the stack is built on',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Every one of these skips branches whose PR has merged.',
        },
      ],
    },
    {
      title: 'Utilities',
      items: [
        {
          kind: 'cmd',
          name: 'gh stack alias [<name>]',
          desc: 'Shell wrapper so `gs` means `gh stack`',
          children: [
            { kind: 'flag', name: '--remove', desc: 'Take the alias away' },
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'Writes a script into ~/.local/bin/. Defaults to the name gs.',
            },
            { kind: 'gap' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh stack feedback [<title>]',
          desc: 'Open a discussion on gh-stack',
        },
        {
          kind: 'cmd',
          name: 'gh stack --version',
          desc: 'Version of the extension itself',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Update it with: gh extension upgrade gh-stack',
        },
      ],
    },
  ],
};
