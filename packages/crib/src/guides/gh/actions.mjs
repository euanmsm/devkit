export const actions = {
  name: 'actions',
  description: 'Workflow runs, workflows and caches',
  sections: [
    {
      title: 'run — Manage workflow runs',
      items: [
        {
          kind: 'cmd',
          name: 'gh run list',
          desc: 'List recent workflow runs',
          children: [
            {
              kind: 'flag',
              name: '-w, --workflow <name>',
              desc: 'Filter by workflow',
            },
            {
              kind: 'flag',
              name: '-b, --branch <branch>',
              desc: 'Filter by branch',
            },
            {
              kind: 'flag',
              name: '-s, --status <status>',
              desc: 'Filter by status',
            },
            {
              kind: 'flag',
              name: '-e, --event <event>',
              desc: 'Filter by event',
            },
            { kind: 'flag', name: '-u, --user <user>', desc: 'Filter by user' },
            {
              kind: 'flag',
              name: '-c, --commit <sha>',
              desc: 'Filter by commit',
            },
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max runs (default 20)',
            },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh run view <run-id>',
          desc: 'View a run',
          children: [
            {
              kind: 'flag',
              name: '-j, --job <job-id>',
              desc: 'View specific job',
            },
            { kind: 'flag', name: '-v, --verbose', desc: 'Show job steps' },
            { kind: 'flag', name: '--log', desc: 'View full log' },
            {
              kind: 'flag',
              name: '--log-failed',
              desc: 'View log for failed steps',
            },
            {
              kind: 'flag',
              name: '--exit-status',
              desc: 'Exit non-zero if failed',
            },
            { kind: 'flag', name: '-a, --attempt <n>', desc: 'Attempt number' },
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh run watch <run-id>',
          desc: 'Watch a run in progress',
          children: [
            {
              kind: 'flag',
              name: '-i, --interval <secs>',
              desc: 'Refresh interval (default 3)',
            },
            {
              kind: 'flag',
              name: '--exit-status',
              desc: 'Exit non-zero if failed',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh run rerun <run-id>',
          desc: 'Rerun a workflow',
          children: [
            { kind: 'flag', name: '--failed', desc: 'Only failed jobs' },
            { kind: 'flag', name: '-j, --job <job-id>', desc: 'Specific job' },
            {
              kind: 'flag',
              name: '-d, --debug',
              desc: 'Rerun with debug logging',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh run cancel <run-id>',
          desc: 'Cancel a run',
        },
        {
          kind: 'cmd',
          name: 'gh run delete <run-id>',
          desc: 'Delete a run',
        },
        {
          kind: 'cmd',
          name: 'gh run download <run-id>',
          desc: 'Download artifacts',
          children: [
            {
              kind: 'flag',
              name: '-n, --name <strings>',
              desc: 'Artifact names',
            },
            {
              kind: 'flag',
              name: '-p, --pattern <globs>',
              desc: 'Glob patterns',
            },
            {
              kind: 'flag',
              name: '-D, --dir <dir>',
              desc: 'Download directory',
            },
          ],
        },
      ],
    },
    {
      title: 'workflow — Manage workflows',
      items: [
        {
          kind: 'cmd',
          name: 'gh workflow list',
          desc: 'List workflows',
          children: [
            { kind: 'flag', name: '-a, --all', desc: 'Include disabled' },
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max workflows (default 50)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh workflow view <id|name>',
          desc: 'View a workflow',
          children: [
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
            { kind: 'flag', name: '-y, --yaml', desc: 'View YAML source' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh workflow run <id|name>',
          desc: 'Trigger a workflow',
          children: [
            {
              kind: 'flag',
              name: '-r, --ref <branch|tag>',
              desc: 'Branch or tag',
            },
            {
              kind: 'flag',
              name: '-F, --field <key=value>',
              desc: 'Typed input parameter',
            },
            {
              kind: 'flag',
              name: '-f, --raw-field <key=value>',
              desc: 'String input parameter',
            },
            {
              kind: 'flag',
              name: '--json',
              desc: 'Read inputs as JSON from stdin',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh workflow enable <id|name>',
          desc: 'Enable a workflow',
        },
        {
          kind: 'cmd',
          name: 'gh workflow disable <id|name>',
          desc: 'Disable a workflow',
        },
      ],
    },
    {
      title: 'cache — Manage Actions caches',
      items: [
        {
          kind: 'cmd',
          name: 'gh cache list',
          desc: 'List caches',
          children: [
            {
              kind: 'flag',
              name: '-k, --key <prefix>',
              desc: 'Filter by key prefix',
            },
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max caches (default 30)',
            },
            { kind: 'flag', name: '-S, --sort <field>', desc: 'Sort by field' },
            { kind: 'flag', name: '-O, --order <asc|desc>', desc: 'Order' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh cache delete <id|key>',
          desc: 'Delete caches',
          children: [
            { kind: 'flag', name: '-a, --all', desc: 'Delete all caches' },
            { kind: 'flag', name: '-r, --ref <ref>', desc: 'Delete by ref' },
          ],
        },
      ],
    },
  ],
};
