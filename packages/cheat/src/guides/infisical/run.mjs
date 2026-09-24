export const run = {
  name: 'run',
  description: 'Inject secrets into a process',
  sections: [
    {
      title: 'run — Inject secrets into processes',
      items: [
        {
          kind: 'cmd',
          name: 'infisical run -- <command>',
          desc: 'Run with injected env vars',
          children: [
            {
              kind: 'flag',
              name: '-e, --env <env>',
              desc: 'Environment (default: dev)',
            },
            {
              kind: 'flag',
              name: '-c, --command <cmd>',
              desc: 'Chained command string',
            },
            {
              kind: 'flag',
              name: '--path <path>',
              desc: 'Folder path (default: /)',
            },
            { kind: 'flag', name: '--recursive', desc: 'Include sub-folders' },
            {
              kind: 'flag',
              name: '--expand',
              desc: 'Expand variables (default: true)',
            },
            {
              kind: 'flag',
              name: '--include-imports',
              desc: 'Include linked secrets (default: true)',
            },
            {
              kind: 'flag',
              name: '--secret-overriding',
              desc: 'Personal > shared (default: true)',
            },
            {
              kind: 'flag',
              name: '-t, --tags <slugs>',
              desc: 'Filter by tags',
            },
            { kind: 'flag', name: '--token <token>', desc: 'Access token' },
            { kind: 'flag', name: '--projectId <id>', desc: 'Project ID' },
            {
              kind: 'flag',
              name: '--project-config-dir <dir>',
              desc: '.infisical.json directory',
            },
            { kind: 'flag', name: '--watch', desc: 'Reload on secret changes' },
            {
              kind: 'flag',
              name: '--watch-interval <secs>',
              desc: 'Check interval (default: 10)',
            },
          ],
        },
      ],
    },
  ],
};
