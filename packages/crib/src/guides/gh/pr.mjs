export const pr = {
  name: 'pr',
  description: 'Pull requests — create, review, merge',
  sections: [
    {
      title: 'pr — Manage pull requests',
      items: [
        {
          kind: 'cmd',
          name: 'gh pr create',
          desc: 'Create a pull request',
          children: [
            { kind: 'flag', name: '-t, --title <text>', desc: 'Title' },
            { kind: 'flag', name: '-b, --body <text>', desc: 'Body' },
            {
              kind: 'flag',
              name: '-F, --body-file <file>',
              desc: 'Read body from file',
            },
            { kind: 'flag', name: '-B, --base <branch>', desc: 'Base branch' },
            { kind: 'flag', name: '-H, --head <branch>', desc: 'Head branch' },
            { kind: 'flag', name: '-d, --draft', desc: 'Mark as draft' },
            { kind: 'flag', name: '-a, --assignee <login>', desc: 'Assignees' },
            {
              kind: 'flag',
              name: '-r, --reviewer <handle>',
              desc: 'Request reviews',
            },
            { kind: 'flag', name: '-l, --label <name>', desc: 'Labels' },
            { kind: 'flag', name: '-m, --milestone <name>', desc: 'Milestone' },
            { kind: 'flag', name: '-p, --project <title>', desc: 'Project' },
            {
              kind: 'flag',
              name: '-f, --fill',
              desc: 'Use commit info for title/body',
            },
            {
              kind: 'flag',
              name: '--fill-first',
              desc: 'Use first commit info',
            },
            {
              kind: 'flag',
              name: '--no-maintainer-edit',
              desc: 'Disable maintainer edit',
            },
            {
              kind: 'flag',
              name: '--dry-run',
              desc: 'Print details without creating',
            },
            { kind: 'flag', name: '-e, --editor', desc: 'Open editor' },
            { kind: 'flag', name: '-w, --web', desc: 'Open browser' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr list',
          desc: 'List pull requests',
          children: [
            {
              kind: 'flag',
              name: '-s, --state <open|closed|merged|all>',
              desc: 'Filter state',
            },
            {
              kind: 'flag',
              name: '-a, --assignee <login>',
              desc: 'Filter by assignee',
            },
            {
              kind: 'flag',
              name: '-A, --author <login>',
              desc: 'Filter by author',
            },
            {
              kind: 'flag',
              name: '-B, --base <branch>',
              desc: 'Filter by base branch',
            },
            {
              kind: 'flag',
              name: '-H, --head <branch>',
              desc: 'Filter by head branch',
            },
            {
              kind: 'flag',
              name: '-l, --label <strings>',
              desc: 'Filter by label',
            },
            { kind: 'flag', name: '-d, --draft', desc: 'Filter drafts' },
            {
              kind: 'flag',
              name: '-S, --search <query>',
              desc: 'Search query',
            },
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max items (default 30)',
            },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr view [<number>]',
          desc: 'View a pull request',
          children: [
            { kind: 'flag', name: '-c, --comments', desc: 'View comments' },
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr checkout <number>',
          desc: 'Checkout a PR branch',
          children: [
            {
              kind: 'flag',
              name: '-b, --branch <name>',
              desc: 'Local branch name',
            },
            {
              kind: 'flag',
              name: '--detach',
              desc: 'Checkout with detached HEAD',
            },
            {
              kind: 'flag',
              name: '-f, --force',
              desc: 'Reset existing local branch',
            },
            {
              kind: 'flag',
              name: '--recurse-submodules',
              desc: 'Update submodules',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr diff [<number>]',
          desc: 'View PR diff',
          children: [
            {
              kind: 'flag',
              name: '--color <always|never|auto>',
              desc: 'Color output',
            },
            { kind: 'flag', name: '--name-only', desc: 'Only file names' },
            { kind: 'flag', name: '--patch', desc: 'Patch format' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr edit [<number>]',
          desc: 'Edit a PR',
          children: [
            {
              kind: 'flag',
              name: '-t, --title / -b, --body',
              desc: 'Set title/body',
            },
            {
              kind: 'flag',
              name: '-B, --base <branch>',
              desc: 'Change base branch',
            },
            {
              kind: 'flag',
              name: '--add-label / --remove-label',
              desc: 'Manage labels',
            },
            {
              kind: 'flag',
              name: '--add-assignee / --remove-assignee',
              desc: 'Manage assignees',
            },
            {
              kind: 'flag',
              name: '--add-reviewer / --remove-reviewer',
              desc: 'Manage reviewers',
            },
            {
              kind: 'flag',
              name: '--add-project / --remove-project',
              desc: 'Manage projects',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr merge [<number>]',
          desc: 'Merge a PR',
          children: [
            {
              kind: 'flag',
              name: '-m, --merge',
              desc: 'Merge commit strategy',
            },
            { kind: 'flag', name: '-s, --squash', desc: 'Squash strategy' },
            { kind: 'flag', name: '-r, --rebase', desc: 'Rebase strategy' },
            {
              kind: 'flag',
              name: '-d, --delete-branch',
              desc: 'Delete branch after merge',
            },
            {
              kind: 'flag',
              name: '--auto',
              desc: 'Auto-merge when requirements met',
            },
            {
              kind: 'flag',
              name: '--disable-auto',
              desc: 'Disable auto-merge',
            },
            {
              kind: 'flag',
              name: '--admin',
              desc: 'Admin merge (bypass requirements)',
            },
            {
              kind: 'flag',
              name: '-t, --subject <text>',
              desc: 'Merge commit subject',
            },
            {
              kind: 'flag',
              name: '-b, --body <text>',
              desc: 'Merge commit body',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr close [<number>]',
          desc: 'Close a PR',
          children: [
            {
              kind: 'flag',
              name: '-d, --delete-branch',
              desc: 'Delete branch',
            },
            {
              kind: 'flag',
              name: '-c, --comment <text>',
              desc: 'Closing comment',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr reopen [<number>]',
          desc: 'Reopen a PR',
        },
        {
          kind: 'cmd',
          name: 'gh pr ready [<number>]',
          desc: 'Mark as ready for review',
          children: [
            { kind: 'flag', name: '--undo', desc: 'Convert to draft' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr review [<number>]',
          desc: 'Add a review',
          children: [
            { kind: 'flag', name: '-a, --approve', desc: 'Approve' },
            {
              kind: 'flag',
              name: '-r, --request-changes',
              desc: 'Request changes',
            },
            { kind: 'flag', name: '-c, --comment', desc: 'Comment' },
            { kind: 'flag', name: '-b, --body <text>', desc: 'Review body' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr checks [<number>]',
          desc: 'View status checks',
          children: [
            { kind: 'flag', name: '--watch', desc: 'Watch until finished' },
            {
              kind: 'flag',
              name: '--fail-fast',
              desc: 'Exit on first failure',
            },
            { kind: 'flag', name: '--required', desc: 'Only required checks' },
            {
              kind: 'flag',
              name: '-i, --interval <secs>',
              desc: 'Refresh interval',
            },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr comment <number>',
          desc: 'Add a comment',
        },
        {
          kind: 'cmd',
          name: 'gh pr lock / unlock <number>',
          desc: 'Lock/unlock conversation',
        },
        {
          kind: 'cmd',
          name: 'gh pr revert <number>',
          desc: 'Create revert PR',
        },
        {
          kind: 'cmd',
          name: 'gh pr update-branch <number>',
          desc: 'Update PR branch',
          children: [
            { kind: 'flag', name: '--rebase', desc: 'Update by rebasing' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh pr status',
          desc: 'Show PR status',
          children: [
            {
              kind: 'flag',
              name: '-c, --conflict-status',
              desc: 'Show merge conflict status',
            },
          ],
        },
      ],
    },
  ],
};
