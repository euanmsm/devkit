export const issue = {
  name: 'issue',
  description: 'Create, list, edit and close issues',
  sections: [
    {
      title: 'issue — Manage issues',
      items: [
        {
          kind: 'cmd',
          name: 'gh issue create',
          desc: 'Create an issue',
          children: [
            { kind: 'flag', name: '-t, --title <text>', desc: 'Title' },
            { kind: 'flag', name: '-b, --body <text>', desc: 'Body' },
            {
              kind: 'flag',
              name: '-F, --body-file <file>',
              desc: 'Read body from file',
            },
            {
              kind: 'flag',
              name: '-a, --assignee <login>',
              desc: 'Assignees (@me to self-assign)',
            },
            { kind: 'flag', name: '-l, --label <name>', desc: 'Labels' },
            { kind: 'flag', name: '-m, --milestone <name>', desc: 'Milestone' },
            { kind: 'flag', name: '-p, --project <title>', desc: 'Project' },
            {
              kind: 'flag',
              name: '-T, --template <name>',
              desc: 'Issue template',
            },
            { kind: 'flag', name: '-e, --editor', desc: 'Open editor' },
            { kind: 'flag', name: '-w, --web', desc: 'Open browser' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh issue list',
          desc: 'List issues',
          children: [
            {
              kind: 'flag',
              name: '-s, --state <open|closed|all>',
              desc: 'Filter state (default: open)',
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
              name: '-l, --label <strings>',
              desc: 'Filter by label',
            },
            {
              kind: 'flag',
              name: '-m, --milestone <name>',
              desc: 'Filter by milestone',
            },
            {
              kind: 'flag',
              name: '-S, --search <query>',
              desc: 'Search query',
            },
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max issues (default 30)',
            },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh issue view <number>',
          desc: 'View an issue',
          children: [
            { kind: 'flag', name: '-c, --comments', desc: 'View comments' },
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh issue edit <number>',
          desc: 'Edit an issue',
          children: [
            {
              kind: 'flag',
              name: '-t, --title / -b, --body',
              desc: 'Set title/body',
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
              name: '--add-project / --remove-project',
              desc: 'Manage projects',
            },
            {
              kind: 'flag',
              name: '-m, --milestone / --remove-milestone',
              desc: 'Manage milestone',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh issue close <number>',
          desc: 'Close an issue',
          children: [
            {
              kind: 'flag',
              name: '-r, --reason <completed|not planned>',
              desc: 'Close reason',
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
          name: 'gh issue reopen <number>',
          desc: 'Reopen an issue',
        },
        {
          kind: 'cmd',
          name: 'gh issue delete <number>',
          desc: 'Delete an issue',
        },
        {
          kind: 'cmd',
          name: 'gh issue transfer <number> <repo>',
          desc: 'Transfer to another repo',
        },
        {
          kind: 'cmd',
          name: 'gh issue comment <number>',
          desc: 'Add a comment',
          children: [
            { kind: 'flag', name: '-b, --body <text>', desc: 'Comment body' },
            { kind: 'flag', name: '-e, --editor', desc: 'Open editor' },
            { kind: 'flag', name: '--edit-last', desc: 'Edit last comment' },
            {
              kind: 'flag',
              name: '--delete-last',
              desc: 'Delete last comment',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh issue lock <number>',
          desc: 'Lock conversation',
          children: [
            {
              kind: 'flag',
              name: '-r, --reason <off_topic|...>',
              desc: 'Lock reason',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh issue unlock <number>',
          desc: 'Unlock conversation',
        },
        {
          kind: 'cmd',
          name: 'gh issue pin / unpin <number>',
          desc: 'Pin/unpin issue',
        },
        {
          kind: 'cmd',
          name: 'gh issue develop <number>',
          desc: 'Create linked branch',
          children: [
            { kind: 'flag', name: '-n, --name <branch>', desc: 'Branch name' },
            {
              kind: 'flag',
              name: '-c, --checkout',
              desc: 'Checkout after creating',
            },
            { kind: 'flag', name: '-b, --base <branch>', desc: 'Base branch' },
            { kind: 'flag', name: '-l, --list', desc: 'List linked branches' },
          ],
        },
      ],
    },
  ],
};
